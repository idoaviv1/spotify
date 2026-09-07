"""Recommendations router - Smart music suggestions based on user listening history."""
import time
import logging
from typing import List, Dict, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import get_db, Song, ListeningHistory
from services.youtube import YouTubeService

logger = logging.getLogger("soniclink.recommendations")
router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])

# In-memory recommendation cache: {cache_key: (results, expire_at)}
_recommendation_cache: Dict[str, tuple[List[Dict[str, Any]], float]] = {}
CACHE_TTL = 900  # 15 minutes


@router.get("")
async def get_recommendations(
    limit: int = Query(12, ge=1, le=30),
    db: Session = Depends(get_db),
):
    """Generate smart song recommendations based on user listening history and library."""
    now = time.time()
    cache_key = f"rec_{limit}"

    # Return cached recommendations if still fresh
    if cache_key in _recommendation_cache:
        cached_results, expire_at = _recommendation_cache[cache_key]
        if now < expire_at and cached_results:
            return {"recommendations": cached_results}

    # 1. Analyze user listening history
    top_history = (
        db.query(
            Song.artist,
            Song.title,
            Song.youtube_id,
            func.count(ListeningHistory.id).label("play_count"),
        )
        .join(Song, Song.id == ListeningHistory.song_id)
        .group_by(Song.artist, Song.title, Song.youtube_id)
        .order_by(desc("play_count"), desc(ListeningHistory.played_at))
        .limit(10)
        .all()
    )

    # All known song titles & youtube IDs in library to avoid recommending duplicates
    existing_songs = db.query(Song.youtube_id, Song.title, Song.artist).all()
    existing_ids = {s.youtube_id for s in existing_songs if s.youtube_id}
    existing_titles = {s.title.lower().strip() for s in existing_songs if s.title}

    queries_to_run = []

    if top_history:
        for entry in top_history[:3]:
            artist = entry.artist
            title = entry.title
            if artist and artist != "Unknown Artist":
                queries_to_run.append((
                    f"{artist} similar music",
                    f"Because you listen to {artist}"
                ))
            elif title:
                queries_to_run.append((
                    f"songs like {title}",
                    f"Similar to {title}"
                ))
    else:
        # Fallback to library songs if history is still empty
        library_songs = db.query(Song).order_by(Song.created_at.desc()).limit(5).all()
        for s in library_songs:
            if s.artist and s.artist != "Unknown Artist":
                queries_to_run.append((
                    f"{s.artist} music",
                    f"From your favorite artist {s.artist}"
                ))
            elif s.title:
                queries_to_run.append((
                    f"songs like {s.title}",
                    f"Based on {s.title}"
                ))

    # If library is also brand new, use top popular suggestions
    if not queries_to_run:
        queries_to_run.append(("top popular hits official audio", "Trending Music"))

    results: List[Dict[str, Any]] = []
    seen_ids = set()

    for search_query, reason in queries_to_run:
        if len(results) >= limit:
            break
        try:
            yt_results = YouTubeService.search(search_query, limit=8)
            for item in yt_results:
                yt_id = item.get("youtube_id")
                clean_title = item.get("title", "").lower().strip()

                if not yt_id or yt_id in seen_ids or yt_id in existing_ids:
                    continue
                if clean_title in existing_titles:
                    continue

                seen_ids.add(yt_id)
                item_copy = dict(item)
                item_copy["reason"] = reason
                item_copy["is_downloaded"] = False
                results.append(item_copy)

                if len(results) >= limit:
                    break
        except Exception as e:
            logger.warning(f"Failed to fetch recommendations for query '{search_query}': {e}")

    # Cache the computed recommendations
    _recommendation_cache[cache_key] = (results, now + CACHE_TTL)

    return {"recommendations": results}
