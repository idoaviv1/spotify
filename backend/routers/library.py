"""Library router - manage the local music library."""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from database import get_db, Song, User
from auth import get_current_user

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("")
async def get_library(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    sort: str = Query("created_at", pattern="^(title|artist|album|created_at|duration)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    search: str = Query("", description="Filter by title or artist"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all songs in the local library. Supports pagination, sorting, and filtering."""
    query = db.query(Song).filter(Song.file_path.isnot(None))

    # Search filter
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Song.title.ilike(search_term)) | (Song.artist.ilike(search_term))
        )

    # Sorting
    sort_column = getattr(Song, sort, Song.created_at)
    if order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(sort_column)

    # Pagination
    total = query.count()
    songs = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "songs": [s.to_dict() for s in songs],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/stats")
async def get_library_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get library statistics."""
    total_songs = db.query(Song).filter(Song.file_path.isnot(None)).count()
    total_size = db.query(func.sum(Song.file_size)).filter(Song.file_path.isnot(None)).scalar() or 0
    total_duration = db.query(func.sum(Song.duration)).filter(Song.file_path.isnot(None)).scalar() or 0
    artists = db.query(func.count(func.distinct(Song.artist))).filter(Song.file_path.isnot(None)).scalar() or 0
    albums = db.query(func.count(func.distinct(Song.album))).filter(
        Song.file_path.isnot(None), Song.album != "", Song.album.isnot(None)
    ).scalar() or 0

    return {
        "total_songs": total_songs,
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 1),
        "total_duration_seconds": total_duration,
        "total_duration_hours": round(total_duration / 3600, 1),
        "total_artists": artists,
        "total_albums": albums,
    }


@router.get("/artists")
async def get_artists(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all unique artists in the library."""
    artists = (
        db.query(Song.artist, func.count(Song.id).label("song_count"))
        .filter(Song.file_path.isnot(None))
        .group_by(Song.artist)
        .order_by(func.count(Song.id).desc())
        .all()
    )

    return {
        "artists": [
            {"name": a.artist, "song_count": a.song_count}
            for a in artists
        ]
    }


@router.get("/recent")
async def get_recent_songs(
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get recently added songs."""
    songs = (
        db.query(Song)
        .filter(Song.file_path.isnot(None))
        .order_by(desc(Song.created_at))
        .limit(limit)
        .all()
    )
    return {"songs": [s.to_dict() for s in songs]}


@router.get("/song/{song_id}")
async def get_song(
    song_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific song's details."""
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return song.to_dict()
