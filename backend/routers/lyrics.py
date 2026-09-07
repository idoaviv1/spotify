"""Lyrics router - fetch synced lyrics from LRCLIB."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db, Song
from services.lyrics import LyricsService

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])


@router.get("/{song_id}")
async def get_lyrics_for_song(song_id: str, db: Session = Depends(get_db)):
    """Get lyrics for a specific song from the library.
    
    Looks up the song by ID and fetches lyrics from LRCLIB.
    """
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    result = await LyricsService.get_lyrics(
        title=song.title,
        artist=song.artist or "",
        album=song.album or "",
        duration=song.duration or 0,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Lyrics not found")

    return result


@router.get("/search/query")
async def search_lyrics(
    q: str = Query(..., description="Search query for lyrics"),
):
    """Search for lyrics by query string."""
    results = await LyricsService.search_lyrics(q)
    return {"query": q, "results": results, "count": len(results)}


@router.get("/direct/get")
async def get_lyrics_direct(
    title: str = Query(..., description="Song title"),
    artist: str = Query("", description="Artist name"),
    album: str = Query("", description="Album name"),
    duration: int = Query(0, description="Song duration in seconds"),
):
    """Get lyrics directly by providing song details (no song_id needed).
    
    Useful for getting lyrics for songs not yet in the library.
    """
    result = await LyricsService.get_lyrics(
        title=title,
        artist=artist,
        album=album,
        duration=duration,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Lyrics not found")

    return result
