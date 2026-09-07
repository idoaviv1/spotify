"""History router - listening history tracking."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from pydantic import BaseModel

from database import get_db, ListeningHistory, Song

router = APIRouter(prefix="/api/history", tags=["history"])


class RecordPlayRequest(BaseModel):
    song_id: str
    duration_listened: int = 0  # seconds


@router.get("")
async def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Get listening history, most recent first."""
    query = db.query(ListeningHistory).order_by(desc(ListeningHistory.played_at))

    total = query.count()
    entries = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "history": [e.to_dict() for e in entries],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("")
async def record_play(req: RecordPlayRequest, db: Session = Depends(get_db)):
    """Record a song play in history."""
    from fastapi import HTTPException

    song = db.query(Song).filter(Song.id == req.song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    entry = ListeningHistory(
        song_id=req.song_id,
        duration_listened=req.duration_listened,
    )
    db.add(entry)
    db.commit()

    return {"status": "recorded"}


@router.get("/top")
async def get_most_played(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get the most played songs."""
    results = (
        db.query(Song, func.count(ListeningHistory.id).label("play_count"))
        .join(ListeningHistory, ListeningHistory.song_id == Song.id)
        .group_by(Song.id)
        .order_by(func.count(ListeningHistory.id).desc())
        .limit(limit)
        .all()
    )

    return {
        "songs": [
            {**song.to_dict(), "play_count": count}
            for song, count in results
        ]
    }


@router.delete("")
async def clear_history(db: Session = Depends(get_db)):
    """Clear all listening history."""
    db.query(ListeningHistory).delete()
    db.commit()
    return {"status": "cleared"}
