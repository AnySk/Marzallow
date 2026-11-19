# Dashboard

React + Chakra UI admin dashboard for the panel, built with Vite. It is served by the backend at
`/dashboard/` from `app/dashboard/build` (built by the Docker image or `../../build_dashboard.sh`).

## Requirements

Node.js 22+ (Vite 8 needs 20.19 or newer).

## Development

The easiest way is to set `DEBUG=true` in the backend's `.env` and run `uv run python main.py`: the backend then
starts this dev server on port 3000 and allows it through CORS.

To run the dev server against some other backend:

```bash
npm ci
cp example.env .env        # set VITE_BASE_API, e.g. http://127.0.0.1:8000/api/
npm run dev
```

The backend must list the dev server's origin in `ALLOWED_ORIGINS`.

| Variable | Description |
| --- | --- |
| VITE_BASE_API | Base URL of the backend API (default in production builds: `/api/`) |

## Build

```bash
npm run build              # type-check + production build
ANALYZE=1 npm run build    # also writes stats.html (bundle treemap)
```

## Notes

- UI strings live in `src/locales/en.json` (English only).
- Server state uses TanStack Query; local UI state uses zustand stores in `src/contexts`.
