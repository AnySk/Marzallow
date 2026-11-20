"""Runs the Xray process and collects its output.

Shared by the panel (app/xray/core.py) and the node service, so it must not
import anything from `app`.
"""
import atexit
import logging
import re
import subprocess
import threading
from collections import deque
from contextlib import contextmanager

default_logger = logging.getLogger("uvicorn.error")


class XRayCore:
    def __init__(self,
                 executable_path: str = "/usr/bin/xray",
                 assets_path: str = "/usr/share/xray",
                 logger: logging.Logger = default_logger,
                 debug: bool = False):
        self.executable_path = executable_path
        self.assets_path = assets_path
        self.logger = logger
        self.debug = debug

        self.version = self.get_version()
        self.process = None
        self.running_config = None  # the config the current process was started with
        self._restart_lock = threading.Lock()

        self._logs_buffer = deque(maxlen=100)
        self._temp_log_buffers = {}
        self._on_start_funcs = []
        self._on_stop_funcs = []
        self._env = {
            "XRAY_LOCATION_ASSET": assets_path
        }

        atexit.register(lambda: self.stop() if self.started else None)

    def get_version(self):
        cmd = [self.executable_path, "version"]
        output = subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode('utf-8')
        m = re.match(r'^Xray (\d+\.\d+\.\d+)', output)
        if m:
            return m.groups()[0]

    def _capture_process_logs(self, process: subprocess.Popen):
        # The process is passed in (not read from self.process) so a restart
        # can't make this thread read the new process' pipe.
        def capture():
            for output in iter(process.stdout.readline, ''):
                output = output.strip()
                self._logs_buffer.append(output)
                for buf in list(self._temp_log_buffers.values()):
                    buf.append(output)
                if self.debug:
                    self.logger.debug(output)

        threading.Thread(target=capture, daemon=True).start()

    @contextmanager
    def get_logs(self):
        buf = deque(self._logs_buffer, maxlen=100)
        buf_id = id(buf)
        try:
            self._temp_log_buffers[buf_id] = buf
            yield buf
        finally:
            del self._temp_log_buffers[buf_id]
            del buf

    @property
    def started(self):
        if not self.process:
            return False

        if self.process.poll() is None:
            return True

        return False

    def start(self, config: dict):
        """Start xray with `config` (a dict with a `to_json()` method, like XRayConfig)."""
        if self.started is True:
            raise RuntimeError("Xray is started already")
        self.running_config = config

        # the log capture (used by the dashboard's logs view) needs warnings
        log = config.get('log', {})
        for key in ('loglevel', 'logLevel'):
            if log.get(key) in ('none', 'error'):
                log[key] = 'warning'

        cmd = [
            self.executable_path,
            "run",
            '-config',
            'stdin:'
        ]
        self.process = subprocess.Popen(
            cmd,
            env=self._env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            # Merge stderr into stdout: a separate, never-read stderr pipe fills
            # up and blocks xray once it logs enough errors.
            stderr=subprocess.STDOUT,
            universal_newlines=True
        )
        self.process.stdin.write(config.to_json())
        self.process.stdin.flush()
        self.process.stdin.close()
        self.logger.warning(f"Xray core {self.version} started")

        self._capture_process_logs(self.process)

        # execute on start functions
        for func in self._on_start_funcs:
            threading.Thread(target=func).start()

    def stop(self):
        if not self.started:
            return

        process, self.process = self.process, None
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        self.logger.warning("Xray core stopped")

        # execute on stop functions
        for func in self._on_stop_funcs:
            threading.Thread(target=func).start()

    @property
    def restarting(self) -> bool:
        return self._restart_lock.locked()

    def restart(self, config: dict):
        if not self._restart_lock.acquire(blocking=False):
            return  # another restart is already in progress
        try:
            self.logger.warning("Restarting Xray core...")
            self.stop()
            self.start(config)
        finally:
            self._restart_lock.release()

    def on_start(self, func: callable):
        self._on_start_funcs.append(func)
        return func

    def on_stop(self, func: callable):
        self._on_stop_funcs.append(func)
        return func
