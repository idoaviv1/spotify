"""Central Recommendation Engine Orchestrator."""
import time
import random
import asyncio
import logging
import re
from typing import List, Dict, Any, Optional, Set
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_

from database import Song, ListeningHistory, User, Playlist, PlaylistSong
from services.youtube import YouTubeService
from .config import CACHE_TTL_RECOMMENDATIONS
from .models import ScoredTrack
from .scoring_pipeline import ScoringPipeline
from .collaborative_filter import CollaborativeFilterService, GENRE_CLUSTERS

logger = logging.getLogger("homeify.recommendation_engine.engine")

# In-memory recommendation cache: {key: (results, expire_at)}
_engine_cache: Dict[str, tuple[List[Dict[str, Any]], float]] = {}


def clean_music_title(title: str) -> str:
    """Strip common YouTube noise like (Prod. by...), Official Video, etc."""
    cleaned = re.sub(
        r"[\(\[\{].*?(prod|official|video|audio|remix|feat|ft|קליפ|רשמי|הפקת).*?[\)\]\}]",
        "",
        title,
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


# Top verified chart & hit queries designed specifically to target known mainstream bangers
EXPLORE_HIT_QUERIES = {
    "hebrew": {
        "id": "hebrew",
        "title": "להיטים בעברית 🇮🇱",
        "subtitle": "הלהיטים המושמעים והמובילים בישראל",
        "badge": "עברית",
        "queries": [
            "מצעד הלהיטים הישראלי שירים מובילים official audio",
            "עומר אדם אושר כהן עדן חסון פאר טסי להיטים",
            "השירים הכי מושמעים בישראל להיטים",
            "פופ ישראלי להיטים חמים official audio",
            "שירים ישראליים מובילים מצעד",
        ],
    },
    "english": {
        "id": "english",
        "title": "Top Global Hits 🌍",
        "subtitle": "הלהיטים הבינלאומיים המושמעים ביותר בעולם",
        "badge": "English",
        "queries": [
            "billboard hot 100 top hits official audio",
            "today top hits global pop official audio",
            "spotify top 50 global viral hits official",
            "top music hits world audio 2025 2026",
            "taylor swift the weeknd dua lipa top tracks",
        ],
    },
    "spanish": {
        "id": "spanish",
        "title": "Ritmo Latino & Español 💃",
        "subtitle": "רגאטון ולהיטים לוהטים בספרדית שמקפיצים את המצעדים",
        "badge": "Español",
        "queries": [
            "exitos reggaeton latino billboard official audio",
            "bad bunny karol g rosalia rauw alejandro exitos",
            "top canciones en espanol exitos del momento",
            "latin pop top hits official audio",
        ],
    },
    "fresh": {
        "id": "fresh",
        "title": "שירים שטרם שמעת 🔥",
        "subtitle": "להיטי ענק מוכחים שעדיין לא הוספת לספרייה",
        "badge": "להיט מומלץ",
        "queries": [
            "top viral hits you need to hear official audio",
            "global smash hits pop dance official",
            "certified trending hits official music video",
            "all time popular music hits official",
        ],
    },
}


class RecommendationEngine:
    """
    Main entrypoint for intelligent, popularity-centric song recommendations.
    Guarantees recommendations are recognizable hits with high view counts and ratings.
    """

    @classmethod
    async def get_personalized_recommendations(
        cls,
        db: Session,
        current_user: Optional[User],
        limit: int = 12
    ) -> List[Dict[str, Any]]:
        """
        Generate recommendations personalized to user history while enforcing verified hit standards.
        """
        now = time.time()
        user_id = current_user.id if current_user else None
        cache_key = f"personal_{user_id or 'anon'}_{limit}"

        if cache_key in _engine_cache:
            cached_data, expire_at = _engine_cache[cache_key]
            if now < expire_at:
                return cached_data

        # 1. Existing songs to avoid duplicates
        existing_songs = db.query(Song.youtube_id, Song.title).all()
        existing_ids: Set[str] = {s.youtube_id for s in existing_songs if s.youtube_id}
        existing_titles: Set[str] = {s.title.lower().strip() for s in existing_songs if s.title}

        # 2. Collaborative filtering: peer recommendations from other users with similar taste
        peer_recs = CollaborativeFilterService.find_collaborative_recommendations(
            db=db,
            user_id=user_id,
            limit=4
        )

        candidates: List[Dict[str, Any]] = []
        candidates.extend(peer_recs)

        # 3. Analyze user's top history to find seed artists
        history_query = (
            db.query(Song.artist, Song.title, func.count(ListeningHistory.id).label("play_count"))
            .join(Song, Song.id == ListeningHistory.song_id)
        )
        if user_id:
            history_query = history_query.filter(ListeningHistory.user_id == user_id)

        top_history = (
            history_query.group_by(Song.artist, Song.title)
            .order_by(desc("play_count"))
            .limit(6)
            .all()
        )

        search_tasks = []
        seen_queries = set()

        if top_history:
            for entry in top_history[:3]:
                artist = entry.artist
                if artist and artist != "Unknown Artist" and artist not in seen_queries:
                    seen_queries.add(artist)
                    # Query for certified top tracks by this artist or related cluster artists
                    search_tasks.append((
                        f"{artist} top hits official audio",
                        f"להיט מומלץ על בסיס האזנות ל-{artist}"
                    ))
        else:
            # Fallback for new users: Top hits across Hebrew and English
            search_tasks.append(("עומר אדם אושר כהן עדן חסון להיטים", "השירים המושמעים ביותר בישראל"))
            search_tasks.append(("billboard hot 100 top hits official audio", "Global Top Hits"))

        # 4. Fetch candidates from YouTube
        for query_str, reason_str in search_tasks:
            try:
                yt_results = await asyncio.to_thread(YouTubeService.search, query_str, max_results=8)
                for item in yt_results:
                    yt_id = item.get("youtube_id")
                    title = clean_music_title(item.get("title", ""))
                    if not yt_id or yt_id in existing_ids or title.lower() in existing_titles:
                        continue
                    item_copy = dict(item)
                    item_copy["title"] = title
                    item_copy["reason"] = reason_str
                    candidates.append(item_copy)
            except Exception as e:
                logger.warning(f"Error fetching candidates for query '{query_str}': {e}")

        # 5. Run candidates through the multi-source scoring pipeline
        scored_tracks: List[ScoredTrack] = []
        scored_ids = set()

        for cand in candidates:
            yt_id = cand.get("youtube_id")
            if not yt_id or yt_id in scored_ids:
                continue
            scored_ids.add(yt_id)

            scored = await ScoringPipeline.score_track(
                candidate=cand,
                db=db,
                user_id=user_id,
                default_reason=cand.get("reason", "Verified Mainstream Hit")
            )
            if scored:
                scored_tracks.append(scored)

        # 6. Rank and enforce diversity
        final_tracks = ScoringPipeline.rank_and_diversify(scored_tracks, limit=limit)
        results = [t.to_dict() for t in final_tracks]

        _engine_cache[cache_key] = (results, now + CACHE_TTL_RECOMMENDATIONS)
        return results

    @classmethod
    async def get_explore_category(
        cls,
        db: Session,
        category: str,
        limit: int = 12,
        refresh: bool = False,
        current_user: Optional[User] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetch and rank verified popular hits for an explore category.
        """
        now = time.time()
        user_id = current_user.id if current_user else None
        cache_key = f"explore_cat_{category}_{user_id or 'anon'}_{limit}"

        if refresh:
            _engine_cache.pop(cache_key, None)
        elif cache_key in _engine_cache:
            cached_data, expire_at = _engine_cache[cache_key]
            if now < expire_at:
                return cached_data

        cat_info = EXPLORE_HIT_QUERIES.get(category, EXPLORE_HIT_QUERIES["fresh"])
        queries = list(cat_info["queries"])
        random.shuffle(queries)
        selected_queries = queries[:3]

        # Existing songs to exclude
        existing_songs = db.query(Song.youtube_id, Song.title).all()
        existing_ids = {s.youtube_id for s in existing_songs if s.youtube_id}
        existing_titles = {s.title.lower().strip() for s in existing_songs if s.title}

        candidates: List[Dict[str, Any]] = []
        seen_ids = set()

        for q in selected_queries:
            try:
                yt_results = await asyncio.to_thread(YouTubeService.search, q, max_results=10)
                for item in yt_results:
                    yt_id = item.get("youtube_id")
                    title = clean_music_title(item.get("title", ""))
                    if not yt_id or yt_id in seen_ids or yt_id in existing_ids or title.lower() in existing_titles:
                        continue
                    seen_ids.add(yt_id)
                    item_copy = dict(item)
                    item_copy["title"] = title
                    item_copy["category"] = category
                    item_copy["language"] = category
                    item_copy["reason"] = cat_info["title"]
                    candidates.append(item_copy)
            except Exception as e:
                logger.warning(f"Error fetching explore candidates for '{q}': {e}")

        # Score candidates through pipeline
        scored_tracks: List[ScoredTrack] = []
        for cand in candidates:
            scored = await ScoringPipeline.score_track(
                candidate=cand,
                db=db,
                user_id=user_id,
                category=category,
                language=category,
                default_reason=cat_info["title"]
            )
            if scored:
                scored_tracks.append(scored)

        final_tracks = ScoringPipeline.rank_and_diversify(scored_tracks, limit=limit)
        results = [t.to_dict() for t in final_tracks]

        _engine_cache[cache_key] = (results, now + CACHE_TTL_RECOMMENDATIONS)
        return results

    @classmethod
    async def get_smart_radio(
        cls,
        db: Session,
        seed_artist: str,
        seed_title: str,
        seed_youtube_id: Optional[str] = None,
        limit: int = 10,
        current_user: Optional[User] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate high-accuracy related tracks (Radio / Infinite Autoplay) with verified popularity.
        """
        now = time.time()
        clean_seed_title = clean_music_title(seed_title)
        cache_key = f"radio_{seed_artist.lower()}_{clean_seed_title.lower()}_{limit}"

        if cache_key in _engine_cache:
            cached_data, expire_at = _engine_cache[cache_key]
            if now < expire_at:
                return cached_data

        user_id = current_user.id if current_user else None
        seen_ids = set()
        if seed_youtube_id:
            seen_ids.add(seed_youtube_id)

        # 1. Cluster discovery: Find matching cluster of top artists
        matched_cluster = None
        seed_artist_clean = seed_artist.lower().strip()

        for cluster_name, artists in GENRE_CLUSTERS.items():
            cluster_lower = {a.lower() for a in artists}
            if any(a in seed_artist_clean or seed_artist_clean in a for a in cluster_lower):
                matched_cluster = [a for a in artists if a.lower() not in seed_artist_clean]
                break

        queries_to_run = []
        if matched_cluster:
            # Pick top related artists from the same cluster
            num_picks = min(3, len(matched_cluster))
            selected_peers = random.sample(matched_cluster, num_picks)
            for peer in selected_peers:
                queries_to_run.append((
                    f"{peer} להיטים שירים מובילים official audio",
                    f"להיט בסגנון דומה ל-{seed_artist}"
                ))
            queries_to_run.append((
                f"{seed_artist} להיטים מובילים official audio",
                f"עוד להיטים מעולים של {seed_artist}"
            ))
        else:
            queries_to_run.append((
                f"{seed_artist} top hits official audio",
                f"Popular hits related to {seed_artist}"
            ))
            queries_to_run.append((
                f"songs like {seed_artist} {clean_seed_title} official audio",
                f"Similar to {clean_seed_title}"
            ))

        candidates: List[Dict[str, Any]] = []

        # 2. Check local DB for existing songs matching cluster
        local_matches = db.query(Song).filter(
            or_(
                Song.artist.ilike(f"%{seed_artist}%"),
                Song.title.ilike(f"%{seed_artist}%")
            )
        ).limit(5).all()

        for s in local_matches:
            if seed_youtube_id and s.youtube_id == seed_youtube_id:
                continue
            if s.youtube_id:
                if s.youtube_id in seen_ids:
                    continue
                seen_ids.add(s.youtube_id)
            candidates.append({
                "id": s.id,
                "title": s.title,
                "artist": s.artist,
                "duration": s.duration,
                "cover_art_url": s.cover_art_url,
                "thumbnail": s.cover_art_url,
                "youtube_id": s.youtube_id,
                "is_downloaded": True,
                "reason": f"From your library ({s.artist})"
            })

        # 3. Search online for top candidates
        for q, reason in queries_to_run:
            try:
                yt_results = await asyncio.to_thread(YouTubeService.search, q, max_results=6)
                for item in yt_results:
                    yt_id = item.get("youtube_id")
                    title = clean_music_title(item.get("title", ""))
                    if not yt_id or yt_id in seen_ids:
                        continue
                    seen_ids.add(yt_id)
                    item_copy = dict(item)
                    item_copy["title"] = title
                    item_copy["reason"] = reason
                    candidates.append(item_copy)
            except Exception as e:
                logger.warning(f"Error fetching radio candidates for '{q}': {e}")

        # 4. Score and filter candidates
        scored_tracks: List[ScoredTrack] = []
        for cand in candidates:
            scored = await ScoringPipeline.score_track(
                candidate=cand,
                db=db,
                user_id=user_id,
                default_reason=cand.get("reason", f"Radio: Similar to {seed_artist}")
            )
            if scored:
                scored_tracks.append(scored)

        final_tracks = ScoringPipeline.rank_and_diversify(scored_tracks, limit=limit)
        results = [t.to_dict() for t in final_tracks]

        _engine_cache[cache_key] = (results, now + CACHE_TTL_RECOMMENDATIONS)
        return results
