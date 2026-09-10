"""Unit tests for Spotify and Apple Music Playlist Importer Service."""
import pytest
from services.importer import PlaylistImporterService


def test_detect_source():
    # Spotify playlist
    res = PlaylistImporterService.detect_source("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123")
    assert res["platform"] == "spotify"
    assert res["entity_type"] == "playlist"
    assert res["entity_id"] == "37i9dQZF1DXcBWIGoYBM5M"

    # Spotify album
    res_album = PlaylistImporterService.detect_source("https://open.spotify.com/album/4m2880jivSbbyEGAKfITCa")
    assert res_album["platform"] == "spotify"
    assert res_album["entity_type"] == "album"
    assert res_album["entity_id"] == "4m2880jivSbbyEGAKfITCa"

    # Apple Music playlist
    res_am = PlaylistImporterService.detect_source("https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb")
    assert res_am["platform"] == "apple_music"
    assert res_am["entity_type"] == "playlist"
    assert "pl.f4d106fed2bd41149aaacabb233eb5eb" in res_am["entity_id"]

    # Apple Music album
    res_am_alb = PlaylistImporterService.detect_source("https://music.apple.com/us/album/thriller/269572838")
    assert res_am_alb["platform"] == "apple_music"
    assert res_am_alb["entity_type"] == "album"

    # Raw text list
    res_txt = PlaylistImporterService.detect_source("Artist 1 - Song 1\nArtist 2 - Song 2")
    assert res_txt["platform"] == "text"


def test_extract_text():
    text_data = """
    1. The Weeknd - Blinding Lights
    2. Daft Punk - Get Lucky
    3. Queen - Bohemian Rhapsody
    """
    res = PlaylistImporterService.get_preview(text_data)
    assert res["status"] == "success"
    assert res["platform"] == "text"
    assert res["total_tracks"] == 3
    assert res["tracks"][0]["artist"] == "The Weeknd"
    assert res["tracks"][0]["title"] == "Blinding Lights"
    assert res["tracks"][1]["artist"] == "Daft Punk"
    assert res["tracks"][1]["title"] == "Get Lucky"


def test_spotify_preview_live():
    url = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
    res = PlaylistImporterService.get_preview(url)
    assert res["status"] == "success"
    assert res["platform"] == "spotify"
    assert res["total_tracks"] > 0
    assert len(res["tracks"]) > 0
    assert res["tracks"][0]["title"]
    assert res["tracks"][0]["artist"]
    assert res["cover_url"] is not None


def test_apple_music_preview_live():
    url = "https://music.apple.com/us/album/thriller/269572838"
    res = PlaylistImporterService.get_preview(url)
    assert res["status"] == "success"
    assert res["platform"] == "apple_music"
    assert res["title"] == "Thriller"
    assert res["total_tracks"] == 9
    assert res["tracks"][0]["artist"] == "Michael Jackson"
    assert res["cover_url"] is not None
