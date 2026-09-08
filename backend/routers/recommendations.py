"""Recommendations router - Smart music suggestions based on user listening history and Song Radio."""
import asyncio
import time
import logging
import re
import random
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_

from database import get_db, Song, ListeningHistory, User, Playlist, PlaylistSong
from auth import get_optional_user
from services.youtube import YouTubeService

logger = logging.getLogger("homeify.recommendations")
router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])

# In-memory recommendation cache: {cache_key: (results, expire_at)}
_recommendation_cache: Dict[str, tuple[List[Dict[str, Any]], float]] = {}
CACHE_TTL = 900  # 15 minutes

# Defined clusters of related artists for high-fidelity genre/vibe affinity
ARTIST_AFFINITY_CLUSTERS = [
    # Israeli Mediterranean / Mizrahi / Pop
    [
        "עומר אדם", "אושר כהן", "עדן חסון", "פאר טסי", "אייל גולן", "איתי לוי",
        "אודיה", "עדן בן זקן", "ששון איפרם שאולוב", "ליאור נרקיס", "דודו אהרון",
        "משה פרץ", "בניה ברבי", "נסרין קדרי", "אבי אבורומי", "קובי פרץ", "אליעד"
    ],
    # Israeli Rock / Pop / Indie
    [
        "שלמה ארצי", "עידן רייכל", "אביתר בנאי", "חנן בן ארי", "ישי ריבו",
        "אמיר דדון", "נתן גושן", "ברי סחרוף", "עברי לידר", "דני סנדרסון",
        "תיסלם", "משינה", "היהודים", "מוניקה סקס", "אריק איינשטיין", "מאיר אריאל"
    ],
    # Western Pop
    [
        "katy perry", "taylor swift", "dua lipa", "ariana grande", "lady gaga",
        "rihanna", "beyoncé", "bruno mars", "billie eilish", "olivia rodrigo",
        "selena gomez", "miley cyrus", "shakira", "sabrina carpenter", "chappell roan"
    ],
    # Rock / Alternative
    [
        "radiohead", "coldplay", "muse", "the smile", "arctic monkeys", "the strokes",
        "oasis", "nirvana", "foo fighters", "red hot chili peppers", "linkin park",
        "green day", "pink floyd", "queen"
    ],
    # Hip Hop / Rap
    [
        "drake", "travis scott", "kendrick lamar", "post malone", "kanye west",
        "eminem", "j. cole", "future", "21 savage", "metro boomin", "lil baby"
    ],
    # Electronic / Dance
    [
        "avicii", "david guetta", "calvin harris", "martin garrix", "tiësto",
        "swedish house mafia", "kygo", "marshmello", "the chainsmokers", "daft punk"
    ],
    # Spanish / Latin Pop / Reggaeton / Urbana
    [
        "bad bunny", "karol g", "rosalía", "rosalia", "j balvin", "maluma",
        "rauw alejandro", "shakira", "enrique iglesias", "daddy yankee", "ozuna",
        "peso pluma", "quevedo", "bizarrap", "manuel turizo", "camilo", "sebastian yatra",
        "feid", "anuel aa", "becky g", "alvaro soler", "aitana"
    ],
]


def clean_music_title(title: str) -> str:
    """Strip common YouTube noise like (Prod. by...), Official Video, etc."""
    cleaned = re.sub(
        r"[\(\[\{].*?(prod|official|video|audio|remix|feat|ft|קליפ|רשמי|הפקת).*?[\)\]\}]",
        "",
        title,
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


@router.get("")
async def get_recommendations(
    limit: int = Query(12, ge=1, le=30),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Generate smart song recommendations based on user listening history and library."""
    now = time.time()
    user_key = current_user.id if current_user else "anon"
    cache_key = f"rec_{user_key}_{limit}"

    # Return cached recommendations if still fresh
    if cache_key in _recommendation_cache:
        cached_results, expire_at = _recommendation_cache[cache_key]
        if now < expire_at and cached_results:
            return {"recommendations": cached_results}

    # 1. Analyze user listening history
    history_query = (
        db.query(
            Song.artist,
            Song.title,
            Song.youtube_id,
            func.count(ListeningHistory.id).label("play_count"),
        )
        .join(Song, Song.id == ListeningHistory.song_id)
    )
    if current_user:
        history_query = history_query.filter(ListeningHistory.user_id == current_user.id)

    top_history = (
        history_query.group_by(Song.artist, Song.title, Song.youtube_id)
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
            yt_results = await asyncio.to_thread(YouTubeService.search, search_query, max_results=8)
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


EXPLORE_CATEGORIES = {
    "fresh": {
        "id": "fresh",
        "title": "שירים שטרם שמעת 🔥",
        "subtitle": "גילויים מובחרים ורעננים שלא הכרת מעולם",
        "badge": "גילוי חדש",
        "queries": [
            "underrated viral songs official audio",
            "trending indie pop discoveries",
            "hidden gems songs official audio",
            "fresh music discoveries top hits",
            "viral hits you need to hear",
            "new music releases official audio",
        ],
    },
    "hebrew": {
        "id": "hebrew",
        "title": "להיטים בעברית 🇮🇱",
        "subtitle": "השירים הישראליים החמים והחדשים ביותר",
        "badge": "עברית",
        "queries": [
            "להיטים ישראליים חדשים 2025 2026 official audio",
            "שירים ישראליים מובילים להיטים",
            "פופ ואינדי ישראלי חדש שירים",
            "מצעד המוזיקה הישראלית להיטים",
            "עומר אדם אושר כהן עדן חסון פאר טסי שירים",
            "שירים ישראליים מקפיצים להיטים",
        ],
    },
    "english": {
        "id": "english",
        "title": "Top Global Hits 🌍",
        "subtitle": "להיטים בינלאומיים חמים וגילויים עולמיים",
        "badge": "English",
        "queries": [
            "global top viral hits official audio",
            "billboard hot tracks hits",
            "trending pop music discoveries official",
            "today top hits world audio",
            "top english music hits official",
            "indie alternative pop viral tracks",
        ],
    },
    "spanish": {
        "id": "spanish",
        "title": "Ritmo Latino & Español 💃",
        "subtitle": "רגאטון, פופ לטיני ולהיטים לוהטים בספרדית",
        "badge": "Español",
        "queries": [
            "exitos reggaeton latino official audio",
            "canciones en espanol exitos del momento",
            "latin pop top hits official audio",
            "lo mejor del reggaeton urbano exitos",
            "bad bunny karol g rosalia rauw alejandro hits",
            "tendencias musica latina espanol",
        ],
    },
}


async def _fetch_category_songs(
    cat_key: str,
    limit: int,
    existing_ids: set,
    existing_titles: set,
) -> List[Dict[str, Any]]:
    cat_info = EXPLORE_CATEGORIES.get(cat_key)
    if not cat_info:
        return []

    # Pick 2-3 randomized queries from category to keep discoveries dynamic
    queries = list(cat_info["queries"])
    random.shuffle(queries)
    selected_queries = queries[:3]

    results: List[Dict[str, Any]] = []
    seen_ids = set()

    for q in selected_queries:
        if len(results) >= limit:
            break
        try:
            yt_results = await asyncio.to_thread(YouTubeService.search, q, max_results=8)
            for item in yt_results:
                yt_id = item.get("youtube_id")
                dur = item.get("duration") or 0
                raw_title = item.get("title", "")
                clean_t = clean_music_title(raw_title)
                clean_lower = clean_t.lower().strip()

                if not yt_id or yt_id in seen_ids or yt_id in existing_ids:
                    continue
                if clean_lower in existing_titles:
                    continue
                # Discard very short clips (< 60s) or DJ hour sets (> 500s)
                if dur > 0 and (dur < 60 or dur > 500):
                    continue

                seen_ids.add(yt_id)
                item_copy = dict(item)
                item_copy["title"] = clean_t or raw_title
                item_copy["category"] = cat_key
                item_copy["language"] = cat_key
                item_copy["badge"] = cat_info["badge"]
                item_copy["reason"] = cat_info["title"]
                item_copy["is_downloaded"] = False
                results.append(item_copy)

                if len(results) >= limit:
                    break
        except Exception as e:
            logger.warning(f"Error fetching explore songs for {cat_key} ({q}): {e}")

    return results


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
    Returns curated music across Hebrew (עברית), English (אנגלית), Spanish (ספרדית / לטיני),
    and Fresh Discoveries (שירים שטרם שמעת).
    Strictly filters out any songs already in DB or listening history so every song feels new.
    """
    now = time.time()
    user_key = current_user.id if current_user else "anon"
    cache_key = f"explore_{user_key}_{category}_{limit}"

    if refresh:
        # Clear matching explore cache entries
        keys_to_del = [k for k in _recommendation_cache if k.startswith("explore_")]
        for k in keys_to_del:
            _recommendation_cache.pop(k, None)
    elif cache_key in _recommendation_cache:
        cached_data, expire_at = _recommendation_cache[cache_key]
        if now < expire_at and cached_data:
            return cached_data

    # Collect existing song youtube_ids and titles to exclude
    existing_songs = db.query(Song.youtube_id, Song.title).all()
    existing_ids = {s.youtube_id for s in existing_songs if s.youtube_id}
    existing_titles = {s.title.lower().strip() for s in existing_songs if s.title}

    # Also collect from listening history (filtered to user if logged in)
    hist_q = db.query(Song.youtube_id, Song.title).join(ListeningHistory, ListeningHistory.song_id == Song.id)
    if current_user:
        hist_q = hist_q.filter(ListeningHistory.user_id == current_user.id)
    history_records = hist_q.all()
    for hr in history_records:
        if hr.youtube_id:
            existing_ids.add(hr.youtube_id)
        if hr.title:
            existing_titles.add(hr.title.lower().strip())

    # If current_user, also exclude songs from their playlists
    if current_user:
        pl_songs = (
            db.query(Song.youtube_id, Song.title)
            .join(PlaylistSong, PlaylistSong.song_id == Song.id)
            .join(Playlist, Playlist.id == PlaylistSong.playlist_id)
            .filter(Playlist.user_id == current_user.id)
            .all()
        )
        for ps in pl_songs:
            if ps.youtube_id:
                existing_ids.add(ps.youtube_id)
            if ps.title:
                existing_titles.add(ps.title.lower().strip())

    if category in EXPLORE_CATEGORIES:
        # Single category requested
        cat_meta = EXPLORE_CATEGORIES[category]
        songs = await _fetch_category_songs(category, limit, existing_ids, existing_titles)
        payload = {
            "category": category,
            "title": cat_meta["title"],
            "subtitle": cat_meta["subtitle"],
            "badge": cat_meta["badge"],
            "songs": songs,
        }
        _recommendation_cache[cache_key] = (payload, now + 1800)
        return payload

    # Default "all": fetch sections for fresh, hebrew, english, spanish concurrently
    order = ["fresh", "hebrew", "english", "spanish"]
    tasks = [
        _fetch_category_songs(cat_id, limit, existing_ids, existing_titles)
        for cat_id in order
    ]
    results_list = await asyncio.gather(*tasks)

    sections = []
    for cat_id, songs in zip(order, results_list):
        cat_meta = EXPLORE_CATEGORIES[cat_id]
        sections.append({
            "id": cat_id,
            "category": cat_id,
            "title": cat_meta["title"],
            "subtitle": cat_meta["subtitle"],
            "badge": cat_meta["badge"],
            "songs": songs,
        })

    payload = {"sections": sections}
    _recommendation_cache[cache_key] = (payload, now + 1800)
    return payload


@router.get("/related")
async def get_related_tracks(
    artist: Optional[str] = Query(None),
    title: Optional[str] = Query(None),
    youtube_id: Optional[str] = Query(None),
    song_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=25),
    db: Session = Depends(get_db),
):
    """
    Generate related and similar tracks (Song Radio / Infinite Autoplay) based on a seed song.
    Clusters similar artists and styles (e.g. Israeli Pop/Mizrahi, Rock, Indie, Western Pop).
    """
    now = time.time()

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
    clean_t = clean_music_title(title)

    cache_key = f"related_{artist.lower()}_{clean_t.lower()}_{limit}"
    if cache_key in _recommendation_cache:
        cached_results, expire_at = _recommendation_cache[cache_key]
        if now < expire_at and cached_results:
            return {"related": cached_results, "seed": {"artist": artist, "title": title}}

    # Check for Hebrew text in artist or title
    has_hebrew = bool(re.search(r"[\u0590-\u05fe]", f"{artist} {title}"))

    # Find matching artist cluster
    matched_cluster = None
    if artist:
        for cluster in ARTIST_AFFINITY_CLUSTERS:
            if any(a.lower() in artist.lower() or artist.lower() in a.lower() for a in cluster):
                # Pick other artists in the same cluster
                matched_cluster = [
                    a for a in cluster
                    if a.lower() not in artist.lower() and artist.lower() not in a.lower()
                ]
                break

    queries_to_run = []
    if matched_cluster:
        # Pick 2-3 related artists from the same cluster
        num_picks = min(3, len(matched_cluster))
        selected_related = random.sample(matched_cluster, num_picks)

        # 1. Search top hits from related artists
        for rel_artist in selected_related:
            if has_hebrew:
                queries_to_run.append((
                    f"{rel_artist} שירים להיטים official audio",
                    f"דומה בסגנון ל-{artist}"
                ))
            else:
                queries_to_run.append((
                    f"{rel_artist} top hits official audio",
                    f"Similar to {artist}"
                ))

        # 2. Also search more hits from the same artist
        if has_hebrew:
            queries_to_run.append((
                f"{artist} שירים להיטים official audio",
                f"עוד שירים מעולים של {artist}"
            ))
        else:
            queries_to_run.append((
                f"{artist} top tracks official audio",
                f"More from {artist}"
            ))
    else:
        # No cluster match: search based on title & artist similarities
        if has_hebrew:
            if artist:
                queries_to_run.append((
                    f"שירים כמו {artist} {clean_t}",
                    f"שירים דומים ל-{artist}"
                ))
                queries_to_run.append((
                    f"{artist} שירים דומים להיטים",
                    f"שירים קשורים ל-{artist}"
                ))
            else:
                queries_to_run.append((
                    f"שירים כמו {clean_t}",
                    f"שירים בסגנון {clean_t}"
                ))
        else:
            if artist:
                queries_to_run.append((
                    f"songs like {artist} {clean_t} official audio",
                    f"Similar to {artist}"
                ))
                queries_to_run.append((
                    f"{artist} similar artists hits",
                    f"Based on {artist}"
                ))
            else:
                queries_to_run.append((
                    f"songs like {clean_t} official audio",
                    f"Similar vibe"
                ))

    # Also check local library DB for existing songs that match
    results: List[Dict[str, Any]] = []
    seen_ids = set()
    if youtube_id:
        seen_ids.add(youtube_id)

    # Check local songs matching cluster or artist
    if artist:
        local_matches = db.query(Song).filter(
            or_(
                Song.artist.ilike(f"%{artist}%"),
                Song.title.ilike(f"%{artist}%")
            )
        ).limit(6).all()
        for s in local_matches:
            if song_id and s.id == song_id:
                continue
            if youtube_id and s.youtube_id == youtube_id:
                continue
            if clean_t and clean_t.lower() in (s.title or "").lower():
                continue
            if s.youtube_id:
                if s.youtube_id in seen_ids:
                    continue
                seen_ids.add(s.youtube_id)
            results.append({
                "id": s.id,
                "title": s.title,
                "artist": s.artist,
                "duration": s.duration,
                "cover_art_url": s.cover_art_url,
                "thumbnail": s.cover_art_url,
                "youtube_id": s.youtube_id,
                "youtube_url": f"https://www.youtube.com/watch?v={s.youtube_id}" if s.youtube_id else None,
                "is_downloaded": True,
                "reason": f"From your library ({s.artist})",
            })

    # Search online via YouTube for fresh similar tracks
    for search_query, reason in queries_to_run:
        if len(results) >= limit:
            break
        try:
            yt_results = await asyncio.to_thread(YouTubeService.search, search_query, max_results=6)
            for item in yt_results:
                yt_id = item.get("youtube_id")
                dur = item.get("duration") or 0
                item_title = item.get("title", "")
                clean_it = item_title.lower()

                # Filter out short clips, DJ long sets, and duplicates
                if not yt_id or yt_id in seen_ids:
                    continue
                if dur > 0 and (dur < 80 or dur > 420):
                    continue
                if clean_t and clean_t.lower() in clean_it and artist.lower() in clean_it:
                    continue

                seen_ids.add(yt_id)
                item_copy = dict(item)
                item_copy["reason"] = reason
                item_copy["is_downloaded"] = False
                results.append(item_copy)

                if len(results) >= limit:
                    break
        except Exception as e:
            logger.warning(f"Failed to fetch related tracks for query '{search_query}': {e}")

    # Cache results (30 min cache)
    _recommendation_cache[cache_key] = (results, now + 1800)

    return {"related": results, "seed": {"artist": artist, "title": title}}
