"""API Integration Tests for SonicLink Backend."""
import unittest
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app
from database import init_db


class TestSonicLinkAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_01_health_check(self):
        """Test health check endpoint."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("service"), "SonicLink")

    def test_02_equalizer_presets(self):
        """Test equalizer presets endpoint."""
        response = self.client.get("/api/equalizer/presets")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("presets", data)
        self.assertGreater(len(data["presets"]), 0)
        preset_names = [p["name"] for p in data["presets"]]
        self.assertIn("Flat", preset_names)
        self.assertIn("Bass Boost", preset_names)

    def test_03_playlist_lifecycle(self):
        """Test creating, reading, updating, and deleting playlists."""
        # 1. Create Playlist
        create_resp = self.client.post(
            "/api/playlists",
            json={"name": "Test Hits", "description": "My test playlist"}
        )
        self.assertEqual(create_resp.status_code, 200)
        data = create_resp.json()
        playlist = data.get("playlist", data)
        playlist_id = playlist["id"]
        self.assertEqual(playlist["name"], "Test Hits")

        # 2. Get All Playlists
        list_resp = self.client.get("/api/playlists")
        self.assertEqual(list_resp.status_code, 200)
        playlists = list_resp.json().get("playlists", [])
        self.assertTrue(any(p["id"] == playlist_id for p in playlists))

        # 3. Get Single Playlist
        single_resp = self.client.get(f"/api/playlists/{playlist_id}")
        self.assertEqual(single_resp.status_code, 200)
        self.assertEqual(single_resp.json()["name"], "Test Hits")

        # 4. Update Playlist
        update_resp = self.client.put(
            f"/api/playlists/{playlist_id}",
            json={"name": "Renamed Hits", "description": "Updated description"}
        )
        self.assertEqual(update_resp.status_code, 200)
        updated_pl = update_resp.json().get("playlist", update_resp.json())
        self.assertEqual(updated_pl["name"], "Renamed Hits")

        # 5. Delete Playlist
        del_resp = self.client.delete(f"/api/playlists/{playlist_id}")
        self.assertEqual(del_resp.status_code, 200)

        # 6. Verify Deleted
        verify_resp = self.client.get(f"/api/playlists/{playlist_id}")
        self.assertEqual(verify_resp.status_code, 404)

    def test_04_library_endpoints(self):
        """Test library and stats endpoints."""
        lib_resp = self.client.get("/api/library")
        self.assertEqual(lib_resp.status_code, 200)
        data = lib_resp.json()
        self.assertIn("songs", data)
        self.assertIn("total", data)

        stats_resp = self.client.get("/api/library/stats")
        self.assertEqual(stats_resp.status_code, 200)
        stats = stats_resp.json()
        self.assertIn("total_songs", stats)
        self.assertIn("total_size_bytes", stats)

    def test_05_history_endpoints(self):
        """Test history endpoints."""
        hist_resp = self.client.get("/api/history")
        self.assertEqual(hist_resp.status_code, 200)
        data = hist_resp.json()
        self.assertIn("history", data)

        top_resp = self.client.get("/api/history/top")
        self.assertEqual(top_resp.status_code, 200)
        self.assertIn("songs", top_resp.json())

    def test_06_lyrics_endpoint(self):
        """Test lyrics direct endpoint."""
        resp = self.client.get("/api/lyrics/direct/get?title=Yellow&artist=Coldplay")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("has_synced") or bool(data.get("plain_lyrics")))

    def test_07_youtube_search(self):
        """Test YouTube search endpoint."""
        resp = self.client.get("/api/search?q=coldplay+yellow&limit=2")
        self.assertEqual(resp.status_code, 200)
        results = resp.json().get("results", [])
        self.assertGreater(len(results), 0)
        self.assertIn("title", results[0])
        self.assertIn("youtube_url", results[0])


if __name__ == "__main__":
    unittest.main()
