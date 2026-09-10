"""
Recommendations router - High-intelligence song recommendations powered by the Homeify Mega-Hits Recommendation Engine.
Integrates YouTube view count metrics, Spotify popularity, and In-App listening telemetry.
"""
import asyncio
import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db, Song, User
from auth import get_optional_user
from services.recommendation_engine import RecommendationEngine
from services.recommendation_engine.engine import EXPLORE_HIT_QUERIES

logger = logging.getLogger("homeify.recommendations")
router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.get("")
async def get_recommendations(
    limit: int = Query(12, ge=1, le=30),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """
    Generate smart, popularity-centric song recommendations based on user history,
    peer listening telemetry, and global chart hits.
    """
    results = await RecommendationEngine.get_personalized_recommendations(
        db=db,
        current_user=current_user,
        limit=limit,
    )
    return {"recommendations": results}


@router.get("/explore")
async def get_explore_recommendations(
    category: str = Query("all"),
    refresh: bool = Query(False),
    limit: int = Query(12, ge=1, le=30),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """
    Explore / Discover Hub:
    Returns certified mainstream hits across Hebrew (עברית), English (אנגלית),
    Spanish (ספרדית / לטיני), and Fresh Mega-Hits (שירים שטרם שמעת).
    All candidate tracks are vetted through the Anti-Obscurity Shield and Multi-Source Popularity Scorer.
    """
    if category in EXPLORE_HIT_QUERIES:
        cat_meta = EXPLORE_HIT_QUERIES[category]
        songs = await RecommendationEngine.get_explore_category(
            db=db,
            category=category,
            limit=limit,
            refresh=refresh,
            current_user=current_user,
        )
        return {
            "category": category,
            "title": cat_meta["title"],
            "subtitle": cat_meta["subtitle"],
            "badge": cat_meta["badge"],
            "songs": songs,
        }

    # 'all' category: concurrently fetch top hits across fresh, hebrew, english, spanish
    order = ["fresh", "hebrew", "english", "spanish"]
    tasks = [
        RecommendationEngine.get_explore_category(
            db=db,
            category=cat_id,
            limit=limit,
            refresh=refresh,
            current_user=current_user,
        )
        for cat_id in order
    ]
    results_list = await asyncio.gather(*tasks)

    sections = []
    for cat_id, songs in zip(order, results_list):
        cat_meta = EXPLORE_HIT_QUERIES[cat_id]
        sections.append({
            "id": cat_id,
            "category": cat_id,
            "title": cat_meta["title"],
            "subtitle": cat_meta["subtitle"],
            "badge": cat_meta["badge"],
            "songs": songs,
        })

    return {"sections": sections}


@router.get("/related")
async def get_related_tracks(
    artist: Optional[str] = Query(None),
    title: Optional[str] = Query(None),
    youtube_id: Optional[str] = Query(None),
    song_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=25),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """
    Generate related popular hit tracks (Song Radio / Infinite Autoplay) based on a seed song.
    Clusters similar artists and styles with verified mainstream popularity.
    """
    # Resolve from DB if song_id or youtube_id provided
    if song_id and (not artist or not title):
        song = db.query(Song).filter(Song.id == song_id).first()
        if song:
            artist = artist or song.artist
            title = title or song.title
            youtube_id = youtube_id or song.youtube_id

    if youtube_id and (not artist or not title):
        song = db.query(Song).filter(Song.youtube_id == youtube_id).first()
        if song:
            artist = artist or song.artist
            title = title or song.title

    artist = (artist or "").strip()
    title = (title or "").strip()

    related_songs = await RecommendationEngine.get_smart_radio(
        db=db,
        seed_artist=artist or "Popular Artist",
        seed_title=title or "Top Track",
        seed_youtube_id=youtube_id,
        limit=limit,
        current_user=current_user,
    )

    return {"related": related_songs, "seed": {"artist": artist, "title": title}}
