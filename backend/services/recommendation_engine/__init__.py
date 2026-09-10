"""
Homeify Mega-Hits Recommendation Engine.
Multi-Source popularity-centric recommendation framework combining YouTube, Spotify, and In-App metrics.
"""
from .engine import RecommendationEngine
from .models import ScoredTrack, PopularityBreakdown
from .scoring_pipeline import ScoringPipeline
from .config import (
    QualityTier,
    WEIGHT_SPOTIFY,
    WEIGHT_YOUTUBE,
    WEIGHT_IN_APP,
    WEIGHT_USER_AFFINITY,
    MIN_YOUTUBE_VIEWS_DEFAULT,
    MIN_SPOTIFY_POPULARITY,
    MIN_COMPOSITE_SCORE_THRESHOLD,
)

__all__ = [
    "RecommendationEngine",
    "ScoredTrack",
    "PopularityBreakdown",
    "ScoringPipeline",
    "QualityTier",
    "WEIGHT_SPOTIFY",
    "WEIGHT_YOUTUBE",
    "WEIGHT_IN_APP",
    "WEIGHT_USER_AFFINITY",
    "MIN_YOUTUBE_VIEWS_DEFAULT",
    "MIN_SPOTIFY_POPULARITY",
    "MIN_COMPOSITE_SCORE_THRESHOLD",
]
