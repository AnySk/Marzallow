"""Run this server as a node: `python -m node` (or `python main.py node`)."""
import logging
import os
import ssl
import sys

import uvicorn

from node import settings
from node.certificate import ensure_certificate
from node.core import XRayCore
from node.service import NodeService, create_app

logger = logging.getLogger("uvicorn.error")


def main() -> int:
    logging.basicConfig(level=logging.DEBUG if settings.DEBUG else logging.INFO,
                        format="%(levelname)s:     %(message)s")

    if settings.SERVICE_PROTOCOL != "rest":
        logger.error(f"SERVICE_PROTOCOL={settings.SERVICE_PROTOCOL!r} isn't supported; "
                     "Marzallow nodes only speak the REST protocol (the default).")
        return 1

    if ensure_certificate(settings.SSL_CERT_FILE, settings.SSL_KEY_FILE):
        logger.info(f"Generated the node certificate {settings.SSL_CERT_FILE}")

    if not os.path.isfile(settings.SSL_CLIENT_CERT_FILE):
        logger.error(
            f"The panel's certificate isn't at {settings.SSL_CLIENT_CERT_FILE} (SSL_CLIENT_CERT_FILE). "
            "In the dashboard open Nodes, download the certificate and save it there; only a panel "
            "holding that certificate can control this node.")
        return 1

    try:
        core = XRayCore(settings.XRAY_EXECUTABLE_PATH, settings.XRAY_ASSETS_PATH, debug=settings.DEBUG)
    except Exception as exc:
        logger.error(f"Can't run Xray at {settings.XRAY_EXECUTABLE_PATH} (XRAY_EXECUTABLE_PATH): {exc}")
        return 1

    service = NodeService(core, api_host=settings.XRAY_API_HOST, api_port=settings.XRAY_API_PORT,
                          ssl_cert_file=settings.SSL_CERT_FILE, ssl_key_file=settings.SSL_KEY_FILE,
                          inbounds=settings.INBOUNDS)
    logger.info(f"Marzallow node with Xray {core.version} on :{settings.SERVICE_PORT}, "
                f"Xray API on :{settings.XRAY_API_PORT}")
    uvicorn.run(
        create_app(service),
        host=settings.SERVICE_HOST,
        port=settings.SERVICE_PORT,
        ssl_keyfile=settings.SSL_KEY_FILE,
        ssl_certfile=settings.SSL_CERT_FILE,
        ssl_ca_certs=settings.SSL_CLIENT_CERT_FILE,
        ssl_cert_reqs=ssl.CERT_REQUIRED,  # only the panel (with its certificate) may connect
        log_level=logging.DEBUG if settings.DEBUG else logging.INFO,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
