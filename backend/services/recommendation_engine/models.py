"""Data models and representations for the Recommendation Engine."""
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, Any, List


@dataclass
class PopularityBreakdown:
    """Detailed score components for a track across all popularity dimensions."""
    youtube_score: float = 0.0          # 0 - 100
    youtube_views: int = 0
    spotify_score: float = 0.0          # 0 - 100
    spotify_track_popularity: int = 0   # 0 - 100
    spotify_artist_popularity: int = 0  # 0 - 100
    in_app_score: float = 0.0           # 0 - 100
    in_app_play_count: int = 0
    in_app_unique_listeners: int = 0
    in_app_completion_rate: float = 0.0 # 0.0 - 1.0
    in_app_favorites: int = 0
    user_affinity_score: float = 0.0    # 0 - 100
    quality_boost: float = 0.0
    noise_penalty: float = 0.0
    composite_score: float = 0.0        # Final 0 - 100 score


@dataclass
class ScoredTrack:
    """Represents a candidate song enriched and ranked by the recommendation engine."""
    title: str
    artist: str
    youtube_id: str
    youtube_url: str = ""
    duration: int = 0
    cover_art_url: Optional[str] = None
    thumbnail: Optional[str] = None
    category: str = "all"
    language: str = "all"
    reason: str = "Certified Popular Hit"
    badge: str = "🔥 להיט מוכח"
    quality_tier: str = "MAINSTREAM"
    is_downloaded: bool = False
    id: Optional[str] = None
    uploader: str = ""
    breakdown: PopularityBreakdown = field(default_factory=PopularityBreakdown)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary for API response."""
        data = {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "duration": self.duration,
            "cover_art_url": self.cover_art_url or self.thumbnail,
            "thumbnail": self.thumbnail or self.cover_art_url,
            "youtube_id": self.youtube_id,
            "youtube_url": self.youtube_url or f"https://www.youtube.com/watch?v={self.youtube_id}",
            "is_downloaded": self.is_downloaded,
            "category": self.category,
            "language": self.language,
            "reason": self.reason,
            "badge": self.badge,
            "quality_tier": self.quality_tier,
            "score": round(self.breakdown.composite_score, 1),
            "popularity_metrics": {
                "composite": round(self.breakdown.composite_score, 1),
                "youtube_views": self.breakdown.youtube_views,
                "youtube_score": round(self.breakdown.youtube_score, 1),
                "spotify_popularity": self.breakdown.spotify_track_popularity,
                "spotify_score": round(self.breakdown.spotify_score, 1),
                "in_app_plays": self.breakdown.in_app_play_count,
                "in_app_score": round(self.breakdown.in_app_score, 1),
            }
        }
        return data
