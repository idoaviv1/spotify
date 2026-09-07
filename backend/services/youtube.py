"""YouTube search and download service using yt-dlp."""
import os
import re
import uuid
import logging
from pathlib import Path
from typing import Optional

import yt_dlp

from config import MUSIC_DIR, COVERS_DIR, DEFAULT_AUDIO_FORMAT, DEFAULT_AUDIO_QUALITY

logger = logging.getLogger(__name__)


class YouTubeService:
    """Wrapper around yt-dlp for searching and downloading music from YouTube."""

    @staticmethod
    def search(query: str, max_results: int = 20) -> list[dict]:
        """Search YouTube for music videos.
        
        Args:
            query: Search query string
            max_results: Maximum number of results to return
            
        Returns:
            List of search result dicts with video metadata
        """
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": True,
            "default_search": f"ytsearch{max_results}",
        }

        try:
            search_query = query if query.startswith("http") or query.startswith("ytsearch") else f"ytsearch{max_results}:{query}"
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                result = ydl.extract_info(search_query, download=False)
                if not result or "entries" not in result:
                    return []

                results = []
                for entry in result.get("entries", []):
                    if entry is None:
                        continue
                    results.append({
                        "youtube_id": entry.get("id", ""),
                        "title": entry.get("title", "Unknown"),
                        "artist": _extract_artist(entry.get("title", ""), entry.get("uploader", "")),
                        "duration": entry.get("duration", 0),
                        "thumbnail": _get_best_thumbnail(entry),
                        "youtube_url": f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                        "uploader": entry.get("uploader", ""),
                        "view_count": entry.get("view_count", 0),
                    })
                return results
        except Exception as e:
            logger.error(f"YouTube search error: {e}")
            return []

    @staticmethod
    def get_info(youtube_url: str) -> Optional[dict]:
        """Get detailed info about a YouTube video without downloading.
        
        Args:
            youtube_url: YouTube video URL
            
        Returns:
            Dict with video metadata or None
        """
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(youtube_url, download=False)
                if not info:
                    return None

                return {
                    "youtube_id": info.get("id", ""),
                    "title": info.get("title", "Unknown"),
                    "artist": _extract_artist(info.get("title", ""), info.get("uploader", "")),
                    "album": info.get("album", ""),
                    "duration": info.get("duration", 0),
                    "thumbnail": _get_best_thumbnail(info),
                    "youtube_url": youtube_url,
                    "uploader": info.get("uploader", ""),
                }
        except Exception as e:
            logger.error(f"YouTube info error: {e}")
            return None

    @staticmethod
    def download(youtube_url: str, song_id: Optional[str] = None) -> Optional[dict]:
        """Download audio from a YouTube video.
        
        Args:
            youtube_url: YouTube video URL
            song_id: Optional song ID for the filename
            
        Returns:
            Dict with download info including file path
        """
        if not song_id:
            song_id = str(uuid.uuid4())

        output_path = str(MUSIC_DIR / f"{song_id}.%(ext)s")

        ydl_opts = {
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": DEFAULT_AUDIO_FORMAT,
                "preferredquality": DEFAULT_AUDIO_QUALITY,
            }],
            "outtmpl": output_path,
            "quiet": True,
            "no_warnings": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(youtube_url, download=True)
                if not info:
                    return None

                # Find the actual downloaded file
                final_path = MUSIC_DIR / f"{song_id}.{DEFAULT_AUDIO_FORMAT}"
                if not final_path.exists():
                    # Try to find any file with this song_id
                    for f in MUSIC_DIR.glob(f"{song_id}.*"):
                        final_path = f
                        break

                if not final_path.exists():
                    logger.error(f"Downloaded file not found for {song_id}")
                    return None

                file_size = final_path.stat().st_size

                # Download thumbnail
                cover_path = _download_thumbnail(info, song_id)

                return {
                    "song_id": song_id,
                    "file_path": str(final_path),
                    "file_size": file_size,
                    "format": DEFAULT_AUDIO_FORMAT,
                    "bitrate": int(DEFAULT_AUDIO_QUALITY),
                    "title": info.get("title", "Unknown"),
                    "artist": _extract_artist(info.get("title", ""), info.get("uploader", "")),
                    "album": info.get("album", ""),
                    "duration": info.get("duration", 0),
                    "youtube_id": info.get("id", ""),
                    "youtube_url": youtube_url,
                    "thumbnail": _get_best_thumbnail(info),
                    "cover_art_local": cover_path,
                }
        except Exception as e:
            logger.error(f"YouTube download error: {e}")
            return None


def _download_thumbnail(info: dict, song_id: str) -> Optional[str]:
    """Download the video thumbnail as cover art."""
    thumbnail_url = _get_best_thumbnail(info)
    if not thumbnail_url:
        return None

    try:
        import httpx
        cover_path = COVERS_DIR / f"{song_id}.jpg"
        with httpx.Client(follow_redirects=True) as client:
            resp = client.get(thumbnail_url, timeout=10)
            if resp.status_code == 200:
                cover_path.write_bytes(resp.content)
                return str(cover_path)
    except Exception as e:
        logger.warning(f"Failed to download thumbnail: {e}")

    return None


def _get_best_thumbnail(info: dict) -> str:
    """Get the best quality thumbnail URL from video info."""
    thumbnails = info.get("thumbnails", [])
    if thumbnails:
        # Sort by resolution (prefer larger)
        sorted_thumbs = sorted(
            [t for t in thumbnails if t.get("url")],
            key=lambda t: (t.get("height", 0) or 0) * (t.get("width", 0) or 0),
            reverse=True,
        )
        if sorted_thumbs:
            return sorted_thumbs[0]["url"]

    # Fallback to standard YouTube thumbnail
    vid_id = info.get("id", "")
    if vid_id:
        return f"https://img.youtube.com/vi/{vid_id}/maxresdefault.jpg"
    return ""


def _extract_artist(title: str, uploader: str) -> str:
    """Try to extract the artist name from the video title.
    
    Common patterns:
    - "Artist - Song Title"
    - "Artist | Song Title"  
    - "Song Title by Artist"
    """
    # Pattern: "Artist - Song Title"
    match = re.match(r"^(.+?)\s*[-–—]\s*(.+)$", title)
    if match:
        return match.group(1).strip()

    # Pattern: "Song by Artist"
    match = re.search(r"\bby\s+(.+)$", title, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # Fallback: use uploader name, cleaned up
    if uploader:
        # Remove common suffixes like "- Topic", "VEVO", "Official"
        clean = re.sub(r"\s*[-–]\s*(Topic|VEVO|Official).*$", "", uploader, flags=re.IGNORECASE)
        return clean.strip()

    return "Unknown Artist"
