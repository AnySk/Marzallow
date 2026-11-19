# MarzbanV2

A proxy management panel for [Xray-core](https://github.com/XTLS/Xray-core): create users with VLESS, VMess,
Trojan and Shadowsocks proxies, enforce traffic and expiry limits, and hand out subscription links that work
with V2RayNG, V2RayN, Streisand, Happ, sing-box, Clash and other clients.

This is a personal fork of [Marzban](https://github.com/Gozargah/Marzban) by Gozargah, maintained independently.

## Differences from upstream Marzban

- **Up-to-date, audited dependencies.** Python deps are locked in `uv.lock` (hash-verified); CI fails on any
  known vulnerability in Python or dashboard dependencies, and Dependabot keeps them current.
- **Reproducible Docker image.** The dashboard is built inside the image and Xray is installed from a pinned
  release verified against its SHA-256 checksum, instead of running a remote install script.
- **Test suite.** `pytest` runs the real app against a stub Xray binary and a migrated database.
- **English only.** Other UI languages were removed.
- **Safer defaults.** CORS is same-origin unless `ALLOWED_ORIGINS` is set, and credentials are never allowed
  cross-origin.
- **Fixes**, including:
  - API-created users without an explicit `inbounds` field got an empty subscription.
  - Deleting a user owned by the `.env` sudo admin returned a 500 error.
- **Lighter dashboard.** The login page loads about half the JavaScript it used to; the JSON editor and charts
  load on demand.

## Features

- Web UI and a full REST API
- [Multiple nodes](#nodes) for distributing traffic across servers
- VMess, VLESS, Trojan and Shadowsocks; several protocols per user and many users per inbound
- Multiple inbounds on one port (fallbacks), TLS and REALITY
- Traffic and expiry limits, periodic (daily/weekly/monthly/yearly) usage resets, "on hold" users
- Subscription links for V2Ray-based clients, sing-box, Clash/Clash Meta and Outline, with share links and QR codes
- System and traffic statistics
- Telegram bot, webhook notifications and a command-line interface
- Multiple admins

## Installation

### Docker (recommended)

Images are published to GitHub Container Registry for `linux/amd64` and `linux/arm64`.

```bash
sudo mkdir -p /opt/marzban /var/lib/marzban
cd /opt/marzban
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/AnySk/MarzbanV2/master/docker-compose.yml
curl -fsSLo .env https://raw.githubusercontent.com/AnySk/MarzbanV2/master/.env.example
curl -fsSLo /var/lib/marzban/xray_config.json https://raw.githubusercontent.com/AnySk/MarzbanV2/master/xray_config.json
nano .env   # see Configuration below
docker compose up -d
```

The container stores its data in `/var/lib/marzban`. Point `XRAY_JSON` and `SQLALCHEMY_DATABASE_URL` there in
`.env`, for example `XRAY_JSON=/var/lib/marzban/xray_config.json` and
`SQLALCHEMY_DATABASE_URL=sqlite:////var/lib/marzban/db.sqlite3`.

Create the first admin:

```bash
docker compose exec marzban marzban-cli admin create --sudo
```

> **Upstream's `marzban.sh` installer:** it installs upstream's image by default. To use this fork with it, set
> `image: ghcr.io/anysk/marzbanv2:latest` in `/opt/marzban/docker-compose.yml`.

### From source

Requirements: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js 22+ (for the dashboard) and Xray-core
(for example via [Xray-install](https://github.com/XTLS/Xray-install)).

```bash
git clone https://github.com/AnySk/MarzbanV2.git
cd MarzbanV2
uv sync --frozen --no-dev            # Python dependencies from uv.lock into .venv
(cd app/dashboard && npm ci)         # dashboard dependencies
./build_dashboard.sh                 # build the dashboard into app/dashboard/build
cp .env.example .env && nano .env
uv run alembic upgrade head          # create / migrate the database
uv run python main.py
```

If the dashboard hasn't been built, the app builds it on first start (this needs `npm ci` first).

To use the CLI from anywhere:

```bash
sudo ln -s "$(pwd)/marzban-cli.py" /usr/bin/marzban-cli
sudo chmod +x /usr/bin/marzban-cli
marzban-cli completion install
```

`install_service.sh` creates a systemd unit that runs `main.py` from the current directory with the project's
`.venv`.

### TLS

Without `UVICORN_SSL_CERTFILE`/`UVICORN_SSL_KEYFILE` the panel only listens on `127.0.0.1`. Either provide a
certificate or put it behind a reverse proxy (Nginx, Caddy) that terminates TLS. The dashboard is served at
`/dashboard/`.

## Development

```bash
uv sync --frozen                     # includes dev tools (pytest, httpx, grpcio-tools)
uv run pytest                        # backend test suite
cd app/dashboard
npm ci
npm run dev                          # Vite dev server on :3000 (run the backend with DEBUG=true)
npm run build                        # type-check + production build
ANALYZE=1 npm run build              # also writes stats.html with a bundle treemap
```

- Add or upgrade a Python dependency: edit `pyproject.toml`, then run `uv lock`.
- Regenerate the Xray gRPC bindings: `uv run python xray_api/proto/compile.py`.
- Bump Xray in the Docker image: update `XRAY_VERSION` and both `XRAY_SHA256_*` args in the `Dockerfile`, using
  the values from the release's `Xray-linux-*.zip.dgst` files.

### Releases

Pushing a tag `vX.Y.Z` runs CI and publishes `ghcr.io/anysk/marzbanv2:X.Y.Z`, `:X.Y` and `:latest`. Pushes to
the `dev` branch publish `:dev`.

## Configuration

Settings come from environment variables or a `.env` file in the working directory.

| Variable | Description |
| --- | --- |
| SUDO_USERNAME | Superuser username (prefer creating admins with `marzban-cli admin create`) |
| SUDO_PASSWORD | Superuser password |
| SQLALCHEMY_DATABASE_URL | Database URL ([SQLAlchemy docs](https://docs.sqlalchemy.org/en/20/core/engines.html#database-urls)); SQLite, MySQL and MariaDB are supported |
| UVICORN_HOST | Bind host (default: `0.0.0.0`; only used with TLS) |
| UVICORN_PORT | Bind port (default: `8000`) |
| UVICORN_UDS | Bind to a UNIX domain socket instead |
| UVICORN_SSL_CERTFILE | TLS certificate file |
| UVICORN_SSL_KEYFILE | TLS key file |
| UVICORN_SSL_CA_TYPE | `public` (default) or `private` for a self-signed CA (testing only) |
| ALLOWED_ORIGINS | Comma-separated browser origins allowed to call the API; empty (default) means same-origin only |
| DASHBOARD_PATH | Dashboard URL path (default: `/dashboard/`) |
| XRAY_JSON | Path to the Xray JSON config (default: `./xray_config.json`) |
| XRAY_EXECUTABLE_PATH | Path to the Xray binary (default: `/usr/local/bin/xray`) |
| XRAY_ASSETS_PATH | Path to Xray assets (default: `/usr/local/share/xray`) |
| XRAY_SUBSCRIPTION_URL_PREFIX | Prefix for subscription URLs, e.g. `https://sub.example.com` |
| XRAY_SUBSCRIPTION_PATH | Subscription URL path (default: `sub`) |
| XRAY_FALLBACKS_INBOUND_TAG | Tag of the inbound that holds fallbacks, if you use them |
| XRAY_EXCLUDE_INBOUND_TAGS | Space-separated tags of inbounds the panel should not manage |
| CUSTOM_TEMPLATES_DIRECTORY | Directory with customized templates (default: `app/templates`) |
| SUBSCRIPTION_PAGE_TEMPLATE | Subscription info page template (default: `subscription/index.html`) |
| HOME_PAGE_TEMPLATE | Decoy home page template (default: `home/index.html`) |
| CLASH_SUBSCRIPTION_TEMPLATE | Clash config template (default: `clash/default.yml`) |
| SINGBOX_SUBSCRIPTION_TEMPLATE | sing-box config template (default: `singbox/default.json`) |
| V2RAY_SUBSCRIPTION_TEMPLATE | V2Ray JSON config template (default: `v2ray/default.json`) |
| USE_CUSTOM_JSON_DEFAULT | Serve V2Ray JSON configs to every supported client (default: `False`) |
| USE_CUSTOM_JSON_FOR_V2RAYN | …only for V2RayN (default: `False`) |
| USE_CUSTOM_JSON_FOR_V2RAYNG | …only for V2RayNG (default: `False`) |
| USE_CUSTOM_JSON_FOR_STREISAND | …only for Streisand (default: `False`) |
| USE_CUSTOM_JSON_FOR_HAPP | …only for Happ (default: `False`) |
| TELEGRAM_API_TOKEN | Telegram bot token (from [@BotFather](https://t.me/botfather)) |
| TELEGRAM_ADMIN_ID | Comma-separated numeric Telegram IDs of bot admins |
| TELEGRAM_PROXY_URL | Proxy for the Telegram bot |
| JWT_ACCESS_TOKEN_EXPIRE_MINUTES | Admin token lifetime in minutes, `0` = never expires (default: `1440`) |
| DOCS | Serve API docs at `/docs` and `/redoc` (default: `False`) |
| DEBUG | Development mode: runs the Vite dev server and auto-reload (default: `False`) |
| WEBHOOK_ADDRESS | URL to POST notifications to (enables webhooks) |
| WEBHOOK_SECRET | Sent as the `x-webhook-secret` header |
| NUMBER_OF_RECURRENT_NOTIFICATIONS | Retries for a failed notification (default: `3`) |
| RECURRENT_NOTIFICATIONS_TIMEOUT | Seconds between retries (default: `180`) |
| NOTIFY_REACHED_USAGE_PERCENT | Usage percentage that triggers a warning (default: `80`) |
| NOTIFY_DAYS_LEFT | Days before expiry that trigger a warning (default: `3`) |
| USERS_AUTODELETE_DAYS | Delete expired users after this many days; negative disables (default: `-1`) |
| USER_AUTODELETE_INCLUDE_LIMITED_ACCOUNTS | Also auto-delete limited users (default: `False`) |

See `.env.example` for the full list, including the Discord webhook settings.

## API

The REST API lives under `/api`. Set `DOCS=True` to browse it in Swagger UI (`/docs`) or ReDoc (`/redoc`).
Authenticate with `POST /api/admin/token` and send the token as `Authorization: Bearer <token>`.

## Telegram bot

Set `TELEGRAM_API_TOKEN` and `TELEGRAM_ADMIN_ID` to manage users and receive notifications from Telegram.

## CLI

`marzban-cli` manages admins, users and subscriptions from the shell. See [cli/README.md](./cli/README.md).

## Nodes

[Marzban-node](https://github.com/Gozargah/Marzban-node) runs Xray on additional servers that this panel
controls, so users can connect through several locations. Add nodes from the dashboard's **Node Settings**.

## Webhook notifications

When `WEBHOOK_ADDRESS` is set, the panel POSTs JSON events to it with `WEBHOOK_SECRET` in the
`x-webhook-secret` header:

```json
{"username": "alice", "action": "user_updated", "enqueued_at": 1680506457.636369, "tries": 0}
```

Actions: `user_created`, `user_updated`, `user_deleted`, `user_limited`, `user_expired`, `user_disabled`,
`user_enabled`, `data_usage_reset`, `data_reset_by_next`, `subscription_revoked`, `reached_usage_percent`, `reached_days_left`.

## Backup

Back up the data directory (`/var/lib/marzban` for Docker), your `.env` and your Xray config. For MySQL or
MariaDB, also take regular database dumps.

## License

[AGPL-3.0](./LICENSE). Based on [Marzban](https://github.com/Gozargah/Marzban), © Gozargah organization.
