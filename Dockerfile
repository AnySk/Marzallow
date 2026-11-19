ARG PYTHON_VERSION=3.13
ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# Dashboard: built here so compiled assets never need to live in git.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS dashboard
WORKDIR /dashboard
COPY app/dashboard/package.json app/dashboard/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/dashboard/ ./
RUN VITE_BASE_API=/api/ npm run build -- --outDir build --assetsDir statics \
    && cp build/index.html build/404.html

# ---------------------------------------------------------------------------
# Xray core: pinned release, verified against its published SHA-256 digest.
# Bump XRAY_VERSION together with both checksums (from the release's
# Xray-linux-*.zip.dgst files).
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS xray
ARG TARGETARCH
ARG XRAY_VERSION=v26.10.31
ARG XRAY_SHA256_AMD64=e4bd9119f50ae7c41658b1abd0679ae06f98bd864a2907ff33f2f2cf7081b214
ARG XRAY_SHA256_ARM64=1811c8f1da0c3b6dc707ebaf1c8390e987ba39859a8f0a7aadd8526157f2ec8d
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) asset=Xray-linux-64.zip;        sha="${XRAY_SHA256_AMD64}" ;; \
      arm64) asset=Xray-linux-arm64-v8a.zip; sha="${XRAY_SHA256_ARM64}" ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/xray.zip "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/${asset}"; \
    echo "${sha}  /tmp/xray.zip" | sha256sum -c -; \
    mkdir -p /out/bin /out/share/xray; \
    unzip -q /tmp/xray.zip -d /tmp/xray; \
    install -m 755 /tmp/xray/xray /out/bin/xray; \
    cp /tmp/xray/geoip.dat /tmp/xray/geosite.dat /out/share/xray/

# ---------------------------------------------------------------------------
# Python dependencies from uv.lock (hash-verified).
# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS python-deps
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /usr/local/bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /code
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ---------------------------------------------------------------------------
# Runtime image
# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim
ENV PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH
WORKDIR /code

COPY --from=python-deps /opt/venv /opt/venv
COPY --from=xray /out/bin/xray /usr/local/bin/xray
COPY --from=xray /out/share/xray /usr/local/share/xray
COPY . /code
COPY --from=dashboard /dashboard/build /code/app/dashboard/build

RUN ln -s /code/marzban-cli.py /usr/bin/marzban-cli \
    && chmod +x /usr/bin/marzban-cli \
    && marzban-cli completion install --shell bash

CMD ["bash", "-c", "alembic upgrade head; python main.py"]
