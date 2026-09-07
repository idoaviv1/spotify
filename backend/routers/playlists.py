import os
import shutil
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from database import get_db, Playlist, PlaylistSong, Song
from config import COVERS_DIR

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


class CreatePlaylistRequest(BaseModel):
    name: str
    description: str = ""


class UpdatePlaylistRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class AddSongRequest(BaseModel):
    song_id: str


@router.get("")
async def get_playlists(db: Session = Depends(get_db)):
    """Get all playlists."""
    playlists = db.query(Playlist).order_by(Playlist.updated_at.desc()).all()
    return {"playlists": [p.to_dict() for p in playlists]}


@router.post("")
async def create_playlist(req: CreatePlaylistRequest, db: Session = Depends(get_db)):
    """Create a new playlist."""
    playlist = Playlist(
        id=str(uuid.uuid4()),
        name=req.name,
        description=req.description,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return {"status": "created", "playlist": playlist.to_dict()}


@router.get("/{playlist_id}")
async def get_playlist(playlist_id: str, db: Session = Depends(get_db)):
    """Get a specific playlist with its songs."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return playlist.to_dict(include_songs=True)


@router.put("/{playlist_id}")
async def update_playlist(playlist_id: str, req: UpdatePlaylistRequest, db: Session = Depends(get_db)):
    """Update playlist metadata."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if req.name is not None:
        playlist.name = req.name
    if req.description is not None:
        playlist.description = req.description
    playlist.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(playlist)
    return {"status": "updated", "playlist": playlist.to_dict()}


@router.delete("/{playlist_id}")
async def delete_playlist(playlist_id: str, db: Session = Depends(get_db)):
    """Delete a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    db.delete(playlist)
    db.commit()
    return {"status": "deleted", "playlist_id": playlist_id}


@router.post("/{playlist_id}/songs")
async def add_song_to_playlist(playlist_id: str, req: AddSongRequest, db: Session = Depends(get_db)):
    """Add a song to a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    song = db.query(Song).filter(Song.id == req.song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Check if already in playlist
    existing = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == playlist_id,
        PlaylistSong.song_id == req.song_id,
    ).first()
    if existing:
        return {"status": "already_exists"}

    # Get max position
    max_pos = db.query(func.max(PlaylistSong.position)).filter(
        PlaylistSong.playlist_id == playlist_id
    ).scalar() or 0

    entry = PlaylistSong(
        playlist_id=playlist_id,
        song_id=req.song_id,
        position=max_pos + 1,
    )
    db.add(entry)
    playlist.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "added", "position": max_pos + 1}


@router.delete("/{playlist_id}/songs/{song_id}")
async def remove_song_from_playlist(playlist_id: str, song_id: str, db: Session = Depends(get_db)):
    """Remove a song from a playlist."""
    entry = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == playlist_id,
        PlaylistSong.song_id == song_id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Song not in playlist")

    db.delete(entry)
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if playlist:
        playlist.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "removed"}


@router.put("/{playlist_id}/reorder")
async def reorder_playlist(playlist_id: str, song_ids: list[str], db: Session = Depends(get_db)):
    """Reorder songs in a playlist by providing the new order of song IDs."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    for idx, song_id in enumerate(song_ids):
        entry = db.query(PlaylistSong).filter(
            PlaylistSong.playlist_id == playlist_id,
            PlaylistSong.song_id == song_id,
        ).first()
        if entry:
            entry.position = idx + 1

    playlist.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "reordered"}


@router.post("/{playlist_id}/cover")
async def upload_playlist_cover(
    playlist_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a custom cover image for a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"

    cover_filename = f"playlist_{playlist_id}{ext}"
    cover_path = COVERS_DIR / cover_filename

    with open(cover_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    playlist.cover_image = f"/api/playlists/{playlist_id}/cover"
    playlist.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(playlist)

    return {"status": "success", "cover_url": playlist.cover_image, "playlist": playlist.to_dict()}


@router.get("/{playlist_id}/cover")
async def get_playlist_cover(playlist_id: str, db: Session = Depends(get_db)):
    """Serve the playlist custom cover image."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    for ext in [".jpg", ".jpeg", ".png", ".webp"]:
        cover_path = COVERS_DIR / f"playlist_{playlist_id}{ext}"
        if cover_path.exists():
            return FileResponse(cover_path)

    raise HTTPException(status_code=404, detail="Playlist cover not found")
