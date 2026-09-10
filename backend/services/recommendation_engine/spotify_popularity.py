"""Spotify popularity scoring, Web API integration, and chart popularity enrichment."""
import os
import time
import logging
import asyncio
from typing import Optional, Dict, Tuple
import httpx

from .config import CACHE_TTL_POPULARITY_SCORES, MIN_SPOTIFY_POPULARITY, HIGH_SPOTIFY_POPULARITY

logger = logging.getLogger("homeify.recommendation_engine.spotify")

# In-memory popularity cache: {track_key: (score, track_pop, artist_pop, expires_at)}
_spotify_cache: Dict[str, Tuple[float, int, int, float]] = {}

# Built-in index of verified mainstream chart-toppers and high-tier artists for instant score boost
VERIFIED_MAINSTREAM_ARTISTS = {
    # Israeli Chart Toppers (Average Spotify Popularity 70-95)
    "עומר אדם": 88, "אושר כהן": 86, "עדן חסון": 85, "פאר טסי": 84, "אייל גולן": 85,
    "איתי לוי": 82, "אודיה": 83, "עדן בן זקן": 84, "ששון איפרם שאולוב": 85, "סטטיק": 80,
    "נועה קירל": 82, "חנן בן ארי": 83, "ישי ריבו": 81, "אנה זק": 78, "אליעד": 76,
    "דודו אהרון": 77, "משה פרץ": 77, "בניה ברבי": 78, "ליאור נרקיס": 77, "נסרין קדרי": 76,
    "שלמה ארצי": 80, "עידן רייכל": 81, "אביתר בנאי": 78, "ברי סחרוף": 76, "עברי לידר": 76,
    # Global Pop & R&B Titans (Average Spotify Popularity 80-98)
    "taylor swift": 96, "the weeknd": 95, "bad bunny": 94, "drake": 93,
    "billie eilish": 92, "ariana grande": 91, "dua lipa": 90, "bruno mars": 92,
    "ed sheeran": 90, "post malone": 91, "rihanna": 89, "justin bieber": 89,
    "sabrina carpenter": 92, "chappell roan": 88, "olivia rodrigo": 89, "lady gaga": 90,
    "beyoncé": 88, "coldplay": 90, "eminem": 91, "travis scott": 92, "kendrick lamar": 92,
    "david guetta": 88, "calvin harris": 87, "avicii": 86, "shakira": 89, "karol g": 91,
    "rosalía": 86, "j balvin": 87, "maluma": 85, "rauw alejandro": 88, "daddy yankee": 87,
}


class SpotifyPopularityService:
    """Manages Spotify Web API token lifecycle and popularity calculations."""

    _access_token: Optional[str] = None
    _token_expires_at: float = 0.0

    @classmethod
    async def _get_spotify_token(cls) -> Optional[str]:
        """Obtain or refresh an app-level Spotify client credentials token if configured."""
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

        if not client_id or not client_secret:
            return None

        now = time.time()
        if cls._access_token and now < cls._token_expires_at - 60:
            return cls._access_token

        token_url = "https://accounts.spotify.com/api/token"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    token_url,
                    data={"grant_type": "client_credentials"},
                    auth=(client_id, client_secret),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    cls._access_token = data.get("access_token")
                    expires_in = data.get("expires_in", 3600)
                    cls._token_expires_at = now + expires_in
                    return cls._access_token
        except Exception as e:
            logger.debug(f"Could not retrieve Spotify token: {e}")
        return None

    @classmethod
    async def get_popularity(cls, title: str, artist: str = "") -> Tuple[float, int, int]:
        """
        Get composite Spotify popularity score (0-100), track popularity, and artist popularity.
        
        Returns:
            Tuple of (composite_spotify_score, track_popularity, artist_popularity)
        """
        clean_title = (title or "").strip().lower()
        clean_artist = (artist or "").strip().lower()
        cache_key = f"{clean_title}::{clean_artist}"

        now = time.time()
        if cache_key in _spotify_cache:
            score, t_pop, a_pop, expire_at = _spotify_cache[cache_key]
            if now < expire_at:
                return score, t_pop, a_pop

        # 1. Check verified artist popularity index
        artist_pop_estimate = 50
        for verified_name, pop in VERIFIED_MAINSTREAM_ARTISTS.items():
            if verified_name in clean_artist or (clean_artist and clean_artist in verified_name):
                artist_pop_estimate = pop
                break

        # 2. Try querying official Spotify Web API if credentials exist
        token = await cls._get_spotify_token()
        if token:
            try:
                search_q = f"track:{title}"
                if artist and artist != "Unknown Artist":
                    search_q += f" artist:{artist}"

                headers = {"Authorization": f"Bearer {token}"}
                async with httpx.AsyncClient(timeout=6.0) as client:
                    resp = await client.get(
                        "https://api.spotify.com/v1/search",
                        params={"q": search_q, "type": "track", "limit": 1},
                        headers=headers,
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        items = data.get("tracks", {}).get("items", [])
                        if items:
                            track_item = items[0]
                            t_pop = track_item.get("popularity", 50)
                            # Weighted Spotify score
                            final_score = (t_pop * 0.7) + (artist_pop_estimate * 0.3)
                            _spotify_cache[cache_key] = (final_score, t_pop, artist_pop_estimate, now + CACHE_TTL_POPULARITY_SCORES)
                            return final_score, t_pop, artist_pop_estimate
            except Exception as e:
                logger.debug(f"Spotify API search failed: {e}")

        # 3. Fallback: Query iTunes Search API to verify official track recognition
        try:
            query = f"{artist} {title}".strip()
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(
                    "https://itunes.apple.com/search",
                    params={"term": query, "entity": "song", "limit": 3},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    if results:
                        # Recognized official track
                        top_res = results[0]
                        # Official recognized track gets solid base popularity
                        t_pop = max(60, artist_pop_estimate - 5)
                        final_score = (t_pop * 0.6) + (artist_pop_estimate * 0.4)
                        _spotify_cache[cache_key] = (final_score, t_pop, artist_pop_estimate, now + CACHE_TTL_POPULARITY_SCORES)
                        return final_score, t_pop, artist_pop_estimate
        except Exception as e:
            logger.debug(f"iTunes popularity lookup failed: {e}")

        # Default fallback based on artist prominence
        t_pop = artist_pop_estimate - 10
        final_score = float(max(30, (t_pop * 0.5) + (artist_pop_estimate * 0.5)))
        _spotify_cache[cache_key] = (final_score, t_pop, artist_pop_estimate, now + CACHE_TTL_POPULARITY_SCORES)
        return final_score, t_pop, artist_pop_estimate
