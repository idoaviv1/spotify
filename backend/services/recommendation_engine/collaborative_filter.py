"""Collaborative filtering and user taste profiling."""
import logging
from typing import Set, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import Song, ListeningHistory, User

logger = logging.getLogger("homeify.recommendation_engine.collaborative")

# Genre and vibe clusters for affinity scoring
GENRE_CLUSTERS = {
    "israeli_pop": {
        "עומר אדם", "אושר כהן", "עדן חסון", "פאר טסי", "אייל גולן", "איתי לוי",
        "אודיה", "עדן בן זקן", "ששון איפרם שאולוב", "נועה קירל", "סטטיק", "אנה זק"
    },
    "israeli_rock": {
        "שלמה ארצי", "עידן רייכל", "אביתר בנאי", "חנן בן ארי", "ישי ריבו",
        "אמיר דדון", "ברי סחרוף", "עברי לידר", "היהודים", "משינה", "תיסלם"
    },
    "western_pop": {
        "taylor swift", "dua lipa", "ariana grande", "billie eilish", "sabrina carpenter",
        "olivia rodrigo", "bruno mars", "lady gaga", "rihanna", "beyoncé", "katy perry"
    },
    "hip_hop": {
        "drake", "travis scott", "kendrick lamar", "post malone", "kanye west",
        "eminem", "future", "21 savage", "metro boomin"
    },
    "latin_reggaeton": {
        "bad bunny", "karol g", "rosalía", "rauw alejandro", "j balvin", "maluma",
        "shakira", "daddy yankee", "feid", "peso pluma", "bizarrap"
    },
    "electronic": {
        "avicii", "david guetta", "calvin harris", "martin garrix", "tiësto",
        "swedish house mafia", "kygo", "marshmello"
    }
}


class CollaborativeFilterService:
    """Computes user taste affinity vectors and cross-user song recommendations."""

    @classmethod
    def get_user_affinity(cls, db: Session, user_id: Optional[str], candidate_artist: str) -> float:
        """
        Calculates affinity (0 - 100) between the user's history and candidate artist.
        """
        if not user_id:
            return 50.0  # Neutral affinity for anonymous users

        candidate_clean = (candidate_artist or "").lower().strip()
        if not candidate_clean or candidate_clean == "unknown artist":
            return 40.0

        # Query user's top played artists in DB
        user_top_artists = (
            db.query(Song.artist, func.count(ListeningHistory.id).label("count"))
            .join(Song, Song.id == ListeningHistory.song_id)
            .filter(ListeningHistory.user_id == user_id)
            .group_by(Song.artist)
            .order_by(desc("count"))
            .limit(10)
            .all()
        )

        if not user_top_artists:
            return 50.0

        top_names = {a.artist.lower().strip() for a in user_top_artists if a.artist}

        # 1. Direct artist match (User loves this artist)
        if candidate_clean in top_names:
            return 95.0

        # 2. Cluster affinity: Does user listen to other artists in the same cluster?
        for cluster_name, artists in GENRE_CLUSTERS.items():
            cluster_lower = {a.lower() for a in artists}
            if candidate_clean in cluster_lower:
                # Count overlap with user's top artists
                overlap = len(top_names.intersection(cluster_lower))
                if overlap >= 2:
                    return 85.0
                elif overlap == 1:
                    return 72.0

        return 50.0

    @classmethod
    def find_collaborative_recommendations(cls, db: Session, user_id: Optional[str], limit: int = 6) -> List[Dict]:
        """
        Finds tracks listened to by other users with similar listening habits.
        """
        if not user_id:
            return []

        # Find songs current user listened to
        user_songs = {
            row[0] for row in db.query(ListeningHistory.song_id)
            .filter(ListeningHistory.user_id == user_id)
            .distinct().all()
        }

        if not user_songs:
            return []

        # Find other users who listened to at least one of the same songs
        peer_users = (
            db.query(ListeningHistory.user_id, func.count(ListeningHistory.id).label("common_plays"))
            .filter(ListeningHistory.song_id.in_(user_songs), ListeningHistory.user_id != user_id)
            .group_by(ListeningHistory.user_id)
            .order_by(desc("common_plays"))
            .limit(5)
            .all()
        )

        if not peer_users:
            return []

        peer_ids = [p.user_id for p in peer_users if p.user_id]

        # Recommend top songs from peers that the user hasn't heard yet
        peer_recommendations = (
            db.query(Song, func.count(ListeningHistory.id).label("play_count"))
            .join(ListeningHistory, ListeningHistory.song_id == Song.id)
            .filter(ListeningHistory.user_id.in_(peer_ids), ~Song.id.in_(user_songs))
            .group_by(Song.id)
            .order_by(desc("play_count"))
            .limit(limit)
            .all()
        )

        results = []
        for song, count in peer_recommendations:
            results.append({
                "id": song.id,
                "title": song.title,
                "artist": song.artist,
                "duration": song.duration,
                "cover_art_url": song.cover_art_url,
                "youtube_id": song.youtube_id,
                "is_downloaded": bool(song.file_path),
                "reason": "Popular among listeners with taste like yours",
                "badge": "👥 אהוב על משתמשים דומים",
            })

        return results
