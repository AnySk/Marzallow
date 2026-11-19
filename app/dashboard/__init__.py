import atexit
import os
import subprocess
from pathlib import Path

from app import app, logger, on_startup
from config import DEBUG, VITE_BASE_API, DASHBOARD_PATH
from fastapi.staticfiles import StaticFiles

base_dir = Path(__file__).parent
build_dir = base_dir / 'build'


def build() -> bool:
    try:
        proc = subprocess.Popen(
            ['npm', 'run', 'build', '--',  '--outDir', build_dir, '--assetsDir', 'statics'],
            env={**os.environ, 'VITE_BASE_API': VITE_BASE_API},
            cwd=base_dir
        )
        proc.wait()
    except FileNotFoundError:  # npm isn't installed
        return False
    if proc.returncode != 0 or not (build_dir / 'index.html').is_file():
        return False
    with open(build_dir / 'index.html', 'r') as file:
        html = file.read()
    with open(build_dir / '404.html', 'w') as file:
        file.write(html)
    return True


def run_dev():
    proc = subprocess.Popen(
        ['npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--clearScreen', 'false', '--base', os.path.join(DASHBOARD_PATH, '')],
        env={**os.environ, 'VITE_BASE_API': VITE_BASE_API},
        cwd=base_dir
    )

    atexit.register(proc.terminate)


def run_build():
    if not (build_dir / 'index.html').is_file() and not build():
        # keep the API (and subscriptions) up even without a dashboard
        logger.error(
            "The dashboard isn't built and building it failed, so it won't be served. "
            "Run `npm ci` and `./build_dashboard.sh` in the project directory, then restart."
        )
        return

    # The build uses relative asset URLs, so everything (including statics/)
    # is served below DASHBOARD_PATH; nothing at the site root reveals the panel.
    app.mount(
        DASHBOARD_PATH,
        StaticFiles(directory=build_dir, html=True),
        name="dashboard"
    )


@on_startup
def startup():
    if DEBUG:
        run_dev()
    else:
        run_build()
