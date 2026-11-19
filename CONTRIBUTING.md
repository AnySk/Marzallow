# Contributing

This is a personal fork of [Marzban](https://github.com/Gozargah/Marzban). Issues and pull requests are welcome.
For questions about upstream features, see the upstream project.

## Setup

```bash
uv sync --frozen                 # Python deps + dev tools into .venv
cd app/dashboard && npm ci       # dashboard deps
```

Run the backend with `DEBUG=true` in `.env` and `uv run python main.py`. Debug mode starts the Vite dev server
(port 3000) with hot reload and enables API auto-reload.

## Before opening a pull request

- `uv run pytest` passes. Add tests under `tests/` for bug fixes and new endpoints.
- `npm run build` in `app/dashboard` passes (it type-checks first).
- Dependency changes go through `pyproject.toml` + `uv lock` (Python) or `npm install` (dashboard), never by
  hand-editing lockfiles.
- Database changes come with an Alembic migration:
  `uv run alembic revision --autogenerate -m "describe the change"`.
- UI text goes in `app/dashboard/src/locales/en.json`; the dashboard is English-only.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) (`fix: …`, `feat: …`, `chore: …`).
