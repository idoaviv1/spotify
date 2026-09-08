import json
import uuid
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, Text, ForeignKey, DateTime, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from config import DB_PATH

DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, echo=False)

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


# ─── Models ───

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, default="")
    role = Column(String, default="user")  # "admin" or "user"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    playlists = relationship("Playlist", back_populates="user", cascade="all, delete-orphan")
    history_entries = relationship("ListeningHistory", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name or self.username,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Song(Base):
    __tablename__ = "songs"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    artist = Column(String, default="Unknown Artist")
    album = Column(String, default="Unknown Album")
    duration = Column(Integer, default=0)  # seconds
    youtube_url = Column(String)
    youtube_id = Column(String)
    file_path = Column(String)  # local path on server
    cover_art_url = Column(String)
    cover_art_local = Column(String)  # local cover file path
    musicbrainz_id = Column(String)
    file_size = Column(Integer, default=0)
    bitrate = Column(Integer, default=192)
    format = Column(String, default="mp3")
    created_at = Column(DateTime, default=utcnow)

    playlist_entries = relationship("PlaylistSong", back_populates="song", cascade="all, delete-orphan")
    history_entries = relationship("ListeningHistory", back_populates="song", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "duration": self.duration,
            "youtube_url": self.youtube_url,
            "youtube_id": self.youtube_id,
            "file_path": self.file_path,
            "cover_art_url": self.cover_art_url,
            "file_size": self.file_size,
            "bitrate": self.bitrate,
            "format": self.format,
            "is_downloaded": self.file_path is not None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    cover_image = Column(String)
    is_favorites = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="playlists")
    songs = relationship("PlaylistSong", back_populates="playlist", cascade="all, delete-orphan",
                         order_by="PlaylistSong.position")

    def to_dict(self, include_songs=False):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "description": self.description,
            "cover_image": self.cover_image,
            "is_favorites": bool(self.is_favorites),
            "song_count": len(self.songs) if self.songs else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_songs:
            data["songs"] = [ps.song.to_dict() for ps in self.songs if ps.song]
        return data


class PlaylistSong(Base):
    __tablename__ = "playlist_songs"

    playlist_id = Column(String, ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True)
    song_id = Column(String, ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True)
    position = Column(Integer, default=0)
    added_at = Column(DateTime, default=utcnow)

    playlist = relationship("Playlist", back_populates="songs")
    song = relationship("Song", back_populates="playlist_entries")


class ListeningHistory(Base):
    __tablename__ = "listening_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    song_id = Column(String, ForeignKey("songs.id", ondelete="CASCADE"))
    played_at = Column(DateTime, default=utcnow)
    duration_listened = Column(Integer, default=0)  # seconds

    user = relationship("User", back_populates="history_entries")
    song = relationship("Song", back_populates="history_entries")

    def to_dict(self):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "song_id": self.song_id,
            "played_at": self.played_at.isoformat() if self.played_at else None,
            "duration_listened": self.duration_listened,
        }
        if self.song:
            data["song"] = self.song.to_dict()
        return data


class EqualizerPreset(Base):
    __tablename__ = "equalizer_presets"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    bands = Column(Text, nullable=False)  # JSON array of 10 band values
    is_default = Column(Boolean, default=False)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "bands": json.loads(self.bands) if isinstance(self.bands, str) else self.bands,
            "is_default": self.is_default,
        }


FAVORITES_PLAYLIST_ID = "favorites"


# ─── DB Init & Migration ───

def init_db():
    """Create all tables, migrate schema, and seed default data."""
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
    _seed_admin_user()
    _seed_equalizer_presets()


def _migrate_schema():
    """Ensure newly added columns exist in existing SQLite database tables."""
    with engine.connect() as conn:
        # 1. Check playlists table
        try:
            res = conn.exec_driver_sql("PRAGMA table_info(playlists)").fetchall()
            cols = {row[1] for row in res}
            if "user_id" not in cols:
                conn.exec_driver_sql("ALTER TABLE playlists ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")
            if "is_favorites" not in cols:
                conn.exec_driver_sql("ALTER TABLE playlists ADD COLUMN is_favorites BOOLEAN DEFAULT 0")
        except Exception as e:
            print(f"Warning during playlists schema migration: {e}")

        # 2. Check listening_history table
        try:
            res = conn.exec_driver_sql("PRAGMA table_info(listening_history)").fetchall()
            cols = {row[1] for row in res}
            if "user_id" not in cols:
                conn.exec_driver_sql("ALTER TABLE listening_history ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")
        except Exception as e:
            print(f"Warning during listening_history schema migration: {e}")

        conn.commit()


def _seed_admin_user():
    """Seed initial default Administrator if no users exist."""
    import bcrypt

    db = SessionLocal()
    try:
        admin_count = db.query(User).count()
        if admin_count == 0:
            salt = bcrypt.gensalt(rounds=12)
            hashed = bcrypt.hashpw("admin123".encode("utf-8"), salt).decode("utf-8")
            admin_user = User(
                id=str(uuid.uuid4()),
                username="admin",
                password_hash=hashed,
                display_name="Administrator",
                role="admin",
                is_active=True,
            )
            db.add(admin_user)
            db.flush()

            # Attach any orphaned existing playlists to this admin
            orphaned_playlists = db.query(Playlist).filter(Playlist.user_id.is_(None)).all()
            for p in orphaned_playlists:
                p.user_id = admin_user.id
                if p.id == FAVORITES_PLAYLIST_ID:
                    p.is_favorites = True

            # Also ensure admin has a favorites playlist
            admin_fav = (
                db.query(Playlist)
                .filter(Playlist.user_id == admin_user.id, Playlist.is_favorites == True)
                .first()
            )
            if not admin_fav:
                fav = Playlist(
                    id=f"fav_{admin_user.id}",
                    user_id=admin_user.id,
                    name="Liked Songs",
                    description="Your favorite and liked tracks 💚",
                    is_favorites=True,
                )
                db.add(fav)

            # Attach any orphaned history to admin
            db.query(ListeningHistory).filter(ListeningHistory.user_id.is_(None)).update(
                {"user_id": admin_user.id}, synchronize_session=False
            )

            db.commit()
    finally:
        db.close()


def _seed_equalizer_presets():
    """Seed default equalizer presets if they don't exist."""
    from config import EQUALIZER_PRESETS
    db = SessionLocal()
    try:
        existing = db.query(EqualizerPreset).filter(EqualizerPreset.is_default == True).count()
        if existing == 0:
            for preset in EQUALIZER_PRESETS:
                db.add(EqualizerPreset(
                    id=preset["id"],
                    name=preset["name"],
                    bands=json.dumps(preset["bands"]),
                    is_default=preset["is_default"],
                ))
            db.commit()
    finally:
        db.close()


def get_db():
    """Dependency for FastAPI endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
