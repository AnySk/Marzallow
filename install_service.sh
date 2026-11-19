#!/bin/bash

SERVICE_NAME="marzallow"
SERVICE_DESCRIPTION="Marzallow panel"
SERVICE_DOCUMENTATION="https://github.com/AnySk/Marzallow"
MAIN_PY_PATH="$PWD/main.py"
PYTHON="$PWD/.venv/bin/python"

if [ ! -x "$PYTHON" ]; then
    echo "No virtualenv found at $PWD/.venv - run 'uv sync --frozen --no-dev' first." >&2
    exit 1
fi
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

# Create the service file
cat > $SERVICE_FILE <<EOF
[Unit]
Description=$SERVICE_DESCRIPTION
Documentation=$SERVICE_DOCUMENTATION
After=network.target nss-lookup.target

[Service]
ExecStart=$PYTHON $MAIN_PY_PATH
Restart=on-failure
WorkingDirectory=$PWD

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo "Service file created at: $SERVICE_FILE"
