import inspect
import logging
from contextlib import asynccontextmanager
from typing import Callable, List

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import ALLOWED_ORIGINS, DEBUG, DOCS, XRAY_SUBSCRIPTION_PATH

__version__ = "0.10.0"

_startup_handlers: List[Callable] = []
_shutdown_handlers: List[Callable] = []


def on_startup(func: Callable) -> Callable:
    """Register a function to run at application startup (in registration order)."""
    _startup_handlers.append(func)
    return func


def on_shutdown(func: Callable) -> Callable:
    """Register a function to run at application shutdown (in registration order)."""
    _shutdown_handlers.append(func)
    return func


async def _run(handlers: List[Callable]) -> None:
    for handler in handlers:
        result = handler()
        if inspect.isawaitable(result):
            await result


@asynccontextmanager
async def lifespan(_app: "FastAPI"):
    await _run(_startup_handlers)
    try:
        yield
    finally:
        await _run(_shutdown_handlers)


app = FastAPI(
    title="Marzallow API",
    description="Unified GUI Censorship Resistant Solution Powered by Xray",
    version=__version__,
    docs_url="/docs" if DOCS else None,
    redoc_url="/redoc" if DOCS else None,
    # Use route function names as OpenAPI operation ids (e.g. "get_user").
    generate_unique_id_function=lambda route: route.name,
    lifespan=lifespan,
)

scheduler = BackgroundScheduler(
    {"apscheduler.job_defaults.max_instances": 20}, timezone="UTC"
)
logger = logging.getLogger("uvicorn.error")

cors_origins = ALLOWED_ORIGINS
if DEBUG and not cors_origins:
    # The Vite dev server (port 3000) calls the API cross-origin.
    cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,  # auth uses bearer tokens, never cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
from app import dashboard, jobs, routers, telegram  # noqa
from app.routers import api_router  # noqa

app.include_router(api_router)



@on_startup
def check_subscription_path():
    # Newer FastAPI keeps included routers as lazy wrappers without `.path`;
    # those live under /api/, which is reserved explicitly below.
    paths = [f"{r.path}/" for r in app.routes if hasattr(r, "path")]
    paths.append("/api/")
    if f"/{XRAY_SUBSCRIPTION_PATH}/" in paths:
        raise ValueError(
            f"you can't use /{XRAY_SUBSCRIPTION_PATH}/ as subscription path it reserved for {app.title}"
        )
    scheduler.start()


@on_shutdown
def stop_scheduler():
    scheduler.shutdown()


@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exc: RequestValidationError):
    details = {}
    for error in exc.errors():
        details[error["loc"][-1]] = error.get("msg")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content=jsonable_encoder({"detail": details}),
    )
