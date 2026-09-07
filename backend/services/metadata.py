"""MusicBrainz metadata and Cover Art Archive service."""
import logging
from typing import Optional

import httpx

from config import MUSICBRAINZ_BASE_URL, COVERART_BASE_URL, USER_AGENT

logger = logging.getLogger(__name__)

HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}


class MetadataService:
    """Fetch music metadata from MusicBrainz and cover art from Cover Art Archive."""

    @staticmethod
    async def search_recording(query: str, limit: int = 10) -> list[dict]:
        """Search MusicBrainz for recordings matching a query.
        
        Args:
            query: Search query (song name, artist, etc.)
            limit: Maximum results
            
        Returns:
            List of recording metadata dicts
        """
        url = f"{MUSICBRAINZ_BASE_URL}/recording/"
        params = {"query": query, "limit": limit, "fmt": "json"}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params, headers=HEADERS, timeout=10)
                if resp.status_code != 200:
                    logger.warning(f"MusicBrainz search returned {resp.status_code}")
                    return []

                data = resp.json()
                results = []
                for recording in data.get("recordings", []):
                    artist = ""
                    if recording.get("artist-credit"):
                        artist = " & ".join(
                            ac.get("name", "") for ac in recording["artist-credit"]
                            if ac.get("name")
                        )

                    album = ""
                    release_id = ""
                    if recording.get("releases"):
                        release = recording["releases"][0]
                        album = release.get("title", "")
                        release_id = release.get("id", "")

                    results.append({
                        "musicbrainz_id": recording.get("id", ""),
                        "title": recording.get("title", ""),
                        "artist": artist,
                        "album": album,
                        "release_id": release_id,
                        "duration": (recording.get("length", 0) or 0) // 1000,  # ms to seconds
                        "score": recording.get("score", 0),
                    })

                return results
        except Exception as e:
            logger.error(f"MusicBrainz search error: {e}")
            return []

    @staticmethod
    async def get_cover_art(release_id: str) -> Optional[str]:
        """Get cover art URL from Cover Art Archive.
        
        Args:
            release_id: MusicBrainz release ID
            
        Returns:
            Cover art URL string or None
        """
        if not release_id:
            return None

        url = f"{COVERART_BASE_URL}/release/{release_id}"

        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(url, headers=HEADERS, timeout=10)
                if resp.status_code != 200:
                    return None

                data = resp.json()
                images = data.get("images", [])

                # Prefer front cover
                for img in images:
                    if img.get("front", False):
                        return img.get("image", "")

                # Fallback to first image
                if images:
                    return images[0].get("image", "")

        except Exception as e:
            logger.debug(f"Cover art not found for {release_id}: {e}")

        return None

    @staticmethod
    async def enrich_song_metadata(title: str, artist: str = "") -> Optional[dict]:
        """Try to find matching metadata from MusicBrainz for a song.
        
        Searches MusicBrainz for the given title/artist and returns
        enriched metadata including cover art if available.
        
        Args:
            title: Song title
            artist: Artist name (optional)
            
        Returns:
            Dict with enriched metadata or None
        """
        query = title
        if artist and artist != "Unknown Artist":
            query = f'{title} AND artist:"{artist}"'

        results = await MetadataService.search_recording(query, limit=3)
        if not results:
            return None

        best = results[0]
        cover_url = await MetadataService.get_cover_art(best.get("release_id", ""))

        return {
            "musicbrainz_id": best.get("musicbrainz_id"),
            "title": best.get("title") or title,
            "artist": best.get("artist") or artist,
            "album": best.get("album", ""),
            "cover_art_url": cover_url,
        }
