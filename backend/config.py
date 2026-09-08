import os
from pathlib import Path

# ─── Tailscale ───
TAILSCALE_IP = os.getenv("HOMEIFY_HOST", os.getenv("SONICLINK_HOST", "0.0.0.0"))
PORT = int(os.getenv("HOMEIFY_PORT", os.getenv("SONICLINK_PORT", "8686")))

# ─── Paths ───
BASE_DIR = Path(__file__).parent
IS_TESTING = os.getenv("HOMEIFY_TESTING", "").lower() in ("1", "true", "yes")
DATA_DIR = Path(os.getenv("HOMEIFY_DATA", os.getenv("SONICLINK_DATA", str(BASE_DIR / "data"))))

# Prioritize saving music on Windows drive if mounted (/media/windows/Music) - except when testing
WINDOWS_MUSIC_DIR = Path("/media/windows/Music")
if not IS_TESTING and WINDOWS_MUSIC_DIR.parent.exists():
    try:
        WINDOWS_MUSIC_DIR.mkdir(parents=True, exist_ok=True)
        MUSIC_DIR = WINDOWS_MUSIC_DIR
    except Exception:
        MUSIC_DIR = DATA_DIR / "music"
else:
    MUSIC_DIR = DATA_DIR / "music"

COVERS_DIR = DATA_DIR / "covers"

# Database migration / compatibility
if IS_TESTING:
    DB_PATH = DATA_DIR / "test_homeify.db"
else:
    OLD_DB_PATH = DATA_DIR / "soniclink.db"
    NEW_DB_PATH = DATA_DIR / "homeify.db"

    if not NEW_DB_PATH.exists() and OLD_DB_PATH.exists():
        try:
            import shutil
            shutil.copy2(OLD_DB_PATH, NEW_DB_PATH)
        except Exception:
            pass

    DB_PATH = NEW_DB_PATH if NEW_DB_PATH.exists() else OLD_DB_PATH

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
USER_AGENT = "Homeify/1.0.0 (https://github.com/homeify)"

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

# ─── Authentication & Security ───
def _load_or_generate_jwt_secret() -> str:
    env_secret = os.getenv("HOMEIFY_JWT_SECRET")
    if env_secret and len(env_secret) >= 16:
        return env_secret

    secret_file = DATA_DIR / ".jwt_secret"
    if secret_file.exists():
        try:
            val = secret_file.read_text().strip()
            if len(val) >= 32:
                return val
        except Exception:
            pass

    import secrets
    new_secret = secrets.token_hex(64)
    try:
        secret_file.write_text(new_secret)
        try:
            os.chmod(secret_file, 0o600)
        except Exception:
            pass
    except Exception:
        pass
    return new_secret

JWT_SECRET = _load_or_generate_jwt_secret()
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("HOMEIFY_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 30)))  # 30 days
