import os
import shutil
import uuid
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from database import get_db, Playlist, PlaylistSong, Song, User, FAVORITES_PLAYLIST_ID
from auth import get_current_user
from config import COVERS_DIR

router = APIRouter(prefix="/api/playlists", tags=["playlists"])
favorites_router = APIRouter(prefix="/api/favorites", tags=["favorites"])


class CreatePlaylistRequest(BaseModel):
    name: str
    description: str = ""


class UpdatePlaylistRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class AddSongRequest(BaseModel):
    song_id: str
    song_data: dict | None = None


class ToggleFavoriteRequest(BaseModel):
    song_id: str
    song_data: dict | None = None


class ReorderPlaylistRequest(BaseModel):
    song_ids: list[str]


class ImportPlaylistRequest(BaseModel):
    url: str
    name: str | None = None


class ImportPreviewRequest(BaseModel):
    url: str
    source: str | None = None


class ImportExternalRequest(BaseModel):
    url: str
    name: str | None = None
    source: str | None = None
    link_audio: bool = True


def _get_or_create_favorites(db: Session, user_id: str | None = None) -> Playlist:
    """Get or provision the Liked Songs / Favorites playlist for a user, deduplicating if needed."""
    if user_id:
        all_favs = (
            db.query(Playlist)
            .filter(Playlist.user_id == user_id, Playlist.is_favorites == True)
            .order_by(Playlist.created_at.asc())
            .all()
        )
        if all_favs:
            canonical_fav = all_favs[0]
            if len(all_favs) > 1:
                # Merge duplicate favorites
                for dup in all_favs[1:]:
                    for s in dup.songs:
                        if not any(ps.song_id == s.song_id for ps in canonical_fav.songs):
                            s.playlist_id = canonical_fav.id
                    db.delete(dup)
                db.commit()
                db.refresh(canonical_fav)
            return canonical_fav

        fav = Playlist(
            id=f"fav_{user_id}",
            user_id=user_id,
            name="Liked Songs",
            description="Your favorite and liked tracks 💚",
            is_favorites=True,
        )
        db.add(fav)
        db.commit()
        db.refresh(fav)
        return fav

    # Global fallback if user_id is None
    fav = db.query(Playlist).filter(Playlist.id == FAVORITES_PLAYLIST_ID).first()
    if not fav:
        fav = Playlist(
            id=FAVORITES_PLAYLIST_ID,
            name="Liked Songs",
            description="Your favorite and liked tracks 💚",
            is_favorites=True,
        )
        db.add(fav)
        db.commit()
        db.refresh(fav)
    return fav


@router.get("")
async def get_playlists(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all user-created playlists for the current user, ensuring Liked Songs is pinned at top."""
    fav = _get_or_create_favorites(db, current_user.id)
    playlists = (
        db.query(Playlist)
        .filter(
            Playlist.user_id == current_user.id,
            Playlist.is_favorites == False,
            Playlist.id != fav.id,
        )
        .order_by(Playlist.updated_at.desc())
        .all()
    )
    ordered = [fav] + playlists
    return {"playlists": [p.to_dict() for p in ordered]}


@router.post("")
async def create_playlist(
    req: CreatePlaylistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new playlist belonging to the current user."""
    playlist = Playlist(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=req.name.strip(),
        description=req.description.strip(),
        is_favorites=False,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return {"status": "created", "playlist": playlist.to_dict()}


@router.get("/{playlist_id}")
async def get_playlist(
    playlist_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific playlist with its songs."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    # Enforce isolation: user can only see their own playlists unless admin
    if playlist.user_id and playlist.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this playlist")

    return playlist.to_dict(include_songs=True)


@router.put("/{playlist_id}")
async def update_playlist(
    playlist_id: str,
    req: UpdatePlaylistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update playlist metadata."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if playlist.user_id and playlist.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this playlist")

    if req.name is not None:
        playlist.name = req.name.strip()
    if req.description is not None:
        playlist.description = req.description.strip()
    playlist.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(playlist)
    return {"status": "updated", "playlist": playlist.to_dict()}


@router.delete("/{playlist_id}")
async def delete_playlist(
    playlist_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if playlist.is_favorites or playlist_id == FAVORITES_PLAYLIST_ID:
        raise HTTPException(status_code=400, detail="Cannot delete your Liked Songs playlist")

    if playlist.user_id and playlist.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this playlist")

    db.delete(playlist)
    db.commit()
    return {"status": "deleted", "playlist_id": playlist_id}


@router.post("/{playlist_id}/songs")
async def add_song_to_playlist(
    playlist_id: str,
    req: AddSongRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a song to a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if playlist.user_id and playlist.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this playlist")

    song = db.query(Song).filter(Song.id == req.song_id).first()
    if not song:
        data = req.song_data or {}
        song = Song(
            id=req.song_id,
            title=data.get("title", "Unknown Title"),
            artist=data.get("artist", "Unknown Artist"),
            album=data.get("album", ""),
            duration=data.get("duration", 0),
            youtube_url=data.get("youtube_url") or (f"https://www.youtube.com/watch?v={data.get('youtube_id')}" if data.get("youtube_id") else None),
            youtube_id=data.get("youtube_id", ""),
            cover_art_url=data.get("cover_art_url") or data.get("thumbnail", ""),
        )
        db.add(song)
        db.commit()
        db.refresh(song)

    existing_entry = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == playlist_id,
        PlaylistSong.song_id == song.id
    ).first()

    if existing_entry:
        return {"status": "already_exists", "song": song.to_dict()}

    max_position = db.query(func.max(PlaylistSong.position)).filter(
        PlaylistSong.playlist_id == playlist_id
    ).scalar() or 0

    entry = PlaylistSong(
        playlist_id=playlist_id,
        song_id=song.id,
        position=max_position + 1
    )
    db.add(entry)
    playlist.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "added", "song": song.to_dict()}


@router.delete("/{playlist_id}/songs/{song_id}")
async def remove_song_from_playlist(
    playlist_id: str,
    song_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a song from a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if playlist.user_id and playlist.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this playlist")

    entry = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == playlist_id,
        PlaylistSong.song_id == song_id
    ).first()

    if not entry:
        raise HTTPException(status_code=404, detail="Song not in playlist")

    db.delete(entry)
    playlist.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "removed", "song_id": song_id}


@router.put("/{playlist_id}/reorder")
async def reorder_playlist(
    playlist_id: str,
    req: ReorderPlaylistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reorder songs in a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if playlist.user_id and playlist.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this playlist")

    for idx, song_id in enumerate(req.song_ids):
        entry = db.query(PlaylistSong).filter(
            PlaylistSong.playlist_id == playlist_id,
            PlaylistSong.song_id == song_id
        ).first()
        if entry:
            entry.position = idx

    playlist.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "reordered"}


@router.post("/{playlist_id}/cover")
async def upload_playlist_cover(
    playlist_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a custom cover image for a playlist with size limits and path safety."""
    import re
    clean_id = re.sub(r"[^a-zA-Z0-9_\-]", "", playlist_id)
    if not clean_id:
        raise HTTPException(status_code=400, detail="Invalid playlist ID")

    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if playlist.user_id and playlist.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this playlist")

    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    ext = content_type.split("/")[-1]
    if ext == "jpeg":
        ext = "jpg"
    elif ext not in ["jpg", "png", "webp"]:
        ext = "jpg"

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Cover image too large (max 5 MB)")

    filename = f"playlist_{clean_id}_{int(datetime.now().timestamp())}.{ext}"
    filepath = COVERS_DIR / filename

    with open(filepath, "wb") as buffer:
        buffer.write(content)

    cover_url = f"/api/playlists/{clean_id}/cover?t={int(datetime.now().timestamp())}"
    playlist.cover_image = cover_url
    playlist.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "uploaded", "cover_url": cover_url}


@router.get("/{playlist_id}/cover")
async def get_playlist_cover(playlist_id: str, db: Session = Depends(get_db)):
    """Serve a custom playlist cover image."""
    import re
    clean_id = re.sub(r"[^a-zA-Z0-9_\-]", "", playlist_id)
    if not clean_id:
        raise HTTPException(status_code=400, detail="Invalid playlist ID")

    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist or not playlist.cover_image:
        raise HTTPException(status_code=404, detail="Cover not found")

    for f in os.listdir(COVERS_DIR):
        if f.startswith(f"playlist_{clean_id}_"):
            full_path = (COVERS_DIR / f).resolve()
            if full_path.is_relative_to(COVERS_DIR.resolve()) and full_path.is_file():
                return FileResponse(full_path)

    raise HTTPException(status_code=404, detail="Cover file not found")


@router.post("/import")
async def import_playlist(
    req: ImportPlaylistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import a playlist from a YouTube playlist URL."""
    from services.youtube import YouTubeService
    url = req.url.strip()
    if not ("youtube.com" in url or "youtu.be" in url) or "list=" not in url:
        raise HTTPException(status_code=400, detail="Invalid YouTube playlist URL")

    try:
        data = await asyncio.to_thread(YouTubeService.get_playlist_info, url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch YouTube playlist: {str(e)}")

    if not data or not data.get("entries"):
        raise HTTPException(status_code=404, detail="No videos found in playlist")

    playlist_name = req.name.strip() if req.name and req.name.strip() else data.get("title", "Imported Playlist")
    new_playlist = Playlist(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=playlist_name,
        description=f"Imported from YouTube: {data.get('title', '')}",
        cover_image=data.get("thumbnail"),
        is_favorites=False,
    )
    db.add(new_playlist)
    db.flush()

    added_count = 0
    for idx, entry in enumerate(data["entries"]):
        yt_id = entry.get("id")
        if not yt_id:
            continue
        song = db.query(Song).filter(Song.youtube_id == yt_id).first()
        if not song:
            song = Song(
                id=str(uuid.uuid4()),
                title=entry.get("title", "Unknown"),
                artist=entry.get("uploader", "Unknown Artist"),
                duration=entry.get("duration", 0),
                youtube_id=yt_id,
                youtube_url=f"https://www.youtube.com/watch?v={yt_id}",
                cover_art_url=entry.get("thumbnail"),
            )
            db.add(song)
            db.flush()

        ps = PlaylistSong(
            playlist_id=new_playlist.id,
            song_id=song.id,
            position=idx,
        )
        db.add(ps)
        added_count += 1

    db.commit()
    db.refresh(new_playlist)

    return {
        "status": "imported",
        "playlist": new_playlist.to_dict(include_songs=True),
        "total_songs": added_count,
    }


@router.post("/import-preview")
async def preview_import_playlist(
    req: ImportPreviewRequest,
    current_user: User = Depends(get_current_user),
):
    """Preview metadata and tracklist of an external playlist before importing."""
    from services.importer import PlaylistImporterService
    try:
        data = await asyncio.to_thread(PlaylistImporterService.get_preview, req.url.strip(), req.source)
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to preview playlist: {str(e)}")


@router.post("/import-external")
async def import_external_playlist(
    req: ImportExternalRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import an external playlist from Spotify, Apple Music, YouTube, or Text list."""
    from services.importer import PlaylistImporterService, resolve_playlist_songs_background
    try:
        preview = await asyncio.to_thread(PlaylistImporterService.get_preview, req.url.strip(), req.source)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract playlist: {str(e)}")

    tracks = preview.get("tracks", [])
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found in the provided source")

    playlist_name = req.name.strip() if (req.name and req.name.strip()) else preview.get("title", "Imported Playlist")
    new_playlist = Playlist(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=playlist_name,
        description=preview.get("description", f"Imported from {preview.get('platform', 'external')}"),
        cover_image=preview.get("cover_url"),
        is_favorites=False,
    )
    db.add(new_playlist)
    db.flush()

    initial_resolve_count = 10 if req.link_audio else 0
    first_batch = tracks[:initial_resolve_count]
    if first_batch:
        first_batch = await asyncio.to_thread(PlaylistImporterService.resolve_tracks_batch, first_batch)

    resolved_tracks = first_batch + tracks[initial_resolve_count:]

    added_count = 0
    for idx, track in enumerate(resolved_tracks):
        yt_id = track.get("youtube_id")
        existing_song = None
        if yt_id:
            existing_song = db.query(Song).filter(Song.youtube_id == yt_id).first()
        if not existing_song:
            existing_song = (
                db.query(Song)
                .filter(func.lower(Song.title) == track["title"].lower(), func.lower(Song.artist) == track["artist"].lower())
                .first()
            )

        if existing_song:
            song_to_link = existing_song
            if yt_id and not song_to_link.youtube_id:
                song_to_link.youtube_id = yt_id
                song_to_link.youtube_url = track.get("youtube_url")
        else:
            song_to_link = Song(
                id=str(uuid.uuid4()),
                title=track.get("title", "Unknown"),
                artist=track.get("artist", "Unknown Artist"),
                duration=track.get("duration", 0),
                youtube_id=yt_id,
                youtube_url=track.get("youtube_url") or (f"https://www.youtube.com/watch?v={yt_id}" if yt_id else None),
                cover_art_url=track.get("cover_url") or preview.get("cover_url"),
            )
            db.add(song_to_link)
            db.flush()

        ps = PlaylistSong(
            playlist_id=new_playlist.id,
            song_id=song_to_link.id,
            position=idx,
        )
        db.add(ps)
        added_count += 1

    db.commit()
    db.refresh(new_playlist)

    if req.link_audio and len(tracks) > initial_resolve_count:
        background_tasks.add_task(resolve_playlist_songs_background, new_playlist.id)

    return {
        "status": "imported",
        "platform": preview.get("platform"),
        "playlist": new_playlist.to_dict(include_songs=True),
        "total_songs": added_count,
    }


# ─── Favorites Dedicated Endpoints (Per User) ───

@favorites_router.get("")
async def get_favorites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's favorites playlist with all songs."""
    fav = _get_or_create_favorites(db, current_user.id)
    return fav.to_dict(include_songs=True)


@favorites_router.get("/ids")
async def get_favorite_ids(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get list of song IDs that are in the current user's favorites."""
    fav = _get_or_create_favorites(db, current_user.id)
    entries = db.query(PlaylistSong.song_id).filter(PlaylistSong.playlist_id == fav.id).all()
    return {"favorite_ids": [e[0] for e in entries]}


@favorites_router.post("/toggle")
async def toggle_favorite(
    req: ToggleFavoriteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle a song in/out of the current user's favorites."""
    fav = _get_or_create_favorites(db, current_user.id)
    existing = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == fav.id,
        PlaylistSong.song_id == req.song_id,
    ).first()

    if existing:
        db.delete(existing)
        fav.updated_at = datetime.now(timezone.utc)
        db.commit()
        return {"is_liked": False, "status": "removed", "song_id": req.song_id}

    # Ensure song exists
    song = db.query(Song).filter(Song.id == req.song_id).first()
    if not song:
        data = req.song_data or {}
        song = Song(
            id=req.song_id,
            title=data.get("title", "Unknown Title"),
            artist=data.get("artist", "Unknown Artist"),
            album=data.get("album", ""),
            duration=data.get("duration", 0),
            youtube_url=data.get("youtube_url") or (f"https://www.youtube.com/watch?v={data.get('youtube_id')}" if data.get("youtube_id") else None),
            youtube_id=data.get("youtube_id", ""),
            cover_art_url=data.get("cover_art_url") or data.get("thumbnail", ""),
        )
        db.add(song)
        db.commit()
        db.refresh(song)

    max_pos = db.query(func.max(PlaylistSong.position)).filter(
        PlaylistSong.playlist_id == fav.id
    ).scalar() or 0

    entry = PlaylistSong(
        playlist_id=fav.id,
        song_id=req.song_id,
        position=max_pos + 1,
    )
    db.add(entry)
    fav.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"is_liked": True, "status": "added", "song_id": req.song_id, "song": song.to_dict()}


@favorites_router.post("/{song_id}")
async def add_to_favorites(
    song_id: str,
    req: AddSongRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a song to the current user's favorites."""
    fav = _get_or_create_favorites(db, current_user.id)
    existing = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == fav.id,
        PlaylistSong.song_id == song_id,
    ).first()
    if existing:
        return {"status": "already_exists", "is_liked": True}

    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        data = (req.song_data if req else {}) or {}
        song = Song(
            id=song_id,
            title=data.get("title", "Unknown Title"),
            artist=data.get("artist", "Unknown Artist"),
            album=data.get("album", ""),
            duration=data.get("duration", 0),
            youtube_url=data.get("youtube_url") or (f"https://www.youtube.com/watch?v={data.get('youtube_id')}" if data.get("youtube_id") else None),
            youtube_id=data.get("youtube_id", ""),
            cover_art_url=data.get("cover_art_url") or data.get("thumbnail", ""),
        )
        db.add(song)
        db.commit()

    max_pos = db.query(func.max(PlaylistSong.position)).filter(
        PlaylistSong.playlist_id == fav.id
    ).scalar() or 0

    entry = PlaylistSong(
        playlist_id=fav.id,
        song_id=song_id,
        position=max_pos + 1,
    )
    db.add(entry)
    fav.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "added", "is_liked": True}


@favorites_router.delete("/{song_id}")
async def remove_from_favorites(
    song_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a song from the current user's favorites."""
    fav = _get_or_create_favorites(db, current_user.id)
    entry = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == fav.id,
        PlaylistSong.song_id == song_id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Song not in favorites")

    db.delete(entry)
    fav.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "removed", "is_liked": False}
