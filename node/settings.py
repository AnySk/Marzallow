"""Node settings, read from the environment (or a .env file).

The names and defaults are Marzban-node's, so an existing node's .env, data
directory and certificates work unchanged.
"""
from decouple import config

SERVICE_HOST = config("SERVICE_HOST", default="0.0.0.0")
SERVICE_PORT = config("SERVICE_PORT", cast=int, default=62050)

XRAY_API_HOST = config("XRAY_API_HOST", default="0.0.0.0")
XRAY_API_PORT = config("XRAY_API_PORT", cast=int, default=62051)
XRAY_EXECUTABLE_PATH = config("XRAY_EXECUTABLE_PATH", default="/usr/local/bin/xray")
XRAY_ASSETS_PATH = config("XRAY_ASSETS_PATH", default="/usr/local/share/xray")

SSL_CERT_FILE = config("SSL_CERT_FILE", default="/var/lib/marzban-node/ssl_cert.pem")
SSL_KEY_FILE = config("SSL_KEY_FILE", default="/var/lib/marzban-node/ssl_key.pem")
# the panel's certificate (Nodes -> "Download certificate" in the dashboard)
SSL_CLIENT_CERT_FILE = config("SSL_CLIENT_CERT_FILE", default="/var/lib/marzban-node/ssl_client_cert.pem")

# only run these inbounds (comma-separated tags); empty runs all of them
INBOUNDS = config("INBOUNDS", cast=lambda v: [x.strip() for x in v.split(",") if x.strip()], default="")

DEBUG = config("DEBUG", cast=bool, default=False)

SERVICE_PROTOCOL = config("SERVICE_PROTOCOL", default="rest")
