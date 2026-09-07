"""Music router - streaming, downloading, and managing audio files."""
import uuid
import os
import time
import re
import logging
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db, Song
from services.youtube import YouTubeService
from services.metadata import MetadataService
from config import MUSIC_DIR, COVERS_DIR

logger = logging.getLogger("soniclink.music")
router = APIRouter(prefix="/api/music", tags=["music"])

# In-memory stream URL cache to avoid repeated yt-dlp queries for Range chunks
# Format: {cache_key: (stream_url, expire_timestamp)}
_stream_url_cache: dict[str, tuple[str, float]] = {}

def _extract_youtube_id(url: str) -> str | None:
    m = re.search(r'(?:v=|\/|youtu\.be\/)([0-9A-Za-z_-]{11})', url)
    return m.group(1) if m else None

def _get_direct_audio_url(yt_url: str) -> str:
    now = time.time()
    if yt_url in _stream_url_cache:
        cached_url, expire_at = _stream_url_cache[yt_url]
        if now < expire_at:
            return cached_url

    import yt_dlp
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(yt_url, download=False)
        if not info:
            raise HTTPException(status_code=404, detail="Could not extract audio URL")

        audio_url = info.get("url")
        if not audio_url:
            formats = info.get("formats", [])
            audio_formats = [f for f in formats if f.get("acodec") != "none" and f.get("vcodec") == "none"]
            if audio_formats:
                best = sorted(audio_formats, key=lambda f: f.get("abr", 0) or 0, reverse=True)[0]
                audio_url = best.get("url")
            elif formats:
                audio_url = formats[-1].get("url")

        if not audio_url:
            raise HTTPException(status_code=404, detail="No audio stream URL available")

        # Cache for 2 hours
        _stream_url_cache[yt_url] = (audio_url, now + 7200)
        return audio_url


class DownloadRequest(BaseModel):
    youtube_url: str
    title: str | None = None
    artist: str | None = None


class SongUpdateRequest(BaseModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None


@router.post("/download")
async def download_song(
    req: DownloadRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Download a song from YouTube and save it to the library.
    
    Downloads the audio, extracts metadata, and stores it in the database.
    """
    # Check if already downloaded by YouTube URL
    existing = db.query(Song).filter(Song.youtube_url == req.youtube_url).first()
    if existing and existing.file_path and os.path.exists(existing.file_path):
        return {"status": "already_exists", "song": existing.to_dict()}

    song_id = str(uuid.uuid4())

    # Download the audio
    result = YouTubeService.download(req.youtube_url, song_id)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to download song")

    # Create song record
    song = Song(
        id=song_id,
        title=req.title or result.get("title", "Unknown"),
        artist=req.artist or result.get("artist", "Unknown Artist"),
        album=result.get("album", ""),
        duration=result.get("duration", 0),
        youtube_url=req.youtube_url,
        youtube_id=result.get("youtube_id", ""),
        file_path=result.get("file_path"),
        cover_art_url=result.get("thumbnail", ""),
        cover_art_local=result.get("cover_art_local"),
        file_size=result.get("file_size", 0),
        bitrate=result.get("bitrate", 192),
        format=result.get("format", "mp3"),
    )

    db.add(song)
    db.commit()
    db.refresh(song)

    # Try to enrich with MusicBrainz metadata in background
    background_tasks.add_task(_enrich_song_metadata, song_id, song.title, song.artist)

    return {"status": "downloaded", "song": song.to_dict()}


@router.api_route("/stream/{song_id}", methods=["GET", "HEAD"])
async def stream_song(song_id: str, db: Session = Depends(get_db)):
    """Stream a song file.
    
    Returns the audio file for streaming playback.
    Supports range requests for seeking and HEAD requests for browser probing.
    """
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    file_path = song.file_path
    if not file_path or not os.path.exists(file_path):
        candidate = MUSIC_DIR / f"{song.id}.{song.format or 'mp3'}"
        if candidate.exists():
            file_path = str(candidate)
        else:
            candidate_mp3 = MUSIC_DIR / f"{song.id}.mp3"
            if candidate_mp3.exists():
                file_path = str(candidate_mp3)

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    media_type = "audio/mpeg" if (song.format or "mp3").lower() == "mp3" else f"audio/{song.format}"

    return FileResponse(
        file_path,
        media_type=media_type,
        content_disposition_type="inline",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000",
        },
    )


@router.get("/stream-url")
async def stream_from_youtube(
    url: str = Query(..., description="YouTube URL to stream"),
):
    """Get a direct audio stream URL from YouTube without downloading.
    
    Useful for immediate playback before the user decides to download.
    """
    try:
        ydl_opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "no_warnings": True,
        }
        import yt_dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                raise HTTPException(status_code=404, detail="Could not extract audio URL")

            # Get the direct audio URL
            audio_url = info.get("url")
            if not audio_url:
                # Try to get from formats
                formats = info.get("formats", [])
                audio_formats = [f for f in formats if f.get("acodec") != "none" and f.get("vcodec") == "none"]
                if audio_formats:
                    # Pick highest quality audio-only
                    best = sorted(audio_formats, key=lambda f: f.get("abr", 0) or 0, reverse=True)[0]
                    audio_url = best.get("url")
                elif formats:
                    audio_url = formats[-1].get("url")

            if not audio_url:
                raise HTTPException(status_code=404, detail="No audio stream found")

            return {
                "stream_url": audio_url,
                "title": info.get("title", ""),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail", ""),
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.api_route("/stream-yt", methods=["GET", "HEAD"])
async def stream_youtube(
    request: Request,
    url: str = Query(..., description="YouTube video URL"),
    db: Session = Depends(get_db),
):
    """Stream audio from YouTube with Range request support for mobile/Safari.
    
    If the song is already downloaded in library, streams directly from local storage.
    Otherwise, proxies the audio stream directly through the server, bypassing client CORS
    and IP-restriction blocks.
    """
    # 1. Check if already downloaded in local library
    yt_id = _extract_youtube_id(url)
    existing = None
    if yt_id:
        existing = db.query(Song).filter(Song.youtube_id == yt_id).first()
    if not existing:
        existing = db.query(Song).filter(Song.youtube_url == url).first()

    if existing and existing.file_path and os.path.exists(existing.file_path):
        media_type = "audio/mpeg" if (existing.format or "mp3").lower() == "mp3" else f"audio/{existing.format}"
        return FileResponse(
            existing.file_path,
            media_type=media_type,
            content_disposition_type="inline",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=31536000",
            },
        )

    # 2. Extract direct audio stream URL
    try:
        direct_url = _get_direct_audio_url(url)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to extract YouTube stream: {e}")
        raise HTTPException(status_code=500, detail=f"YouTube extraction error: {str(e)}")

    # 3. Handle HEAD request
    client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }
    range_hdr = request.headers.get("range")
    if range_hdr:
        req_headers["Range"] = range_hdr

    if request.method == "HEAD":
        try:
            head_resp = await client.head(direct_url, headers=req_headers)
            resp_headers = {
                "Accept-Ranges": "bytes",
                "Content-Type": head_resp.headers.get("content-type", "audio/mp4"),
                "Content-Length": head_resp.headers.get("content-length", "0"),
            }
            if "content-range" in head_resp.headers:
                resp_headers["Content-Range"] = head_resp.headers["content-range"]
            await client.aclose()
            return Response(status_code=head_resp.status_code, headers=resp_headers)
        except Exception as e:
            await client.aclose()
            raise HTTPException(status_code=500, detail=str(e))

    # 4. Handle GET request (Streaming with Range support)
    try:
        req = client.build_request("GET", direct_url, headers=req_headers)
        resp = await client.send(req, stream=True)

        resp_headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": resp.headers.get("content-type", "audio/mp4"),
            "Cache-Control": "no-cache",
        }
        if "content-length" in resp.headers:
            resp_headers["Content-Length"] = resp.headers["content-length"]
        if "content-range" in resp.headers:
            resp_headers["Content-Range"] = resp.headers["content-range"]

        async def stream_body():
            try:
                async for chunk in resp.aiter_bytes(chunk_size=65536):
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()

        return StreamingResponse(
            stream_body(),
            status_code=resp.status_code,
            headers=resp_headers,
            media_type=resp_headers["Content-Type"],
        )
    except Exception as e:
        await client.aclose()
        logger.error(f"Error proxying stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-file/{song_id}")
async def download_file(song_id: str, db: Session = Depends(get_db)):
    """Download a song file to the client device.
    
    Returns the audio file with Content-Disposition: attachment header.
    """
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    if not song.file_path or not os.path.exists(song.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    filename = f"{song.artist} - {song.title}.{song.format or 'mp3'}"
    # Sanitize filename
    filename = "".join(c for c in filename if c not in '<>:"/\\|?*')

    return FileResponse(
        song.file_path,
        media_type="application/octet-stream",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/cover/{song_id}")
async def get_cover_art(song_id: str, db: Session = Depends(get_db)):
    """Get cover art for a song."""
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Try local cover first
    if song.cover_art_local and os.path.exists(song.cover_art_local):
        return FileResponse(song.cover_art_local, media_type="image/jpeg")

    # Redirect to remote URL
    if song.cover_art_url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=song.cover_art_url)

    raise HTTPException(status_code=404, detail="No cover art available")


@router.put("/{song_id}")
async def update_song(song_id: str, req: SongUpdateRequest, db: Session = Depends(get_db)):
    """Update song metadata."""
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    if req.title is not None:
        song.title = req.title
    if req.artist is not None:
        song.artist = req.artist
    if req.album is not None:
        song.album = req.album

    db.commit()
    db.refresh(song)
    return {"status": "updated", "song": song.to_dict()}


@router.delete("/{song_id}")
async def delete_song(song_id: str, db: Session = Depends(get_db)):
    """Delete a song from the library and remove the file."""
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Delete file
    if song.file_path and os.path.exists(song.file_path):
        os.remove(song.file_path)

    # Delete cover
    if song.cover_art_local and os.path.exists(song.cover_art_local):
        os.remove(song.cover_art_local)

    db.delete(song)
    db.commit()
    return {"status": "deleted", "song_id": song_id}


async def _enrich_song_metadata(song_id: str, title: str, artist: str):
    """Background task to enrich song metadata from MusicBrainz."""
    try:
        from database import SessionLocal
        enriched = await MetadataService.enrich_song_metadata(title, artist)
        if not enriched:
            return

        db = SessionLocal()
        try:
            song = db.query(Song).filter(Song.id == song_id).first()
            if song:
                if enriched.get("album") and not song.album:
                    song.album = enriched["album"]
                if enriched.get("cover_art_url") and not song.cover_art_url:
                    song.cover_art_url = enriched["cover_art_url"]
                if enriched.get("musicbrainz_id"):
                    song.musicbrainz_id = enriched["musicbrainz_id"]
                db.commit()
        finally:
            db.close()
    except Exception:
        pass  # Non-critical background enrichment
