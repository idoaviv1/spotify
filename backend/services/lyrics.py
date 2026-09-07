"""LRCLIB lyrics service - free synchronized lyrics API."""
import logging
from typing import Optional

import httpx

from config import LRCLIB_BASE_URL, USER_AGENT

logger = logging.getLogger(__name__)

HEADERS = {"User-Agent": USER_AGENT}


class LyricsService:
    """Fetch lyrics from LRCLIB (free, no API key required)."""

    @staticmethod
    async def get_lyrics(title: str, artist: str = "", album: str = "",
                         duration: int = 0) -> Optional[dict]:
        """Get lyrics for a song from LRCLIB.
        
        Tries the /get endpoint first (exact match), then falls back to /search.
        
        Args:
            title: Song title
            artist: Artist name
            album: Album name
            duration: Song duration in seconds
            
        Returns:
            Dict with plain and synced lyrics, or None
        """
        # Try exact match first
        result = await _try_exact_match(title, artist, album, duration)
        if result:
            return result

        # Fallback to search
        return await _try_search(title, artist)


    @staticmethod
    async def search_lyrics(query: str) -> list[dict]:
        """Search LRCLIB for lyrics matching a query.
        
        Args:
            query: Search query
            
        Returns:
            List of lyrics results
        """
        url = f"{LRCLIB_BASE_URL}/search"
        params = {"q": query}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params, headers=HEADERS, timeout=10)
                if resp.status_code != 200:
                    return []

                data = resp.json()
                return [_format_result(item) for item in data[:10]]
        except Exception as e:
            logger.error(f"LRCLIB search error: {e}")
            return []


async def _try_exact_match(title: str, artist: str, album: str, duration: int) -> Optional[dict]:
    """Try to get an exact match from LRCLIB /get endpoint."""
    url = f"{LRCLIB_BASE_URL}/get"
    params = {"track_name": title}

    if artist:
        params["artist_name"] = artist
    if album:
        params["album_name"] = album
    if duration:
        params["duration"] = duration

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, headers=HEADERS, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return _format_result(data)
    except Exception as e:
        logger.debug(f"LRCLIB exact match failed: {e}")

    return None


async def _try_search(title: str, artist: str) -> Optional[dict]:
    """Fallback: search LRCLIB and return the best match."""
    query = f"{artist} {title}" if artist else title
    url = f"{LRCLIB_BASE_URL}/search"
    params = {"q": query}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, headers=HEADERS, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data:
                    return _format_result(data[0])
    except Exception as e:
        logger.debug(f"LRCLIB search failed: {e}")

    return None


def _format_result(data: dict) -> dict:
    """Format a LRCLIB response into a consistent dict."""
    return {
        "id": data.get("id"),
        "title": data.get("trackName", ""),
        "artist": data.get("artistName", ""),
        "album": data.get("albumName", ""),
        "duration": data.get("duration", 0),
        "plain_lyrics": data.get("plainLyrics", ""),
        "synced_lyrics": data.get("syncedLyrics", ""),
        "has_synced": bool(data.get("syncedLyrics")),
    }
