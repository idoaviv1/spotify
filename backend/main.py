"""Homeify - Personal Music Streaming Server

FastAPI backend that serves music over Tailscale to your devices.
Integrates with YouTube (yt-dlp), MusicBrainz, and LRCLIB.
"""
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import PORT, ALLOWED_ORIGINS, EQUALIZER_PRESETS
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
from database import init_db, get_db, EqualizerPreset, Song, Playlist, PlaylistSong, ListeningHistory, User
from auth import get_current_admin

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("homeify")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    logger.info("🎵 Homeify is starting up...")
    init_db()
    logger.info("✅ Database initialized")
    logger.info(f"🌐 Server running on http://0.0.0.0:{PORT}")
    yield
    logger.info("🛑 Homeify is shutting down...")


app = FastAPI(
    title="Homeify",
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
from routers import auth, admin, search, music, library, playlists, lyrics, history, recommendations

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(search.router)
app.include_router(music.router)
app.include_router(library.router)
app.include_router(playlists.router)
app.include_router(playlists.favorites_router)
app.include_router(lyrics.router)
app.include_router(history.router)
app.include_router(recommendations.router)


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
        "service": "Homeify",
        "version": "1.0.0",
    }


@app.get("/api/system/backup", tags=["system"])
async def export_backup(admin: User = Depends(get_current_admin)):
    """Export complete library, playlists, and listening history metadata as JSON. Requires admin."""
    db = next(get_db())
    try:
        songs = db.query(Song).all()
        playlists = db.query(Playlist).all()
        history = db.query(ListeningHistory).order_by(ListeningHistory.played_at.desc()).limit(1000).all()

        return {
            "version": "1.0.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "songs": [s.to_dict() for s in songs],
            "playlists": [p.to_dict(include_songs=True) for p in playlists],
            "history": [h.to_dict() for h in history],
        }
    finally:
        db.close()


class RestoreRequest(BaseModel):
    songs: list[dict] = []
    playlists: list[dict] = []


@app.post("/api/system/restore", tags=["system"])
async def import_backup(
    req: RestoreRequest,
    admin: User = Depends(get_current_admin),
):
    """Restore playlists and metadata from JSON backup. Requires admin."""
    db = next(get_db())
    try:
        restored_songs = 0
        restored_playlists = 0

        for s_data in req.songs:
            if not s_data.get("id"):
                continue
            existing = db.query(Song).filter(Song.id == s_data["id"]).first()
            if not existing:
                song = Song(
                    id=s_data["id"],
                    title=s_data.get("title", "Unknown"),
                    artist=s_data.get("artist", "Unknown Artist"),
                    album=s_data.get("album", ""),
                    duration=s_data.get("duration", 0),
                    youtube_url=s_data.get("youtube_url"),
                    youtube_id=s_data.get("youtube_id"),
                    cover_art_url=s_data.get("cover_art_url"),
                )
                db.add(song)
                restored_songs += 1

        db.commit()

        for p_data in req.playlists:
            p_id = p_data.get("id") or str(uuid.uuid4())
            existing_pl = db.query(Playlist).filter(Playlist.id == p_id).first()
            if not existing_pl:
                pl = Playlist(
                    id=p_id,
                    name=p_data.get("name", "Restored Playlist"),
                    description=p_data.get("description", ""),
                    cover_image=p_data.get("cover_image"),
                )
                db.add(pl)
                db.commit()
                db.refresh(pl)
                restored_playlists += 1

                for idx, song_item in enumerate(p_data.get("songs", [])):
                    s_id = song_item.get("id")
                    if s_id and db.query(Song).filter(Song.id == s_id).first():
                        db.add(PlaylistSong(playlist_id=pl.id, song_id=s_id, position=idx + 1))
                db.commit()

        return {
            "status": "success",
            "restored_songs": restored_songs,
            "restored_playlists": restored_playlists,
        }
    finally:
        db.close()


# ─── Serve frontend SPA (if built) ───

import os
from fastapi.responses import FileResponse

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.exists(FRONTEND_DIR):
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="API endpoint not found")
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
