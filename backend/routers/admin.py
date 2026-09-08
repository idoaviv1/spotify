"""Admin Router - Complete User & Playlist Management for Administrators only."""
import uuid
import logging
from typing import Optional, List
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import get_db, User, Playlist, PlaylistSong, Song, ListeningHistory
from auth import hash_password, get_current_admin

logger = logging.getLogger("homeify.admin")
router = APIRouter(prefix="/api/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=4, max_length=100)
    display_name: Optional[str] = ""
    role: Optional[str] = "user"  # "admin" or "user"


class UpdateUserRequest(BaseModel):
    username: Optional[str] = Field(None, min_length=2, max_length=50)
    password: Optional[str] = Field(None, min_length=4, max_length=100)
    display_name: Optional[str] = None
    role: Optional[str] = None  # "admin" or "user"
    is_active: Optional[bool] = None


class AdminPlaylistCreateRequest(BaseModel):
    name: str
    description: str = ""


class AdminPlaylistUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class AdminAddSongRequest(BaseModel):
    song_id: str
    song_data: Optional[dict] = None


# ─── User Management Endpoints ───

@router.get("/users")
async def list_users(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all users with their statistics and system summary."""
    users = db.query(User).order_by(User.created_at.desc()).all()

    user_list = []
    for u in users:
        playlist_count = db.query(Playlist).filter(Playlist.user_id == u.id).count()
        play_count = db.query(ListeningHistory).filter(ListeningHistory.user_id == u.id).count()
        data = u.to_dict()
        data["playlist_count"] = playlist_count
        data["play_count"] = play_count
        user_list.append(data)

    total_playlists = db.query(Playlist).count()
    total_songs = db.query(Song).count()

    return {
        "users": user_list,
        "total_users": len(user_list),
        "total_playlists": total_playlists,
        "total_songs": total_songs,
    }


@router.post("/users")
async def create_user(
    req: CreateUserRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Create a new user. Only administrators can create users.
    Public registration is strictly disabled.
    """
    clean_username = req.username.strip().lower()
    if not clean_username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    existing = db.query(User).filter(func.lower(User.username) == clean_username).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Username '{clean_username}' is already taken")

    role = "admin" if req.role == "admin" else "user"
    user_id = str(uuid.uuid4())

    new_user = User(
        id=user_id,
        username=clean_username,
        password_hash=hash_password(req.password),
        display_name=(req.display_name or clean_username).strip(),
        role=role,
        is_active=True,
    )
    db.add(new_user)
    db.flush()

    # Automatically provision Liked Songs playlist for this new user
    fav_playlist = Playlist(
        id=f"fav_{user_id}",
        user_id=user_id,
        name="Liked Songs",
        description="Your favorite and liked tracks 💚",
        is_favorites=True,
    )
    db.add(fav_playlist)
    db.commit()
    db.refresh(new_user)

    logger.info(f"Admin '{admin.username}' created new user '{new_user.username}' (role: {role})")
    return {"status": "created", "user": new_user.to_dict()}


@router.get("/users/{user_id}")
async def get_user_details(
    user_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Get full details of a specific user, including their playlists and recent plays."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    playlists = db.query(Playlist).filter(Playlist.user_id == user_id).all()
    recent_history = (
        db.query(ListeningHistory)
        .filter(ListeningHistory.user_id == user_id)
        .order_by(desc(ListeningHistory.played_at))
        .limit(20)
        .all()
    )

    data = user.to_dict()
    data["playlists"] = [p.to_dict(include_songs=True) for p in playlists]
    data["recent_history"] = [h.to_dict() for h in recent_history]
    return {"user": data}


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    req: UpdateUserRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Admin updates any user's profile: username, display_name, password (direct reset),
    role, or active status.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deactivating or demoting themselves to avoid lockout
    if user.id == admin.id:
        if req.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own admin account")
        if req.role and req.role != "admin":
            raise HTTPException(status_code=400, detail="Cannot remove admin role from your own account")

    if req.username:
        new_username = req.username.strip().lower()
        if new_username != user.username:
            existing = db.query(User).filter(func.lower(User.username) == new_username).first()
            if existing and existing.id != user.id:
                raise HTTPException(status_code=400, detail=f"Username '{new_username}' is already in use")
            user.username = new_username

    if req.display_name is not None:
        user.display_name = req.display_name.strip()

    if req.password:
        user.password_hash = hash_password(req.password)

    if req.role:
        user.role = "admin" if req.role == "admin" else "user"

    if req.is_active is not None:
        user.is_active = bool(req.is_active)

    db.commit()
    db.refresh(user)

    logger.info(f"Admin '{admin.username}' updated user '{user.username}'")
    return {"status": "updated", "user": user.to_dict()}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a user and cascade all their personal playlists and history."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    username = user.username
    db.delete(user)
    db.commit()

    logger.info(f"Admin '{admin.username}' deleted user '{username}'")
    return {"status": "deleted", "user_id": user_id, "username": username}


# ─── Admin Playlist Management Across All Users ───

@router.get("/users/{user_id}/playlists")
async def get_user_playlists(
    user_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin views all playlists belonging to a specific user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    playlists = db.query(Playlist).filter(Playlist.user_id == user_id).order_by(Playlist.updated_at.desc()).all()
    return {"playlists": [p.to_dict(include_songs=True) for p in playlists], "user": user.to_dict()}


@router.post("/users/{user_id}/playlists")
async def create_user_playlist(
    user_id: str,
    req: AdminPlaylistCreateRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin creates a new playlist on behalf of a specific user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_pl = Playlist(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=req.name.strip(),
        description=req.description.strip(),
    )
    db.add(new_pl)
    db.commit()
    db.refresh(new_pl)
    return {"status": "created", "playlist": new_pl.to_dict()}


@router.put("/playlists/{playlist_id}")
async def update_any_playlist(
    playlist_id: str,
    req: AdminPlaylistUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin updates any playlist in the system."""
    pl = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if req.name is not None:
        pl.name = req.name.strip()
    if req.description is not None:
        pl.description = req.description.strip()

    db.commit()
    db.refresh(pl)
    return {"status": "updated", "playlist": pl.to_dict()}


@router.delete("/playlists/{playlist_id}")
async def delete_any_playlist(
    playlist_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin deletes any playlist in the system."""
    pl = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    db.delete(pl)
    db.commit()
    return {"status": "deleted", "playlist_id": playlist_id}


@router.post("/playlists/{playlist_id}/songs")
async def add_song_to_any_playlist(
    playlist_id: str,
    req: AdminAddSongRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin adds a song to any user's playlist."""
    pl = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    song = db.query(Song).filter(Song.id == req.song_id).first()
    if not song and req.song_data:
        sd = req.song_data
        song = Song(
            id=req.song_id,
            title=sd.get("title", "Unknown"),
            artist=sd.get("artist", "Unknown Artist"),
            duration=sd.get("duration", 0),
            youtube_url=sd.get("youtube_url"),
            youtube_id=sd.get("youtube_id"),
            cover_art_url=sd.get("cover_art_url") or sd.get("thumbnail"),
        )
        db.add(song)
        db.flush()

    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    existing_entry = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == playlist_id,
        PlaylistSong.song_id == song.id
    ).first()

    if not existing_entry:
        max_pos = db.query(func.max(PlaylistSong.position)).filter(
            PlaylistSong.playlist_id == playlist_id
        ).scalar() or 0

        entry = PlaylistSong(
            playlist_id=playlist_id,
            song_id=song.id,
            position=max_pos + 1
        )
        db.add(entry)
        db.commit()

    return {"status": "added", "song": song.to_dict()}


@router.delete("/playlists/{playlist_id}/songs/{song_id}")
async def remove_song_from_any_playlist(
    playlist_id: str,
    song_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin removes a song from any user's playlist."""
    entry = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == playlist_id,
        PlaylistSong.song_id == song_id
    ).first()

    if not entry:
        raise HTTPException(status_code=404, detail="Song not in playlist")

    db.delete(entry)
    db.commit()
    return {"status": "removed", "song_id": song_id}
