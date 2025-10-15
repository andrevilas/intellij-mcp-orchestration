"""Application entrypoint for agents-hub FastAPI service."""

from fastapi import FastAPI

app = FastAPI(title="Agents Hub API")


@app.get("/health", tags=["health"])  # pragma: no cover - simple health endpoint
async def healthcheck() -> dict[str, str]:
    """Simple health endpoint for monitoring."""
    return {"status": "ok"}
