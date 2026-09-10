"""YouTube popularity analysis, view count normalization, and official release verification."""
import math
import re
import logging
from typing import Dict, Any, Tuple

from .config import (
    NOISE_KEYWORDS,
    OFFICIAL_RELEASE_KEYWORDS,
    MIN_YOUTUBE_VIEWS_DEFAULT,
    MIN_YOUTUBE_VIEWS_HIT_TIER,
    MIN_YOUTUBE_VIEWS_MEGA_HIT,
)

logger = logging.getLogger("homeify.recommendation_engine.youtube")


class YouTubePopularityScorer:
    """Calculates popularity scores and authenticity metrics from YouTube video metadata."""

    @staticmethod
    def calculate_views_score(views: int) -> float:
        """
        Normalize raw view count to a 0 - 100 scale using a log10 distribution.
        
        Examples:
        - 50,000 views: ~8
        - 500,000 views: ~40
        - 2,000,000 views: ~55
        - 10,000,000 views: ~75
        - 50,000,000 views: ~92
        - 100,000,000+ views: 100
        """
        if views <= 0:
            return 15.0  # Unknown views fallback

        log_v = math.log10(max(views, 1))
        # Range: 4.5 (approx 31k views) to 8.0 (100M views)
        normalized = (log_v - 4.5) / 3.5 * 100.0
        return float(min(100.0, max(5.0, normalized)))

    @classmethod
    def evaluate_video(
        cls,
        title: str,
        uploader: str,
        views: int,
        duration: int = 0
    ) -> Tuple[float, float, float, bool]:
        """
        Evaluate a candidate video.
        
        Returns:
            Tuple of (base_score, quality_boost, noise_penalty, is_rejected)
        """
        title_lower = title.lower()
        uploader_lower = (uploader or "").lower()
        combined_text = f"{title_lower} {uploader_lower}"

        # 1. Anti-Noise Check (karaoke, cover, nightcore, etc.)
        for keyword in NOISE_KEYWORDS:
            # Word boundary check for short words like cover or קאבר
            pattern = rf"\b{re.escape(keyword)}\b"
            if re.search(pattern, combined_text):
                logger.debug(f"Rejecting video due to noise keyword '{keyword}': {title}")
                return 0.0, 0.0, 60.0, True

        # Duration bounds check: discard ultra-short soundbites or multi-hour DJ loops
        dur_val = duration or 0
        if dur_val > 0 and (dur_val < 65 or dur_val > 480):
            return 10.0, 0.0, 40.0, True

        # 2. View Count Score
        base_score = cls.calculate_views_score(views)

        # Discard tracks that fail minimum views requirement if views are known
        if 0 < views < MIN_YOUTUBE_VIEWS_DEFAULT:
            logger.debug(f"Penalizing low-view track ({views} views): {title}")
            return base_score * 0.4, 0.0, 30.0, True

        # 3. Official Release / Master Artist Verification Boost
        quality_boost = 0.0
        is_official = False

        for kw in OFFICIAL_RELEASE_KEYWORDS:
            if kw in combined_text:
                is_official = True
                break

        if is_official:
            quality_boost += 8.0

        if views >= MIN_YOUTUBE_VIEWS_MEGA_HIT:
            quality_boost += 10.0
        elif views >= MIN_YOUTUBE_VIEWS_HIT_TIER:
            quality_boost += 5.0

        return base_score, quality_boost, 0.0, False
