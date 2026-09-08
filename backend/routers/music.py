"""Music router - streaming, downloading, and managing audio files."""
import asyncio
import uuid
import os
import time
import re
import logging
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request, Response, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db, Song, User
from auth import get_current_user, get_current_admin
from services.youtube import YouTubeService
from services.metadata import MetadataService
from config import MUSIC_DIR, COVERS_DIR, WINDOWS_MUSIC_DIR

logger = logging.getLogger("homeify.music")
router = APIRouter(prefix="/api/music", tags=["music"])

# Strict YouTube URL validation to prevent SSRF and arbitrary schema injection
YOUTUBE_URL_REGEX = re.compile(
    r"^https?://(www\.)?(youtube\.com/(watch\?v=|shorts/|playlist\?list=)|youtu\.be/)[A-Za-z0-9_\-]+(\S*)?$",
    re.IGNORECASE,
)

def _validate_youtube_url(url: str) -> str:
    url_clean = (url or "").strip()
    if not YOUTUBE_URL_REGEX.match(url_clean):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL format. Must be a valid youtube.com or youtu.be link.",
        )
    return url_clean

# Max upload limit: 100 MB per audio track to prevent disk exhaustion
MAX_UPLOAD_SIZE = 100 * 1024 * 1024

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

    # Evict expired entries if cache is large
    if len(_stream_url_cache) > 200:
        expired = [k for k, (_, exp) in _stream_url_cache.items() if now >= exp]
        for k in expired:
            _stream_url_cache.pop(k, None)
        if len(_stream_url_cache) > 200:
            for k in list(_stream_url_cache.keys())[:50]:
                _stream_url_cache.pop(k, None)

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a song from YouTube and save it to the library. Requires auth."""
    # Strict validation of YouTube URL
    _validate_youtube_url(req.youtube_url)

    # Check if already downloaded by YouTube URL
    existing = db.query(Song).filter(Song.youtube_url == req.youtube_url).first()
    if existing and existing.file_path and os.path.exists(existing.file_path):
        return {"status": "already_exists", "song": existing.to_dict()}

    song_id = str(uuid.uuid4())

    # Download the audio
    result = await asyncio.to_thread(YouTubeService.download, req.youtube_url, song_id)
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
async def stream_song(
    song_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream a song file with authentication and path validation."""
    if not re.match(r"^[a-zA-Z0-9_\-]+$", song_id):
        raise HTTPException(status_code=400, detail="Invalid song ID format")

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

    # Enforce path traversal safety
    real_file = Path(file_path).resolve()
    allowed_dirs = [MUSIC_DIR.resolve()]
    if WINDOWS_MUSIC_DIR.exists():
        allowed_dirs.append(WINDOWS_MUSIC_DIR.resolve())
    if not any(real_file.is_relative_to(d) for d in allowed_dirs):
        raise HTTPException(status_code=403, detail="Forbidden file path")

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
    current_user: User = Depends(get_current_user),
):
    """Get a direct audio stream URL from YouTube without downloading. Requires auth."""
    _validate_youtube_url(url)
    try:
        ydl_opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "no_warnings": True,
        }
        import yt_dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = await asyncio.to_thread(ydl.extract_info, url, download=False)
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream audio from YouTube with Range request support for mobile/Safari. Requires auth."""
    _validate_youtube_url(url)

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
        direct_url = await asyncio.to_thread(_get_direct_audio_url, url)
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
async def download_file(
    song_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a song file to the client device. Requires auth and path validation."""
    if not re.match(r"^[a-zA-Z0-9_\-]+$", song_id):
        raise HTTPException(status_code=400, detail="Invalid song ID format")

    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    if not song.file_path or not os.path.exists(song.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    real_file = Path(song.file_path).resolve()
    allowed_dirs = [MUSIC_DIR.resolve()]
    if WINDOWS_MUSIC_DIR.exists():
        allowed_dirs.append(WINDOWS_MUSIC_DIR.resolve())
    if not any(real_file.is_relative_to(d) for d in allowed_dirs):
        raise HTTPException(status_code=403, detail="Forbidden file path")

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
    if not re.match(r"^[a-zA-Z0-9_\-]+$", song_id):
        raise HTTPException(status_code=400, detail="Invalid song ID format")

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
async def update_song(
    song_id: str,
    req: SongUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update song metadata. Restricted to administrators."""
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    if req.title is not None:
        song.title = req.title.strip()
    if req.artist is not None:
        song.artist = req.artist.strip()
    if req.album is not None:
        song.album = req.album.strip()

    db.commit()
    db.refresh(song)
    return {"status": "updated", "song": song.to_dict()}


@router.delete("/{song_id}")
async def delete_song(
    song_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a song from the library and remove the file. Restricted to administrators."""
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Delete file
    if song.file_path and os.path.exists(song.file_path):
        try:
            os.remove(song.file_path)
        except OSError as e:
            logger.warning(f"Could not remove audio file {song.file_path}: {e}")

    # Delete cover
    if song.cover_art_local and os.path.exists(song.cover_art_local):
        try:
            os.remove(song.cover_art_local)
        except OSError as e:
            logger.warning(f"Could not remove cover file {song.cover_art_local}: {e}")

    db.delete(song)
    db.commit()
    return {"status": "deleted", "song_id": song_id}


@router.post("/upload")
async def upload_audio_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a local audio file (MP3, FLAC, M4A, WAV, OGG) with size limit and ID3 extraction."""
    ext = os.path.splitext(file.filename or "")[1].lower().lstrip(".")
    if ext not in ["mp3", "flac", "m4a", "wav", "ogg", "aac"]:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 100 MB)")

    song_id = str(uuid.uuid4())
    file_path = MUSIC_DIR / f"{song_id}.{ext}"

    with open(file_path, "wb") as f:
        f.write(content)

    file_size = len(content)

    # Extract metadata via mutagen
    title = os.path.splitext(file.filename or "Unknown")[0]
    artist = "Unknown Artist"
    album = ""
    duration = 0
    cover_local = None

    try:
        import mutagen
        audio = mutagen.File(str(file_path))
        if audio:
            if hasattr(audio.info, "length"):
                duration = int(audio.info.length)

            if hasattr(audio, "tags") and audio.tags:
                tags = audio.tags
                if "TIT2" in tags:
                    title = str(tags["TIT2"])
                elif "title" in tags:
                    title = str(tags["title"][0]) if isinstance(tags["title"], list) else str(tags["title"])

                if "TPE1" in tags:
                    artist = str(tags["TPE1"])
                elif "artist" in tags:
                    artist = str(tags["artist"][0]) if isinstance(tags["artist"], list) else str(tags["artist"])

                if "TALB" in tags:
                    album = str(tags["TALB"])
                elif "album" in tags:
                    album = str(tags["album"][0]) if isinstance(tags["album"], list) else str(tags["album"])

                # Extract embedded album art (APIC in ID3 or FLAC Picture)
                cover_bytes = None
                if hasattr(tags, "getall") and tags.getall("APIC"):
                    pics = tags.getall("APIC")
                    if pics and getattr(pics[0], "data", None):
                        cover_bytes = pics[0].data
                elif hasattr(audio, "pictures") and audio.pictures:
                    cover_bytes = audio.pictures[0].data

                if cover_bytes:
                    cov_path = COVERS_DIR / f"{song_id}.jpg"
                    cov_path.write_bytes(cover_bytes)
                    cover_local = str(cov_path)
    except Exception as e:
        logger.warning(f"Metadata extraction warning on uploaded file: {e}")

    cover_url = f"/api/music/cover/{song_id}" if cover_local else None

    song = Song(
        id=song_id,
        title=title,
        artist=artist,
        album=album,
        duration=duration,
        file_path=str(file_path),
        file_size=file_size,
        format=ext,
        cover_art_local=cover_local,
        cover_art_url=cover_url,
    )
    db.add(song)
    db.commit()
    db.refresh(song)

    return {"status": "uploaded", "song": song.to_dict()}


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
