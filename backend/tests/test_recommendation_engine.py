"""Automated test suite for the Homeify Mega-Hits Recommendation Engine."""
import pytest
import asyncio
from services.recommendation_engine.youtube_popularity import YouTubePopularityScorer
from services.recommendation_engine.spotify_popularity import SpotifyPopularityService
from services.recommendation_engine.scoring_pipeline import ScoringPipeline
from services.recommendation_engine.config import (
    MIN_YOUTUBE_VIEWS_DEFAULT,
    MIN_COMPOSITE_SCORE_THRESHOLD,
    QualityTier,
)
from services.recommendation_engine.models import ScoredTrack, PopularityBreakdown


def test_youtube_views_scoring_scale():
    """Verify logarithmic distribution of YouTube view counts."""
    scorer = YouTubePopularityScorer()

    # Low views (< 50k) should yield very low scores
    score_low = scorer.calculate_views_score(10_000)
    assert score_low <= 15.0

    # 500k views (entry hit)
    score_entry = scorer.calculate_views_score(500_000)
    assert 30.0 <= score_entry <= 45.0

    # 10M views (major hit)
    score_major = scorer.calculate_views_score(10_000_000)
    assert 68.0 <= score_major <= 78.0

    # 100M+ views (mega hit)
    score_mega = scorer.calculate_views_score(120_000_000)
    assert score_mega >= 98.0


def test_youtube_noise_and_amateur_filtering():
    """Verify karaoke, covers, and noise are strictly rejected by the Anti-Noise filter."""
    scorer = YouTubePopularityScorer()

    # Cover song
    _, _, penalty, rejected = scorer.evaluate_video(
        title="Omer Adam - Tel Aviv (Acoustic Cover by Dan)",
        uploader="Dan Music",
        views=1_000_000
    )
    assert rejected is True
    assert penalty > 0

    # Karaoke
    _, _, penalty, rejected = scorer.evaluate_video(
        title="Dua Lipa - Levitating (Karaoke Version with Lyrics)",
        uploader="Sing King Karaoke",
        views=2_500_000
    )
    assert rejected is True

    # Authentic official video with high views
    base_score, boost, penalty, rejected = scorer.evaluate_video(
        title="עומר אדם - מלכת הדור (Official Video)",
        uploader="עומר אדם - הערוץ הרשמי",
        views=36_000_000,
        duration=210
    )
    assert rejected is False
    assert penalty == 0.0
    assert boost > 0.0
    assert base_score >= 80.0


def test_spotify_popularity_enrichment():
    """Verify Spotify popularity queries and chart index mappings."""
    async def _run():
        # Test recognized Israeli chart topper
        score, t_pop, a_pop = await SpotifyPopularityService.get_popularity(
            title="מלכת הדור",
            artist="עומר אדם"
        )
        assert score >= 75.0
        assert a_pop >= 80

        # Test global chart topper
        score_global, _, a_pop_global = await SpotifyPopularityService.get_popularity(
            title="Cruel Summer",
            artist="Taylor Swift"
        )
        assert score_global >= 85.0
        assert a_pop_global >= 90

    asyncio.run(_run())


def test_diversity_ranking():
    """Verify artist diversity constraints in final feed."""
    tracks = []
    # Create 5 songs by Omer Adam
    for i in range(5):
        t = ScoredTrack(
            title=f"Song {i}",
            artist="עומר אדם",
            youtube_id=f"omer_{i}",
            breakdown=PopularityBreakdown(composite_score=95.0 - i)
        )
        tracks.append(t)

    # Create 3 songs by Dua Lipa
    for i in range(3):
        t = ScoredTrack(
            title=f"Dua {i}",
            artist="Dua Lipa",
            youtube_id=f"dua_{i}",
            breakdown=PopularityBreakdown(composite_score=90.0 - i)
        )
        tracks.append(t)

    # Create 2 songs by Bad Bunny
    for i in range(2):
        t = ScoredTrack(
            title=f"Bunny {i}",
            artist="Bad Bunny",
            youtube_id=f"bunny_{i}",
            breakdown=PopularityBreakdown(composite_score=88.0 - i)
        )
        tracks.append(t)

    diversified = ScoringPipeline.rank_and_diversify(tracks, limit=6)
    assert len(diversified) == 6

    # Verify no more than 2 songs from Omer Adam
    omer_count = sum(1 for t in diversified if t.artist == "עומר אדם")
    assert omer_count <= 2

    # Verify order is descending by score
    scores = [t.breakdown.composite_score for t in diversified]
    assert scores == sorted(scores, reverse=True)


def test_anti_obscurity_shield_and_pipeline():
    """Verify obscure amateur songs are blocked and major hits pass with high tiers."""
    from database import SessionLocal

    async def _run():
        db = SessionLocal()
        try:
            # 1. Obscure song with 15k views and unknown artist -> MUST be blocked by Anti-Obscurity Shield
            obscure_candidate = {
                "title": "Random Garage Jam Session",
                "artist": "Anonymous Band 123",
                "youtube_id": "obscure_123",
                "view_count": 15_000,
                "uploader": "Random Guy",
                "duration": 180,
            }
            obscure_scored = await ScoringPipeline.score_track(
                candidate=obscure_candidate,
                db=db,
                user_id=None
            )
            assert obscure_scored is None, "Obscure track should be blocked by Anti-Obscurity Shield"

            # 2. Major certified hit (Omer Adam - 36M views) -> MUST pass with MAINSTREAM or MEGA_HIT tier
            hit_candidate = {
                "title": "עומר אדם - מלכת הדור (Official Video)",
                "artist": "עומר אדם",
                "youtube_id": "omer_queen",
                "view_count": 36_000_000,
                "uploader": "עומר אדם - הערוץ הרשמי",
                "duration": 215,
            }
            hit_scored = await ScoringPipeline.score_track(
                candidate=hit_candidate,
                db=db,
                user_id=None
            )
            assert hit_scored is not None
            assert hit_scored.breakdown.composite_score >= 75.0
            assert hit_scored.quality_tier in (QualityTier.MEGA_HIT, QualityTier.MAINSTREAM_HIT)
            assert "להיט" in hit_scored.badge
        finally:
            db.close()

    asyncio.run(_run())
