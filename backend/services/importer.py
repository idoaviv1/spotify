"""Playlist and Music Importer Service for Homeify.
Supports Spotify, Apple Music, YouTube playlists, and raw text tracklists.
"""
import re
import json
import uuid
import logging
import asyncio
from typing import Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor

import requests
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from database import Playlist, Song, PlaylistSong
from services.youtube import YouTubeService

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,he;q=0.8",
}

RESOLVE_EXECUTOR = ThreadPoolExecutor(max_workers=6, thread_name_prefix="importer_resolve")


class PlaylistImporterService:
    """Service for extracting playlist/album metadata and importing into Homeify."""

    @staticmethod
    def detect_source(input_str: str) -> Dict[str, Any]:
        """Detect source platform and entity type from URL or text."""
        input_clean = input_str.strip()

        # 1. Spotify URL or URI
        sp_match = re.search(
            r"spotify(?:\.com/(?:intl-[a-z]+/)?|:)(playlist|album|track)[:/]([a-zA-Z0-9]+)",
            input_clean,
        )
        if sp_match:
            return {
                "platform": "spotify",
                "entity_type": sp_match.group(1),
                "entity_id": sp_match.group(2),
                "url": input_clean,
            }

        # 2. Apple Music URL
        am_match = re.search(
            r"music\.apple\.com/([a-z]{2})?/?(playlist|album|song)/([^/]+)/?([a-zA-Z0-9\.\-]+)?",
            input_clean,
        )
        if am_match:
            return {
                "platform": "apple_music",
                "storefront": am_match.group(1) or "us",
                "entity_type": am_match.group(2),
                "slug": am_match.group(3),
                "entity_id": am_match.group(4) or am_match.group(3),
                "url": input_clean,
            }

        # 3. YouTube Playlist URL
        if ("youtube.com" in input_clean or "youtu.be" in input_clean) and (
            "list=" in input_clean or "/playlist" in input_clean
        ):
            list_match = re.search(r"list=([a-zA-Z0-9_-]+)", input_clean)
            return {
                "platform": "youtube",
                "entity_type": "playlist",
                "entity_id": list_match.group(1) if list_match else "",
                "url": input_clean,
            }

        # 4. Raw text tracklist
        lines = [line.strip() for line in input_clean.split("\n") if line.strip()]
        if len(lines) > 0:
            return {
                "platform": "text",
                "entity_type": "tracklist",
                "entity_id": "",
                "url": "",
                "lines_count": len(lines),
            }

        return {"platform": "unknown", "entity_type": "", "entity_id": "", "url": input_clean}

    @classmethod
    def get_preview(cls, input_str: str, source: Optional[str] = None) -> Dict[str, Any]:
        """Extract metadata and tracks preview from the given input."""
        detected = cls.detect_source(input_str)
        platform = source or detected.get("platform", "unknown")

        if platform == "spotify":
            return cls._extract_spotify(detected)
        elif platform == "apple_music":
            return cls._extract_apple_music(detected)
        elif platform == "youtube":
            return cls._extract_youtube(input_str)
        elif platform == "text":
            return cls._extract_text(input_str)
        else:
            if "\n" in input_str or " - " in input_str:
                return cls._extract_text(input_str)
            raise ValueError("Unsupported or unrecognizable playlist/music URL")

    @classmethod
    def _extract_spotify(cls, detected: Dict[str, Any]) -> Dict[str, Any]:
        """Extract Spotify playlist or album via SSR Embed NextData."""
        entity_type = detected.get("entity_type", "playlist")
        entity_id = detected.get("entity_id")
        if not entity_id:
            raise ValueError("Invalid Spotify URL or ID")

        embed_url = f"https://open.spotify.com/embed/{entity_type}/{entity_id}"
        resp = requests.get(embed_url, headers=HEADERS, timeout=12)
        if resp.status_code != 200:
            raise ValueError(f"Spotify embed returned HTTP {resp.status_code}")
        resp.encoding = "utf-8"

        soup = BeautifulSoup(resp.text, "html.parser")
        script = soup.find("script", id="__NEXT_DATA__")
        if not script or not script.string:
            raise ValueError("Failed to parse Spotify embed page data")

        data = json.loads(script.string)
        entity = (
            data.get("props", {})
            .get("pageProps", {})
            .get("state", {})
            .get("data", {})
            .get("entity", {})
        )

        title = entity.get("title") or entity.get("name") or "Spotify Playlist"
        subtitle = entity.get("subtitle") or "Spotify"

        # Cover image
        cover_url = None
        if entity.get("coverArt") and entity["coverArt"].get("sources"):
            cover_url = entity["coverArt"]["sources"][0].get("url")
        elif entity.get("visualIdentity") and entity["visualIdentity"].get("image"):
            cover_url = entity["visualIdentity"]["image"][-1].get("url")

        tracks: List[Dict[str, Any]] = []

        if entity_type == "track":
            artists = entity.get("artists", [])
            artist_name = ", ".join([a.get("name", "") for a in artists if a.get("name")]) or subtitle
            tracks.append({
                "title": title,
                "artist": artist_name,
                "duration": round(entity.get("duration", 0) / 1000),
                "cover_url": cover_url,
                "spotify_uri": entity.get("uri"),
            })
        else:
            raw_tracks = entity.get("trackList", [])
            for item in raw_tracks:
                t_title = item.get("title") or item.get("name") or "Unknown Track"
                t_artist = item.get("subtitle")
                if not t_artist and item.get("artists"):
                    t_artist = ", ".join([a.get("name", "") for a in item["artists"] if a.get("name")])
                t_artist = t_artist or subtitle or "Unknown Artist"

                duration_ms = item.get("duration", 0)
                tracks.append({
                    "title": t_title,
                    "artist": t_artist,
                    "duration": round(duration_ms / 1000) if duration_ms else 0,
                    "cover_url": cover_url,
                    "spotify_uri": item.get("uri"),
                })

        return {
            "status": "success",
            "platform": "spotify",
            "entity_type": entity_type,
            "title": title,
            "creator": subtitle,
            "description": f"Imported from Spotify ({entity_type})",
            "cover_url": cover_url,
            "total_tracks": len(tracks),
            "tracks": tracks,
        }

    @classmethod
    def _extract_apple_music(cls, detected: Dict[str, Any]) -> Dict[str, Any]:
        """Extract Apple Music playlist or album via serialized-server-data or JSON-LD."""
        url = detected.get("url")
        if not url:
            raise ValueError("Missing Apple Music URL")

        resp = requests.get(url, headers=HEADERS, timeout=12)
        if resp.status_code != 200:
            raise ValueError(f"Apple Music page returned HTTP {resp.status_code}")
        resp.encoding = "utf-8"

        soup = BeautifulSoup(resp.text, "html.parser")
        title = ""
        cover_url = None
        tracks: List[Dict[str, Any]] = []

        # 1. Try serialized-server-data (most accurate)
        s = soup.find("script", id="serialized-server-data")
        if s and s.string:
            try:
                server_data = json.loads(s.string)
                data_list = server_data.get("data", [])
                if data_list and isinstance(data_list, list):
                    subdata = data_list[0].get("data", {})
                    sections = subdata.get("sections", [])
                    for sec in sections:
                        items = sec.get("items", [])
                        if "header" in sec.get("id", "").lower() and items:
                            header_item = items[0]
                            title = header_item.get("title") or title
                            art = header_item.get("artwork", {}).get("dictionary", {})
                            if art and art.get("url"):
                                cover_url = (
                                    art["url"]
                                    .replace("{w}", "600")
                                    .replace("{h}", "600")
                                    .replace("{f}", "jpg")
                                )

                        if "track-list" in sec.get("id", "").lower():
                            for item in items:
                                song_title = item.get("title")
                                if not song_title:
                                    continue
                                artist_name = item.get("artistName") or "Unknown Artist"
                                dur_ms = item.get("duration", 0)
                                tracks.append({
                                    "title": song_title,
                                    "artist": artist_name,
                                    "duration": round(dur_ms / 1000) if dur_ms else 0,
                                    "cover_url": cover_url,
                                })
            except Exception as e:
                logger.warning(f"Error parsing Apple Music serialized-server-data: {e}")

        # 2. Fallback to JSON-LD if tracks empty
        if not tracks:
            for script_tag in soup.find_all("script", type="application/ld+json"):
                try:
                    ld = json.loads(script_tag.string)
                    if ld.get("@type") in ("MusicPlaylist", "MusicAlbum"):
                        title = title or ld.get("name", "Apple Music Playlist")
                        for t in ld.get("track", []):
                            tracks.append({
                                "title": t.get("name", "Unknown"),
                                "artist": t.get("byArtist", {}).get("name", "Unknown Artist")
                                if isinstance(t.get("byArtist"), dict)
                                else "Unknown Artist",
                                "duration": 0,
                                "cover_url": cover_url,
                            })
                except Exception:
                    pass

        if not title:
            page_title = soup.title.string if soup.title else "Apple Music"
            title = page_title.split(" - ")[0].replace("\u200e", "").strip()

        return {
            "status": "success",
            "platform": "apple_music",
            "entity_type": detected.get("entity_type", "playlist"),
            "title": title or "Apple Music Playlist",
            "creator": "Apple Music",
            "description": "Imported from Apple Music",
            "cover_url": cover_url,
            "total_tracks": len(tracks),
            "tracks": tracks,
        }

    @classmethod
    def _extract_youtube(cls, url: str) -> Dict[str, Any]:
        """Extract YouTube playlist metadata using YouTubeService."""
        data = YouTubeService.get_playlist_info(url)
        if not data:
            raise ValueError("Failed to fetch YouTube playlist info")

        tracks: List[Dict[str, Any]] = []
        for entry in data.get("entries", []):
            if not entry:
                continue
            tracks.append({
                "title": entry.get("title", "Unknown"),
                "artist": entry.get("uploader", "Unknown Artist"),
                "duration": entry.get("duration", 0),
                "cover_url": entry.get("thumbnail"),
                "youtube_id": entry.get("id"),
                "youtube_url": f"https://www.youtube.com/watch?v={entry.get('id', '')}",
            })

        return {
            "status": "success",
            "platform": "youtube",
            "entity_type": "playlist",
            "title": data.get("title", "YouTube Playlist"),
            "creator": data.get("uploader", "YouTube"),
            "description": f"Imported from YouTube: {data.get('title', '')}",
            "cover_url": data.get("thumbnail"),
            "total_tracks": len(tracks),
            "tracks": tracks,
        }

    @classmethod
    def _extract_text(cls, text: str) -> Dict[str, Any]:
        """Extract tracklist from raw text (one song per line)."""
        lines = [line.strip() for line in text.strip().split("\n") if line.strip()]
        tracks: List[Dict[str, Any]] = []

        for line in lines:
            cleaned = re.sub(r"^\d+[\.\-\)]\s*", "", line).strip()
            if not cleaned:
                continue

            if " - " in cleaned:
                parts = cleaned.split(" - ", 1)
                artist, s_title = parts[0].strip(), parts[1].strip()
            elif "," in cleaned:
                parts = cleaned.split(",", 1)
                artist, s_title = parts[0].strip(), parts[1].strip()
            elif " by " in cleaned.lower():
                parts = re.split(r"\s+by\s+", cleaned, flags=re.IGNORECASE)
                s_title, artist = parts[0].strip(), parts[1].strip()
            else:
                artist = "Various Artists"
                s_title = cleaned

            tracks.append({
                "title": s_title,
                "artist": artist,
                "duration": 0,
                "cover_url": None,
            })

        return {
            "status": "success",
            "platform": "text",
            "entity_type": "tracklist",
            "title": "My Imported Playlist",
            "creator": "Homeify User",
            "description": f"Imported from text list ({len(tracks)} tracks)",
            "cover_url": None,
            "total_tracks": len(tracks),
            "tracks": tracks,
        }

    @classmethod
    def resolve_audio_stream(cls, artist: str, title: str) -> Optional[Dict[str, Any]]:
        """Resolve YouTube audio stream for a track by searching YouTube."""
        query = f"{artist} {title}".strip()
        try:
            results = YouTubeService.search(query, max_results=1)
            if results and len(results) > 0:
                first = results[0]
                return {
                    "youtube_id": first.get("youtube_id"),
                    "youtube_url": first.get("youtube_url"),
                    "duration": first.get("duration", 0),
                    "cover_url": first.get("thumbnail"),
                }
        except Exception as e:
            logger.warning(f"Failed to resolve audio stream for '{query}': {e}")
        return None

    @classmethod
    def resolve_tracks_batch(cls, tracks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Resolve a list of tracks concurrently using ThreadPoolExecutor."""
        def _resolve_one(t: Dict[str, Any]) -> Dict[str, Any]:
            if t.get("youtube_id"):
                return t
            audio = cls.resolve_audio_stream(t.get("artist", ""), t.get("title", ""))
            if audio:
                t["youtube_id"] = audio.get("youtube_id")
                t["youtube_url"] = audio.get("youtube_url")
                if not t.get("duration") and audio.get("duration"):
                    t["duration"] = audio.get("duration")
                if not t.get("cover_url") and audio.get("cover_url"):
                    t["cover_url"] = audio.get("cover_url")
            return t

        return list(RESOLVE_EXECUTOR.map(_resolve_one, tracks))


async def resolve_playlist_songs_background(playlist_id: str):
    """Background task to asynchronously resolve audio streams for remaining playlist songs."""
    try:
        from database import SessionLocal
        db = SessionLocal()
        try:
            pl_songs = (
                db.query(PlaylistSong)
                .filter(PlaylistSong.playlist_id == playlist_id)
                .order_by(PlaylistSong.position.asc())
                .all()
            )
            for ps in pl_songs:
                song = ps.song
                if song and (not song.youtube_id or not song.youtube_url):
                    audio = await asyncio.to_thread(
                        PlaylistImporterService.resolve_audio_stream,
                        song.artist,
                        song.title,
                    )
                    if audio and audio.get("youtube_id"):
                        song.youtube_id = audio["youtube_id"]
                        song.youtube_url = audio.get("youtube_url")
                        if not song.duration and audio.get("duration"):
                            song.duration = audio["duration"]
                        if not song.cover_art_url and audio.get("cover_url"):
                            song.cover_art_url = audio["cover_url"]
                        db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Error in background playlist songs resolver for {playlist_id}: {e}")
