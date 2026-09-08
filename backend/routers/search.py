import os
import asyncio
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session

from database import get_db, Song, User
from auth import get_current_user
from services.youtube import YouTubeService
from services.metadata import MetadataService

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search_songs(
    q: str = Query(..., description="Search query"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search for songs on YouTube.
    
    Returns a list of YouTube search results with metadata, cross-referenced with local library.
    """
    results = await asyncio.to_thread(YouTubeService.search, q, max_results=limit)
    
    # Check if any results are already in our local library
    songs = db.query(Song).all()
    downloaded_by_yt_id = {s.youtube_id: s for s in songs if s.youtube_id and s.file_path and os.path.exists(s.file_path)}
    downloaded_by_url = {s.youtube_url: s for s in songs if s.youtube_url and s.file_path and os.path.exists(s.file_path)}
    
    for r in results:
        match = downloaded_by_yt_id.get(r.get("youtube_id")) or downloaded_by_url.get(r.get("youtube_url"))
        if match:
            r["is_downloaded"] = True
            r["song_id"] = match.id
        else:
            r["is_downloaded"] = False
            r["song_id"] = None
            
    return {"query": q, "results": results, "count": len(results)}


@router.get("/metadata")
async def search_metadata(
    q: str = Query(..., description="Search query for MusicBrainz"),
    limit: int = Query(5, ge=1, le=20),
):
    """Search MusicBrainz for metadata about a song/artist."""
    results = await MetadataService.search_recording(q, limit=limit)
    return {"query": q, "results": results, "count": len(results)}


@router.get("/enrich")
async def enrich_metadata(
    title: str = Query(..., description="Song title"),
    artist: str = Query("", description="Artist name"),
):
    """Try to enrich a song with MusicBrainz metadata (cover art, album, etc.)."""
    result = await MetadataService.enrich_song_metadata(title, artist)
    if result:
        return {"found": True, **result}
    return {"found": False}
