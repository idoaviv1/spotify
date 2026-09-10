"""Configuration, weights, and parameters for the Homeify Mega-Hits Recommendation Engine."""
import os
from typing import Dict, List, Set

# ─── Popularity Scoring Weights (Sum = 1.0) ───
# Prioritizes massive global & local popularity while keeping in-app signals meaningful
WEIGHT_SPOTIFY: float = 0.35      # Global Spotify track & artist popularity score (0-100)
WEIGHT_YOUTUBE: float = 0.35      # Normalized YouTube view count (log scale) & official channel status
WEIGHT_IN_APP: float = 0.20       # Real plays, unique listeners, completion rate, and favorites in Homeify
WEIGHT_USER_AFFINITY: float = 0.10 # Match with the current user's favorite artists/genres

# ─── Minimum Popularity & Anti-Obscurity Thresholds ───
# User explicitly requested: "אני לא רוצה שירים שאף אחד לא מכיר. אני רוצה שירים פופולריים."
# Hard minimum YouTube views to be considered a verified hit unless in-app popularity is massive
MIN_YOUTUBE_VIEWS_DEFAULT: int = 500_000         # 500k views absolute minimum for general discovery
MIN_YOUTUBE_VIEWS_HIT_TIER: int = 5_000_000      # 5M+ views qualifies as a mainstream hit
MIN_YOUTUBE_VIEWS_MEGA_HIT: int = 30_000_000     # 30M+ views qualifies as a certified mega-hit

MIN_SPOTIFY_POPULARITY: int = 35                 # 0-100 scale; tracks below 35 are discarded
HIGH_SPOTIFY_POPULARITY: int = 65                # 65+ is guaranteed radio/chart hit

# Minimum composite score required for a song to pass the filter (0-100)
MIN_COMPOSITE_SCORE_THRESHOLD: float = 48.0

# ─── Anti-Noise & Anti-Amateur Keyword Shield ───
# Strict filter against karaoke, covers, sped up, nightcore, amateur remakes, comedy skits, and kids videos
NOISE_KEYWORDS: Set[str] = {
    "cover", "karaoke", "remake", "instrumental", "tribute",
    "reaction", "parody", "nightcore", "sped up", "slowed",
    "reverb", "8d audio", "bass boosted", "dance cover",
    "tutorial", "guitar lesson", "piano tutorial", "how to play",
    "podcast", "interview", "full episode", "standup", "comedy",
    "קאבר", "קריוקי", "גרסת כיסוי", "גרסה אקוסטית חובבנית",
    "חיקויים", "חיקוי", "מערכון", "מערכונים", "פרק מלא", "סטנדאפ",
    "הצגת ילדים", "שירי ילדים", "סרט מלא", "ראיון", "פודקאסט"
}

# Positive boost keywords indicating authentic master release
OFFICIAL_RELEASE_KEYWORDS: Set[str] = {
    "official video", "official audio", "official music video",
    "קליפ רשמי", "אודיו רשמי", "vevo", "lyric video", "visualizer",
    "- topic", "records", "music", "הפקה רשמית"
}

# ─── Quality Tier Definitions ───
class QualityTier:
    MEGA_HIT = "MEGA_HIT"         # 50M+ views, 75+ Spotify, ubiquitous radio banger
    MAINSTREAM_HIT = "MAINSTREAM" # 5M-50M views, 55-75 Spotify, verified popular track
    TRENDING = "TRENDING"         # Viral growth, high momentum in last 14 days
    STANDARD = "STANDARD"         # Good popular song meeting all quality thresholds
    REJECTED = "REJECTED"         # Below popularity bar or noise detected

# ─── Cache Settings ───
CACHE_TTL_POPULARITY_SCORES: int = 86400  # 24 hours for external popularity scores
CACHE_TTL_RECOMMENDATIONS: int = 1800     # 30 minutes for user recommendation feeds

# ─── Diversity Constraints ───
MAX_SONGS_PER_ARTIST_IN_FEED: int = 2     # Prevent flooding feed with 5 songs of same artist
