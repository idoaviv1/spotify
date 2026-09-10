"""In-App popularity analytics, cross-user listening patterns, and skip-vs-completion signals."""
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_

from database import Song, ListeningHistory, Playlist, PlaylistSong

logger = logging.getLogger("homeify.recommendation_engine.in_app")


class InAppPopularityService:
    """Calculates internal platform popularity scores based on aggregated telemetry."""

    @staticmethod
    def get_track_metrics(db: Session, youtube_id: str, song_id: Optional[str] = None) -> Tuple[float, int, int, float, int]:
        """
        Analyze in-app listening telemetry for a song.
        
        Returns:
            Tuple of (in_app_score, play_count, unique_listeners, completion_rate, favorite_count)
        """
        now = datetime.now(timezone.utc)
        fourteen_days_ago = now - timedelta(days=14)

        # Resolve matching song row in local DB
        song = None
        if song_id:
            song = db.query(Song).filter(Song.id == song_id).first()
        elif youtube_id:
            song = db.query(Song).filter(Song.youtube_id == youtube_id).first()

        if not song:
            # Not yet in local DB - neutral baseline score
            return 50.0, 0, 0, 1.0, 0

        # 1. Total Play Count & Recent Velocity
        history_rows = (
            db.query(ListeningHistory.played_at, ListeningHistory.duration_listened, ListeningHistory.user_id)
            .filter(ListeningHistory.song_id == song.id)
            .all()
        )

        play_count = len(history_rows)
        if play_count == 0:
            return 52.0, 0, 0, 1.0, 0

        # Unique listeners
        unique_users = {h.user_id for h in history_rows if h.user_id}
        unique_listeners = max(1, len(unique_users))

        # Completion Rate & Skip Penalty
        song_dur = song.duration or 180
        completions = 0
        skips = 0
        weighted_plays = 0.0

        for h in history_rows:
            listened = h.duration_listened or 0
            if listened >= song_dur * 0.7:
                completions += 1
            elif listened < 25 and song_dur > 60:
                skips += 1

            # Recency multiplier
            if h.played_at:
                played_dt = h.played_at.replace(tzinfo=timezone.utc) if h.played_at.tzinfo is None else h.played_at
                if played_dt >= fourteen_days_ago:
                    weighted_plays += 2.0
                else:
                    weighted_plays += 1.0
            else:
                weighted_plays += 1.0

        completion_rate = completions / play_count if play_count > 0 else 1.0
        skip_rate = skips / play_count if play_count > 0 else 0.0

        # 2. Favorites & Playlist inclusions
        fav_count = (
            db.query(func.count(PlaylistSong.song_id))
            .join(Playlist, Playlist.id == PlaylistSong.playlist_id)
            .filter(PlaylistSong.song_id == song.id, Playlist.is_favorites == True)
            .scalar() or 0
        )

        playlist_count = (
            db.query(func.count(PlaylistSong.song_id))
            .filter(PlaylistSong.song_id == song.id)
            .scalar() or 0
        )

        # 3. Calculate Normalized 0 - 100 In-App Score
        # Components:
        # - Velocity base (up to 45 pts)
        velocity_score = min(45.0, weighted_plays * 3.5)
        # - Listener breadth (up to 20 pts)
        breadth_score = min(20.0, unique_listeners * 5.0)
        # - Engagement / Favorites (up to 20 pts)
        engagement_score = min(20.0, (fav_count * 8.0) + (playlist_count * 3.0))
        # - Completion bonus vs skip penalty (up to 15 pts)
        retention_score = (completion_rate * 15.0) - (skip_rate * 10.0)

        in_app_score = float(max(15.0, min(100.0, 30.0 + velocity_score + breadth_score + engagement_score + retention_score)))

        return in_app_score, play_count, unique_listeners, completion_rate, fav_count
