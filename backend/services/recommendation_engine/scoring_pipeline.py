"""Composite scoring pipeline, anti-obscurity filtering, and diversity enforcement."""
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from .config import (
    WEIGHT_SPOTIFY,
    WEIGHT_YOUTUBE,
    WEIGHT_IN_APP,
    WEIGHT_USER_AFFINITY,
    MIN_COMPOSITE_SCORE_THRESHOLD,
    MAX_SONGS_PER_ARTIST_IN_FEED,
    QualityTier,
)
from .models import ScoredTrack, PopularityBreakdown
from .youtube_popularity import YouTubePopularityScorer
from .spotify_popularity import SpotifyPopularityService
from .in_app_popularity import InAppPopularityService
from .collaborative_filter import CollaborativeFilterService

logger = logging.getLogger("homeify.recommendation_engine.pipeline")


class ScoringPipeline:
    """Orchestrates multi-source popularity scoring, quality tiering, and filtering."""

    @classmethod
    async def score_track(
        cls,
        candidate: Dict[str, Any],
        db: Session,
        user_id: Optional[str] = None,
        category: str = "all",
        language: str = "all",
        default_reason: str = "Verified Hit"
    ) -> Optional[ScoredTrack]:
        """
        Evaluate and score a single candidate song across all dimensions.
        Returns ScoredTrack or None if the song was rejected by quality filters.
        """
        raw_title = candidate.get("title", "")
        raw_artist = candidate.get("artist", "")
        youtube_id = candidate.get("youtube_id", "")
        views = candidate.get("view_count") or 0
        uploader = candidate.get("uploader", "")
        duration = candidate.get("duration") or 0

        # 1. YouTube Popularity & Anti-Noise evaluation
        yt_base, yt_boost, yt_penalty, yt_rejected = YouTubePopularityScorer.evaluate_video(
            title=raw_title,
            uploader=uploader,
            views=views,
            duration=duration,
        )

        if yt_rejected:
            logger.debug(f"Track rejected by YouTube filter: {raw_title}")
            return None

        # 2. Spotify Popularity evaluation
        sp_score, sp_track_pop, sp_artist_pop = await SpotifyPopularityService.get_popularity(
            title=raw_title,
            artist=raw_artist
        )

        # 3. In-App Popularity evaluation
        song_id = candidate.get("id")
        in_app_score, in_app_plays, unique_listeners, completion_rate, fav_count = (
            InAppPopularityService.get_track_metrics(db=db, youtube_id=youtube_id, song_id=song_id)
        )

        # 4. User Taste Affinity
        user_affinity = CollaborativeFilterService.get_user_affinity(
            db=db,
            user_id=user_id,
            candidate_artist=raw_artist
        )

        # 5. Calculate Weighted Composite Score
        composite = (
            (sp_score * WEIGHT_SPOTIFY) +
            (yt_base * WEIGHT_YOUTUBE) +
            (in_app_score * WEIGHT_IN_APP) +
            (user_affinity * WEIGHT_USER_AFFINITY) +
            yt_boost - yt_penalty
        )

        # Cap between 0 and 100
        final_score = float(max(0.0, min(100.0, composite)))

        # 6. Anti-Obscurity Shield: Discard tracks failing minimum popularity standard
        if final_score < MIN_COMPOSITE_SCORE_THRESHOLD:
            logger.debug(f"Track below composite threshold ({final_score:.1f} < {MIN_COMPOSITE_SCORE_THRESHOLD}): {raw_title}")
            return None

        # 7. Determine Quality Tier & Visual Badge
        if final_score >= 84.0 or views >= 30_000_000 or sp_track_pop >= 80:
            tier = QualityTier.MEGA_HIT
            badge = "👑 מגה להיט"
        elif final_score >= 68.0 or views >= 5_000_000 or sp_track_pop >= 65:
            tier = QualityTier.MAINSTREAM_HIT
            badge = "🔥 להיט ענק"
        elif in_app_plays >= 5 or fav_count >= 2:
            tier = QualityTier.TRENDING
            badge = "⚡ פופולרי בקהילה"
        else:
            tier = QualityTier.STANDARD
            badge = "✨ מומלץ עבורך"

        breakdown = PopularityBreakdown(
            youtube_score=yt_base,
            youtube_views=views,
            spotify_score=sp_score,
            spotify_track_popularity=sp_track_pop,
            spotify_artist_popularity=sp_artist_pop,
            in_app_score=in_app_score,
            in_app_play_count=in_app_plays,
            in_app_unique_listeners=unique_listeners,
            in_app_completion_rate=completion_rate,
            in_app_favorites=fav_count,
            user_affinity_score=user_affinity,
            quality_boost=yt_boost,
            noise_penalty=yt_penalty,
            composite_score=final_score,
        )

        return ScoredTrack(
            id=song_id,
            title=raw_title,
            artist=raw_artist or "Various Artists",
            youtube_id=youtube_id,
            youtube_url=candidate.get("youtube_url", f"https://www.youtube.com/watch?v={youtube_id}"),
            duration=duration,
            cover_art_url=candidate.get("cover_art_url") or candidate.get("thumbnail"),
            thumbnail=candidate.get("thumbnail") or candidate.get("cover_art_url"),
            category=category,
            language=language,
            reason=candidate.get("reason") or default_reason,
            badge=badge,
            quality_tier=tier,
            is_downloaded=candidate.get("is_downloaded", False),
            uploader=uploader,
            breakdown=breakdown,
        )

    @classmethod
    def rank_and_diversify(cls, scored_tracks: List[ScoredTrack], limit: int) -> List[ScoredTrack]:
        """
        Ranks tracks by composite score while enforcing artist diversity limits.
        """
        # Sort by composite score descending
        sorted_tracks = sorted(
            scored_tracks,
            key=lambda t: t.breakdown.composite_score,
            reverse=True
        )

        diversified: List[ScoredTrack] = []
        artist_counts: Dict[str, int] = {}

        # First pass: pick best tracks respecting max songs per artist
        remaining: List[ScoredTrack] = []
        for track in sorted_tracks:
            artist_key = track.artist.lower().strip()
            current_count = artist_counts.get(artist_key, 0)
            if current_count < MAX_SONGS_PER_ARTIST_IN_FEED:
                diversified.append(track)
                artist_counts[artist_key] = current_count + 1
            else:
                remaining.append(track)

            if len(diversified) >= limit:
                break

        # Second pass: if needed to fill the requested limit, backfill from remaining
        if len(diversified) < limit and remaining:
            diversified.extend(remaining[: (limit - len(diversified))])

        return diversified[:limit]
