# Marzallow

A web panel for running [Xray-core](https://github.com/XTLS/Xray-core) proxies. Create users on VLESS, VMess,
Trojan and Shadowsocks, give each one a traffic and time limit, and hand out subscription links that work in
V2RayNG, V2RayN, Streisand, Happ, sing-box, Clash and other clients.

Marzallow is a fork of [Marzban](https://github.com/Gozargah/Marzban) by Gozargah. It reads Marzban's database
and data directory, so an existing Marzban install can switch to it in place.

- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Coming from Marzban](#coming-from-marzban)
- [Integrations](#integrations): API, Telegram, CLI, nodes, webhooks
- [Development](#development)

## Features

**Users and subscriptions**
- Traffic and expiry limits, periodic usage resets (daily, weekly, monthly, yearly) and "on hold" users whose
  time starts at first connection.
- Several protocols per user and many users per inbound; fallbacks, TLS and REALITY.
- Subscription links for V2Ray-based clients, sing-box, Clash/Clash Meta and Outline, plus share links and QR
  codes. Each user's link stays the same until you revoke it.
- Multiple admins, each managing their own users, and multiple [nodes](#nodes) to spread traffic over servers.

**Dashboard**
- Bulk actions: disable, enable, extend, add data, reset usage, revoke and delete many users at once.
- Quick filters (expiring soon, over 80 % used, online now, by owner), CSV export, a traffic chart with top
  users, and alerts for users about to run out and for disconnected nodes.
- Templates, admin management, next plans and cleanup of expired users, all without the CLI.
- A Settings page for notifications, webhooks, subscription headers, auto-delete and login security. Changes
  apply immediately, without editing `.env` or restarting.
- An Xray config editor that knows Xray's format: autocompletion, warnings for unknown fields and invalid
  values, docs on hover, and a side panel with pickers for the fields of the object under the cursor.

**Under the hood**
- Works with current Xray (26.x): REALITY keys, the new `password` field and certificate pinning
  (`pcs`/`vcn`) are handled.
- SQLite, MySQL/MariaDB and PostgreSQL, all covered by the test suite.
- Login brute-force protection, same-origin CORS by default, revocable tokens for the `.env` sudo admin.
- Locked, audited dependencies and a reproducible Docker image with a checksum-verified Xray build.
- Dozens of bugs reported against upstream fixed; see the commit history for details.

## Installation

### Docker (recommended)

Images for `linux/amd64` and `linux/arm64` are published to the GitHub Container Registry.

```bash
sudo mkdir -p /opt/marzallow /var/lib/marzban
cd /opt/marzallow
base=https://raw.githubusercontent.com/AnySk/Marzallow/master
curl -fsSLo docker-compose.yml $base/docker-compose.yml
curl -fsSLo .env $base/.env.example
curl -fsSLo /var/lib/marzban/xray_config.json $base/xray_config.json
nano .env
docker compose up -d
docker compose exec marzallow marzallow-cli admin create --sudo
```

In `.env`, point the panel at the data directory, for example
`XRAY_JSON=/var/lib/marzban/xray_config.json` and
`SQLALCHEMY_DATABASE_URL=sqlite:////var/lib/marzban/db.sqlite3`.

The dashboard is at `https://<your-domain>:8000/dashboard/`. Without a certificate the panel only listens on
`127.0.0.1`; see [TLS](#tls).

### From source

Requires Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js 22+ and Xray-core (for example via
[Xray-install](https://github.com/XTLS/Xray-install)).

```bash
git clone https://github.com/AnySk/Marzallow.git
cd Marzallow
uv sync --frozen --no-dev
(cd app/dashboard && npm ci) && ./build_dashboard.sh
cp .env.example .env && nano .env
uv run alembic upgrade head
uv run python main.py
```

`install_service.sh` installs a systemd unit that runs the panel from this directory. To put the CLI on your
`PATH`:

```bash
sudo ln -s "$(pwd)/marzallow-cli.py" /usr/bin/marzallow-cli
marzallow-cli completion install
```

### TLS

Set `UVICORN_SSL_CERTFILE` and `UVICORN_SSL_KEYFILE`, or put the panel behind a reverse proxy (Nginx, Caddy)
that terminates TLS. Behind a proxy, also set `FORWARDED_ALLOW_IPS` so login lockouts see the real client IP.

## Configuration

Settings come from environment variables or a `.env` file; `.env.example` lists all of them with comments.
Sudo admins can also change notification, webhook, subscription, auto-delete and login-security settings under
**Settings** in the dashboard. Those are stored in the database and override `.env`.

The ones you'll most likely need:

| Variable | Description |
| --- | --- |
| `SUDO_USERNAME`, `SUDO_PASSWORD` | Built-in superuser (creating admins with `marzallow-cli admin create` is preferred) |
| `SQLALCHEMY_DATABASE_URL` | Database URL; SQLite, `mysql+pymysql://…` or `postgresql://…` |
| `UVICORN_HOST`, `UVICORN_PORT` | Bind address (default `0.0.0.0:8000`, `127.0.0.1` without TLS) |
| `UVICORN_UDS` | Listen on a UNIX socket instead |
| `UVICORN_SSL_CERTFILE`, `UVICORN_SSL_KEYFILE` | TLS certificate and key |
| `DASHBOARD_PATH` | Dashboard path (default `/dashboard/`) |
| `XRAY_JSON` | Xray config file (default `./xray_config.json`) |
| `XRAY_EXECUTABLE_PATH`, `XRAY_ASSETS_PATH` | Xray binary and geo files |
| `XRAY_SUBSCRIPTION_URL_PREFIX` | Public base URL for subscription links, e.g. `https://sub.example.com` |
| `XRAY_SUBSCRIPTION_PATH` | Subscription path (default `sub`) |
| `ALLOWED_ORIGINS` | Extra browser origins allowed to call the API (default: same origin only) |
| `FORWARDED_ALLOW_IPS` | Reverse proxies whose `X-Forwarded-For` is trusted (default `127.0.0.1`) |
| `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCKOUT_SECONDS` | Login lockout (default 5 attempts, 15 minutes) |
| `TELEGRAM_API_TOKEN`, `TELEGRAM_ADMIN_ID` | Telegram bot token and admin IDs |
| `WEBHOOK_ADDRESS`, `WEBHOOK_SECRET` | Webhook for notifications |
| `USERS_AUTODELETE_DAYS` | Delete expired users after N days (`-1` disables) |
| `CUSTOM_TEMPLATES_DIRECTORY` | Your own subscription, Clash, sing-box and V2Ray templates ([guide](./app/templates/v2ray/README.md)) |
| `DOCS` | Serve API docs at `/docs` and `/redoc` |

## Coming from Marzban

Stop Marzban, back up `/var/lib/marzban` and `.env`, switch the image to `ghcr.io/anysk/marzallow:latest` (or
check out this repository), and start it. Migrations run automatically in Docker; from source run
`uv run alembic upgrade head`. Then note:

- The `.env` sudo admin has to log in again: their tokens are now invalidated when `SUDO_PASSWORD` changes.
- Each user keeps one stable subscription link until it's revoked. Old links keep working.
- `next_plan.add_remaining_traffic` was inverted upstream; `true` now really adds the remaining traffic.
- Xray 26.2+ clients reject "Allow insecure". Use a host's pinned certificate SHA-256 instead.
- `marzban-cli` and `MARZBAN_ADMIN_PASSWORD` still work as aliases for `marzallow-cli` and
  `MARZALLOW_ADMIN_PASSWORD`.

## Integrations

### API

The REST API lives under `/api`. Get a token with `POST /api/admin/token` and send it as
`Authorization: Bearer <token>`. Set `DOCS=True` to browse it at `/docs`.

### Telegram

Set `TELEGRAM_API_TOKEN` and `TELEGRAM_ADMIN_ID` to manage users and get notifications in Telegram.

### CLI

`marzallow-cli` manages admins, users and subscriptions from the shell; see [cli/README.md](./cli/README.md).

### Nodes

[Marzban-node](https://github.com/Gozargah/Marzban-node) runs Xray on extra servers controlled by this panel.
Add them in the dashboard under **Nodes**.

### Webhooks

With `WEBHOOK_ADDRESS` set, the panel POSTs JSON events with `WEBHOOK_SECRET` in the `x-webhook-secret` header:

```json
{"username": "alice", "action": "user_updated", "enqueued_at": 1680506457.636369, "tries": 0}
```

Actions: `user_created`, `user_updated`, `user_deleted`, `user_limited`, `user_expired`, `user_disabled`,
`user_enabled`, `data_usage_reset`, `data_reset_by_next`, `subscription_revoked`, `reached_usage_percent`,
`reached_days_left`.

## Development

```bash
uv sync --frozen          # with dev tools
uv run pytest             # backend tests (SQLite; set TEST_DATABASE_URL for MySQL/PostgreSQL)
cd app/dashboard
npm ci
npm run dev               # Vite on :3000; run the backend with DEBUG=true
npm run build             # type-check and build
```

- Python dependencies: edit `pyproject.toml`, then `uv lock`.
- Xray gRPC bindings: `uv run python xray_api/proto/compile.py`.
- New Xray version: update `XRAY_VERSION` and the two `XRAY_SHA256_*` values in the `Dockerfile`, and
  regenerate `app/dashboard/src/components/CoreConfigEditor/xray-schema.json` for the config editor.
- Releases: pushing a tag `vX.Y.Z` publishes `ghcr.io/anysk/marzallow:X.Y.Z`, `:X.Y` and `:latest`; pushes to
  `dev` publish `:dev`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## Backup

Back up the data directory (`/var/lib/marzban` in Docker), `.env` and your Xray config. With MySQL or
PostgreSQL, also dump the database regularly.

## License

[AGPL-3.0](./LICENSE). Based on [Marzban](https://github.com/Gozargah/Marzban), © Gozargah.
