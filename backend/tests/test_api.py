"""API Integration Tests for Homeify Backend."""
import unittest
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import tempfile
import shutil

# Isolate tests to a completely separate temporary directory & database
TEST_DATA_DIR = tempfile.mkdtemp(prefix="homeify_test_")
os.environ["HOMEIFY_TESTING"] = "1"
os.environ["HOMEIFY_DATA"] = TEST_DATA_DIR

from fastapi.testclient import TestClient
from main import app
from database import init_db


class TestHomeifyAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)
        # Authenticate as seeded admin
        login_resp = cls.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        cls.admin_token = login_resp.json()["access_token"]
        cls.client.headers.update({"Authorization": f"Bearer {cls.admin_token}"})

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)

    def test_00_auth_and_security(self):
        """Test authentication and unauthorized access rejection."""
        # Unauthenticated client
        anon_client = TestClient(app)
        anon_resp = anon_client.get("/api/playlists")
        self.assertEqual(anon_resp.status_code, 401)

        # Invalid password
        bad_resp = anon_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrongpassword"},
        )
        self.assertEqual(bad_resp.status_code, 401)

        # Verify /api/auth/me for authenticated client
        me_resp = self.client.get("/api/auth/me")
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.json()["user"]["username"], "admin")
        self.assertEqual(me_resp.json()["user"]["role"], "admin")

    def test_01_health_check(self):
        """Test health check endpoint."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("service"), "Homeify")

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

    def test_08_recommendations_endpoint(self):
        """Test recommendations endpoint (with fix for max_results)."""
        resp = self.client.get("/api/recommendations?limit=5")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("recommendations", data)

    def test_09_api_404_not_masked(self):
        """Verify that non-existent API routes return 404 JSON, not SPA index.html."""
        resp = self.client.get("/api/this_endpoint_does_not_exist_404")
        self.assertEqual(resp.status_code, 404)
        data = resp.json()
        self.assertIn("detail", data)

    def test_10_system_backup_and_restore(self):
        """Test system JSON backup export and restore."""
        # 1. Export backup
        resp = self.client.get("/api/system/backup")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("version", data)
        self.assertIn("songs", data)
        self.assertIn("playlists", data)

        # 2. Restore backup with a new playlist
        import uuid
        dyn_song_id = f"test-song-{uuid.uuid4()}"
        dyn_pl_id = f"test-pl-{uuid.uuid4()}"
        restore_payload = {
            "songs": [
                {
                    "id": dyn_song_id,
                    "title": "Backup Song",
                    "artist": "Backup Artist",
                    "duration": 210,
                }
            ],
            "playlists": [
                {
                    "id": dyn_pl_id,
                    "name": "Restored Playlist",
                    "description": "Restored from backup",
                    "songs": [{"id": dyn_song_id}],
                }
            ],
        }
        restore_resp = self.client.post("/api/system/restore", json=restore_payload)
        self.assertEqual(restore_resp.status_code, 200)
        res_data = restore_resp.json()
        self.assertEqual(res_data.get("status"), "success")
        self.assertGreaterEqual(res_data.get("restored_playlists", 0), 1)
        # Clean up test restored playlist
        self.client.delete(f"/api/playlists/{dyn_pl_id}")

    def test_11_playlist_reorder(self):
        """Test reordering songs inside a playlist."""
        # Create playlist
        pl_resp = self.client.post("/api/playlists", json={"name": "Reorder Test"})
        self.assertEqual(pl_resp.status_code, 200)
        pl_id = pl_resp.json()["playlist"]["id"]

        # Reorder with song IDs
        reorder_resp = self.client.put(
            f"/api/playlists/{pl_id}/reorder",
            json={"song_ids": ["song-b", "song-a"]}
        )
        self.assertEqual(reorder_resp.status_code, 200)
        self.assertEqual(reorder_resp.json().get("status"), "reordered")
        # Clean up reorder test playlist
        self.client.delete(f"/api/playlists/{pl_id}")

    def test_12_audio_upload(self):
        """Test local audio upload endpoint."""
        fake_audio_bytes = b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"\xff\xfb\x90\x00" * 50
        files = {
            "file": ("summer_vibes.mp3", fake_audio_bytes, "audio/mpeg")
        }
        resp = self.client.post("/api/music/upload", files=files)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("status"), "uploaded")
        self.assertIn("song", data)
        self.assertEqual(data["song"]["title"], "summer_vibes")
        # Clean up uploaded song
        self.client.delete(f"/api/music/{data['song']['id']}")

    def test_13_favorites_lifecycle(self):
        """Test Liked Songs / Favorites dedicated endpoints and toggling."""
        # 1. Fetch favorites playlist
        resp = self.client.get("/api/favorites")
        self.assertEqual(resp.status_code, 200)
        fav_data = resp.json()
        self.assertTrue(fav_data.get("is_favorites") or fav_data.get("name") == "Liked Songs")
        self.assertIn("songs", fav_data)

        # 2. Toggle favorite on (add)
        song_id = "test-fav-song-123"
        toggle_resp = self.client.post(
            "/api/favorites/toggle",
            json={
                "song_id": song_id,
                "song_data": {
                    "title": "Favorite Melodies",
                    "artist": "Homeify Artist",
                    "duration": 210,
                },
            },
        )
        self.assertEqual(toggle_resp.status_code, 200)
        toggle_data = toggle_resp.json()
        self.assertTrue(toggle_data.get("is_liked"))
        self.assertEqual(toggle_data.get("status"), "added")

        # 3. Verify favorite_ids contains the song
        ids_resp = self.client.get("/api/favorites/ids")
        self.assertEqual(ids_resp.status_code, 200)
        fav_ids = ids_resp.json().get("favorite_ids", [])
        self.assertIn(song_id, fav_ids)

        # 4. Toggle favorite off (remove)
        untoggle_resp = self.client.post(
            "/api/favorites/toggle",
            json={"song_id": song_id},
        )
        self.assertEqual(untoggle_resp.status_code, 200)
        untoggle_data = untoggle_resp.json()
        self.assertFalse(untoggle_data.get("is_liked"))
        self.assertEqual(untoggle_data.get("status"), "removed")

        # 5. Verify favorite_ids no longer contains the song
        ids_resp2 = self.client.get("/api/favorites/ids")
        fav_ids2 = ids_resp2.json().get("favorite_ids", [])
        self.assertNotIn(song_id, fav_ids2)

    def test_14_related_recommendations(self):
        """Test the Song Radio / Related Tracks endpoint."""
        resp = self.client.get(
            "/api/recommendations/related",
            params={"artist": "עומר אדם", "title": "מלכת הדור", "limit": 3},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("related", data)
        self.assertIn("seed", data)
        self.assertEqual(data["seed"]["artist"], "עומר אדם")

    def test_15_explore_recommendations(self):
        """Test the Explore / Discover Hub endpoint with categories."""
        # 1. Test single category (Hebrew)
        resp_hebrew = self.client.get("/api/recommendations/explore", params={"category": "hebrew", "limit": 2})
        self.assertEqual(resp_hebrew.status_code, 200)
        hebrew_data = resp_hebrew.json()
        self.assertEqual(hebrew_data.get("category"), "hebrew")
        self.assertIn("songs", hebrew_data)

        # 2. Test single category (Spanish)
        resp_spanish = self.client.get("/api/recommendations/explore", params={"category": "spanish", "limit": 2})
        self.assertEqual(resp_spanish.status_code, 200)
        spanish_data = resp_spanish.json()
        self.assertEqual(spanish_data.get("category"), "spanish")
        self.assertIn("songs", spanish_data)

        # 3. Test "all" category which returns sections
        resp_all = self.client.get("/api/recommendations/explore", params={"category": "all", "limit": 2})
        self.assertEqual(resp_all.status_code, 200)
        all_data = resp_all.json()
        self.assertIn("sections", all_data)
        section_ids = [s["id"] for s in all_data["sections"]]
        self.assertIn("hebrew", section_ids)
        self.assertIn("english", section_ids)
        self.assertIn("spanish", section_ids)
        self.assertIn("fresh", section_ids)


    def test_16_admin_user_management_and_isolation(self):
        """Test admin creating users, role protection, and user playlist isolation."""
        # 1. Admin lists users
        users_resp = self.client.get("/api/admin/users")
        self.assertEqual(users_resp.status_code, 200)
        self.assertGreaterEqual(users_resp.json()["total_users"], 1)

        # 2. Admin creates a normal user 'alice'
        alice_create_resp = self.client.post(
            "/api/admin/users",
            json={
                "username": "alice_test",
                "password": "alicepassword",
                "display_name": "Alice In Wonderland",
                "role": "user",
            },
        )
        self.assertEqual(alice_create_resp.status_code, 200)
        alice_data = alice_create_resp.json()["user"]
        alice_id = alice_data["id"]

        # 3. Alice logs in
        anon_client = TestClient(app)
        alice_login_resp = anon_client.post(
            "/api/auth/login",
            json={"username": "alice_test", "password": "alicepassword"},
        )
        self.assertEqual(alice_login_resp.status_code, 200)
        alice_token = alice_login_resp.json()["access_token"]
        alice_client = TestClient(app)
        alice_client.headers.update({"Authorization": f"Bearer {alice_token}"})

        # 4. Alice tries to access admin panel -> 403 Forbidden!
        alice_admin_resp = alice_client.get("/api/admin/users")
        self.assertEqual(alice_admin_resp.status_code, 403)

        # 5. Alice creates a private playlist
        alice_pl_resp = alice_client.post(
            "/api/playlists",
            json={"name": "Alice Private Tracks", "description": "Alice's secret list"},
        )
        self.assertEqual(alice_pl_resp.status_code, 200)
        alice_pl_id = alice_pl_resp.json()["playlist"]["id"]

        # 6. Admin creates another user 'bob'
        bob_create_resp = self.client.post(
            "/api/admin/users",
            json={
                "username": "bob_test",
                "password": "bobpassword",
                "display_name": "Bob Builder",
                "role": "user",
            },
        )
        self.assertEqual(bob_create_resp.status_code, 200)
        bob_id = bob_create_resp.json()["user"]["id"]

        # 7. Bob logs in
        bob_login_resp = anon_client.post(
            "/api/auth/login",
            json={"username": "bob_test", "password": "bobpassword"},
        )
        self.assertEqual(bob_login_resp.status_code, 200)
        bob_token = bob_login_resp.json()["access_token"]
        bob_client = TestClient(app)
        bob_client.headers.update({"Authorization": f"Bearer {bob_token}"})

        # 8. User Isolation Check: Bob checks his playlists -> DOES NOT see Alice's playlist
        bob_playlists_resp = bob_client.get("/api/playlists")
        self.assertEqual(bob_playlists_resp.status_code, 200)
        bob_pl_ids = [p["id"] for p in bob_playlists_resp.json()["playlists"]]
        self.assertNotIn(alice_pl_id, bob_pl_ids)

        # 9. Bob tries to directly read Alice's playlist -> 403 Forbidden!
        bob_forbidden_resp = bob_client.get(f"/api/playlists/{alice_pl_id}")
        self.assertEqual(bob_forbidden_resp.status_code, 403)

        # 10. Admin CAN access Alice's playlist and manage it
        admin_alice_pl = self.client.get(f"/api/playlists/{alice_pl_id}")
        self.assertEqual(admin_alice_pl.status_code, 200)
        self.assertEqual(admin_alice_pl.json()["name"], "Alice Private Tracks")

        # 11. Admin resets Alice's password directly to 'newalicesecret'
        admin_update_resp = self.client.put(
            f"/api/admin/users/{alice_id}",
            json={"password": "newalicesecret", "display_name": "Alice Updated"},
        )
        self.assertEqual(admin_update_resp.status_code, 200)
        self.assertEqual(admin_update_resp.json()["user"]["display_name"], "Alice Updated")

        # 12. Alice logs in with new password -> 200 OK!
        alice_new_login = anon_client.post(
            "/api/auth/login",
            json={"username": "alice_test", "password": "newalicesecret"},
        )
        self.assertEqual(alice_new_login.status_code, 200)

        # 13. Admin cleans up test users
        del_alice = self.client.delete(f"/api/admin/users/{alice_id}")
        self.assertEqual(del_alice.status_code, 200)
        del_bob = self.client.delete(f"/api/admin/users/{bob_id}")
        self.assertEqual(del_bob.status_code, 200)

    def test_17_security_audit_verifications(self):
        """Comprehensive verification of RBAC, token protection, and vulnerability remediations."""
        anon_client = TestClient(app)

        # 1. Unauthenticated access to backup & restore is rejected (401)
        self.assertEqual(anon_client.get("/api/system/backup").status_code, 401)
        self.assertEqual(anon_client.post("/api/system/restore", json={"songs": []}).status_code, 401)

        # 2. Create a normal user 'charlie' to test RBAC restrictions
        import uuid
        dyn_username = f"charlie_{uuid.uuid4().hex[:6]}"
        charlie_resp = self.client.post(
            "/api/admin/users",
            json={"username": dyn_username, "password": "charliepass123", "role": "user"},
        )
        self.assertEqual(charlie_resp.status_code, 200)
        charlie_id = charlie_resp.json()["user"]["id"]

        charlie_login = anon_client.post(
            "/api/auth/login",
            json={"username": dyn_username, "password": "charliepass123"},
        )
        self.assertEqual(charlie_login.status_code, 200)
        charlie_token = charlie_login.json()["access_token"]
        charlie_client = TestClient(app)
        charlie_client.headers.update({"Authorization": f"Bearer {charlie_token}"})

        # 3. Regular user CANNOT access backup or restore (403 Forbidden)
        self.assertEqual(charlie_client.get("/api/system/backup").status_code, 403)
        self.assertEqual(charlie_client.post("/api/system/restore", json={"songs": []}).status_code, 403)

        # 4. Regular user CANNOT delete or modify library songs (403 Forbidden)
        self.assertEqual(charlie_client.delete("/api/music/non-existent-id").status_code, 403)
        self.assertEqual(charlie_client.put("/api/music/non-existent-id", json={"title": "Hack"}).status_code, 403)

        # 5. Unauthenticated user CANNOT upload files (401 Unauthorized)
        self.assertEqual(anon_client.post("/api/music/upload").status_code, 401)

        # 6. Invalid YouTube URLs are strictly rejected (400 Bad Request)
        self.assertEqual(
            self.client.post("/api/music/download", json={"youtube_url": "file:///etc/passwd"}).status_code,
            400,
        )
        self.assertEqual(
            self.client.post("/api/music/download", json={"youtube_url": "http://evil.com/exploit"}).status_code,
            400,
        )

        # 7. Path traversal attempt in stream and invalid ID format are rejected (400)
        self.assertEqual(
            self.client.get("/api/music/download-file/invalid..song..id!@#").status_code,
            400,
        )
        self.assertIn(
            self.client.get("/api/music/stream/..%2F..%2Fetc%2Fpasswd").status_code,
            [400, 404],
        )

        # 8. Brute force rate limiting on login: 5 failed attempts triggers 429
        from routers.auth import _failed_login_attempts
        _failed_login_attempts.clear()
        for _ in range(5):
            bad_login = anon_client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "wrong_password_attempt"},
            )
            self.assertEqual(bad_login.status_code, 401)

        # The 6th attempt must be blocked by rate limiter with 429 Too Many Requests
        rate_limited_resp = anon_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrong_password_attempt"},
        )
        self.assertEqual(rate_limited_resp.status_code, 429)
        _failed_login_attempts.clear()

        # Clean up test user
        self.client.delete(f"/api/admin/users/{charlie_id}")


if __name__ == "__main__":
    unittest.main()

