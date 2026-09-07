import os
from pathlib import Path

# ─── Tailscale ───
TAILSCALE_IP = os.getenv("SONICLINK_HOST", "0.0.0.0")
PORT = int(os.getenv("SONICLINK_PORT", "8686"))

# ─── Paths ───
BASE_DIR = Path(__file__).parent
DATA_DIR = Path(os.getenv("SONICLINK_DATA", str(BASE_DIR / "data")))

# Prioritize saving music on Windows drive if mounted (/media/windows/Music)
WINDOWS_MUSIC_DIR = Path("/media/windows/Music")
if WINDOWS_MUSIC_DIR.parent.exists():
    try:
        WINDOWS_MUSIC_DIR.mkdir(parents=True, exist_ok=True)
        MUSIC_DIR = WINDOWS_MUSIC_DIR
    except Exception:
        MUSIC_DIR = DATA_DIR / "music"
else:
    MUSIC_DIR = DATA_DIR / "music"

COVERS_DIR = DATA_DIR / "covers"
DB_PATH = DATA_DIR / "soniclink.db"

# Create directories
MUSIC_DIR.mkdir(parents=True, exist_ok=True)
COVERS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Audio Settings ───
DEFAULT_AUDIO_FORMAT = "mp3"
DEFAULT_AUDIO_QUALITY = "192"  # kbps

# ─── External APIs ───
MUSICBRAINZ_BASE_URL = "https://musicbrainz.org/ws/2"
COVERART_BASE_URL = "https://coverartarchive.org"
LRCLIB_BASE_URL = "https://lrclib.net/api"
USER_AGENT = "SonicLink/1.0.0 (https://github.com/soniclink)"

# ─── CORS ───
ALLOWED_ORIGINS = ["*"]  # Private Tailscale network - allow all

# ─── Equalizer Default Presets ───
EQUALIZER_PRESETS = [
    {"id": "flat", "name": "Flat", "bands": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "is_default": True},
    {"id": "bass_boost", "name": "Bass Boost", "bands": [6, 5, 4, 2, 1, 0, 0, 0, 0, 0], "is_default": True},
    {"id": "treble_boost", "name": "Treble Boost", "bands": [0, 0, 0, 0, 0, 1, 2, 4, 5, 6], "is_default": True},
    {"id": "vocal", "name": "Vocal", "bands": [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1], "is_default": True},
    {"id": "rock", "name": "Rock", "bands": [4, 3, 1, 0, -1, -1, 0, 2, 3, 4], "is_default": True},
    {"id": "pop", "name": "Pop", "bands": [-1, 1, 3, 4, 3, 1, 0, -1, -1, -1], "is_default": True},
    {"id": "jazz", "name": "Jazz", "bands": [3, 2, 0, 1, -1, -1, 0, 1, 2, 3], "is_default": True},
    {"id": "electronic", "name": "Electronic", "bands": [4, 3, 1, 0, -1, 1, 0, 2, 4, 5], "is_default": True},
    {"id": "classical", "name": "Classical", "bands": [3, 2, 1, 0, 0, 0, 0, 1, 2, 3], "is_default": True},
    {"id": "hip_hop", "name": "Hip Hop", "bands": [5, 4, 2, 1, 0, 0, 1, 0, 2, 3], "is_default": True},
]
