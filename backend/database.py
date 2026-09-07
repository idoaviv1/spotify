import json
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from config import DB_PATH

DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


# ─── Models ───

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
    name = Column(String, nullable=False)
    description = Column(String, default="")
    cover_image = Column(String)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    songs = relationship("PlaylistSong", back_populates="playlist", cascade="all, delete-orphan",
                         order_by="PlaylistSong.position")

    def to_dict(self, include_songs=False):
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "cover_image": self.cover_image,
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
    song_id = Column(String, ForeignKey("songs.id", ondelete="CASCADE"))
    played_at = Column(DateTime, default=utcnow)
    duration_listened = Column(Integer, default=0)  # seconds

    song = relationship("Song", back_populates="history_entries")

    def to_dict(self):
        data = {
            "id": self.id,
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


# ─── DB Init ───

def init_db():
    """Create all tables and seed default data."""
    Base.metadata.create_all(bind=engine)
    _seed_equalizer_presets()


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
