"""SonicLink - Personal Music Streaming Server

FastAPI backend that serves music over Tailscale to your devices.
Integrates with YouTube (yt-dlp), MusicBrainz, and LRCLIB.
"""
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import PORT, ALLOWED_ORIGINS, EQUALIZER_PRESETS
from database import init_db, get_db, EqualizerPreset

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("soniclink")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    logger.info("🎵 SonicLink is starting up...")
    init_db()
    logger.info("✅ Database initialized")
    logger.info(f"🌐 Server running on http://0.0.0.0:{PORT}")
    yield
    logger.info("🛑 SonicLink is shutting down...")


app = FastAPI(
    title="SonicLink",
    description="Personal Music Streaming Server",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - allow all origins (private Tailscale network)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

# Import and register routers
from routers import search, music, library, playlists, lyrics, history

app.include_router(search.router)
app.include_router(music.router)
app.include_router(library.router)
app.include_router(playlists.router)
app.include_router(lyrics.router)
app.include_router(history.router)


# ─── Equalizer endpoint (simple, kept in main) ───

@app.get("/api/equalizer/presets", tags=["equalizer"])
async def get_equalizer_presets():
    """Get all equalizer presets."""
    db = next(get_db())
    try:
        presets = db.query(EqualizerPreset).all()
        return {"presets": [p.to_dict() for p in presets]}
    finally:
        db.close()


# ─── Health check ───

@app.get("/api/health", tags=["system"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "SonicLink",
        "version": "1.0.0",
    }


# ─── Serve frontend SPA (if built) ───

import os
from fastapi.responses import FileResponse

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.exists(FRONTEND_DIR):
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        index_path = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return {"detail": "Frontend build not found"}


if __name__ == "__main__":
    import uvicorn
    reload_enabled = os.getenv("RELOAD", "false").lower() == "true"
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        reload=reload_enabled,
        reload_dirs=[backend_dir] if reload_enabled else None,
    )
