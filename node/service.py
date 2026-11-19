"""The node's REST service, which the panel uses to run Xray on this server.

It speaks Marzban-node's protocol (app/xray/node.py is the client), so it works
with Marzban and Marzallow panels alike:

- POST /connect starts a session (and takes control from a previous panel);
  every other call carries its `session_id`.
- POST /start and /restart take the panel's Xray config as a JSON string,
  POST /stop stops Xray, POST / and /ping report the state.
- WS /logs streams Xray's output.

The panel then manages users through Xray's gRPC API, which the node exposes on
XRAY_API_PORT with its own certificate (see node/config.py).
"""
import asyncio
import logging
import threading
import time
from typing import Optional, Sequence
from uuid import UUID, uuid4

from fastapi import Body, FastAPI, HTTPException, Request, WebSocket
from starlette.websockets import WebSocketDisconnect

from node.config import NodeXRayConfig
from node.core import XRayCore

logger = logging.getLogger("uvicorn.error")

START_TIMEOUT = 3  # seconds to wait for Xray to report that it started


class NodeService:
    def __init__(self, core: XRayCore, *, api_host: str, api_port: int,
                 ssl_cert_file: str, ssl_key_file: str, inbounds: Sequence[str] = ()):
        self.core = core
        self.api_host = api_host
        self.api_port = api_port
        self.ssl_cert_file = ssl_cert_file
        self.ssl_key_file = ssl_key_file
        self.inbounds = list(inbounds)

        self.connected = False
        self.client_ip: Optional[str] = None
        self.session_id: Optional[UUID] = None
        self._lock = threading.Lock()

    def response(self, **kwargs) -> dict:
        return {
            "connected": self.connected,
            "started": self.core.started,
            "core_version": self.core.version,
            **kwargs,
        }

    def check_session(self, session_id: UUID):
        if session_id != self.session_id:
            raise HTTPException(status_code=403, detail="Session ID mismatch.")

    def connect(self, client_ip: str) -> dict:
        with self._lock:
            if self.connected:
                logger.warning(f"New connection from {client_ip}; the previous panel ({self.client_ip}) "
                               "lost control of this node.")
                self.core.stop()
            self.session_id = uuid4()
            self.client_ip = client_ip
            self.connected = True
            logger.info(f"Panel {client_ip} connected")
            return self.response(session_id=self.session_id)

    def disconnect(self) -> dict:
        with self._lock:
            if self.connected:
                logger.info(f"Panel {self.client_ip} disconnected")
            self.session_id = None
            self.client_ip = None
            self.connected = False
            self.core.stop()
            return self.response()

    def _config(self, config: str) -> NodeXRayConfig:
        try:
            return NodeXRayConfig(config, peer_ip=self.client_ip, api_host=self.api_host,
                                  api_port=self.api_port, ssl_cert_file=self.ssl_cert_file,
                                  ssl_key_file=self.ssl_key_file, inbounds=self.inbounds)
        except (ValueError, TypeError, AttributeError) as exc:
            raise HTTPException(status_code=422, detail={"config": f"Failed to decode config: {exc}"})

    def run(self, config: str, restart: bool) -> dict:
        config = self._config(config)
        with self._lock, self.core.get_logs() as logs:
            logs.clear()
            try:
                if restart:
                    self.core.restart(config)
                else:
                    self.core.start(config)
            except Exception as exc:
                logger.error(f"Failed to {'restart' if restart else 'start'} Xray: {exc}")
                raise HTTPException(status_code=503, detail=str(exc))

            # Xray takes a moment to bind its ports or to fail on a bad config.
            last_log = ""
            deadline = time.monotonic() + START_TIMEOUT
            while time.monotonic() < deadline and self.core.started:
                while logs:
                    line = logs.popleft()
                    last_log = line or last_log
                    if f"Xray {self.core.version} started" in line:
                        return self.response()
                time.sleep(0.1)
            while logs:  # the last words of a process that exited
                last_log = logs.popleft() or last_log

        if not self.core.started:
            raise HTTPException(status_code=503, detail=last_log or "Xray exited")
        return self.response()

    def stop(self) -> dict:
        with self._lock:
            self.core.stop()
            return self.response()

    async def stream_logs(self, websocket: WebSocket):
        try:
            session_id = UUID(websocket.query_params.get("session_id") or "")
        except ValueError:
            return await websocket.close(reason="session_id should be a valid UUID.", code=4400)
        if session_id != self.session_id:
            return await websocket.close(reason="Session ID mismatch.", code=4403)

        interval = websocket.query_params.get("interval")
        if interval:
            try:
                interval = float(interval)
            except ValueError:
                return await websocket.close(reason="Invalid interval value.", code=4400)
            if not 0 < interval <= 10:
                return await websocket.close(reason="Interval must be more than 0 and at most 10 seconds.",
                                             code=4400)

        await websocket.accept()
        cache = ""
        last_sent = 0.0
        with self.core.get_logs() as logs:
            while session_id == self.session_id:
                if interval and cache and time.monotonic() - last_sent >= interval:
                    try:
                        await websocket.send_text(cache)
                    except (WebSocketDisconnect, RuntimeError):
                        break
                    cache = ""
                    last_sent = time.monotonic()

                if not logs:
                    try:
                        message = await asyncio.wait_for(websocket.receive(), timeout=0.2)
                        if message.get("type") == "websocket.disconnect":
                            break
                    except asyncio.TimeoutError:
                        pass
                    except (WebSocketDisconnect, RuntimeError):
                        break
                    continue

                line = logs.popleft()
                if interval:
                    cache += f"{line}\n"
                    continue
                try:
                    await websocket.send_text(line)
                except (WebSocketDisconnect, RuntimeError):
                    break
        try:
            await websocket.close()
        except RuntimeError:
            pass


def create_app(service: NodeService) -> FastAPI:
    app = FastAPI(title="Marzallow node", docs_url=None, redoc_url=None, openapi_url=None)

    @app.post("/")
    def base():
        return service.response()

    @app.post("/connect")
    def connect(request: Request):
        return service.connect(request.client.host)

    @app.post("/disconnect")
    def disconnect():
        return service.disconnect()

    @app.post("/ping")
    def ping(session_id: UUID = Body(embed=True)):
        service.check_session(session_id)
        return {}

    @app.post("/start")
    def start(session_id: UUID = Body(embed=True), config: str = Body(embed=True)):
        service.check_session(session_id)
        return service.run(config, restart=False)

    @app.post("/restart")
    def restart(session_id: UUID = Body(embed=True), config: str = Body(embed=True)):
        service.check_session(session_id)
        return service.run(config, restart=True)

    @app.post("/stop")
    def stop(session_id: UUID = Body(embed=True)):
        service.check_session(session_id)
        return service.stop()

    @app.websocket("/logs")
    async def logs(websocket: WebSocket):
        await service.stream_logs(websocket)

    return app
