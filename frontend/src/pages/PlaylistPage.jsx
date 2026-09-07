import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import usePlayerStore from '../stores/playerStore';
import { formatDuration } from '../utils/format';
import {
  IconPlay,
  IconShuffle,
  IconDelete,
  IconChevronDown,
  IconMusic,
  IconDownload,
  IconOffline,
} from '../components/common/Icons';
import { isSongOffline, downloadSongEverywhere } from '../utils/storage';

export default function PlaylistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offlineStatus, setOfflineStatus] = useState({});
  const [cachingId, setCachingId] = useState(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const fileInputRef = useRef(null);

  const playSong = usePlayerStore((s) => s.playSong);
  const playList = usePlayerStore((s) => s.playList);
  const currentSong = usePlayerStore((s) => s.currentSong);

  useEffect(() => {
    loadPlaylist();
  }, [id]);

  async function loadPlaylist() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPlaylist(id);
      setPlaylist(data);

      if (data.songs && data.songs.length > 0) {
        const statuses = {};
        for (const s of data.songs) {
          if (s.id) {
            statuses[s.id] = await isSongOffline(s.id);
          }
        }
        setOfflineStatus(statuses);
      }
    } catch (err) {
      setError(err.message || 'Failed to load playlist');
    }
    setIsLoading(false);
  }

  async function handleRemoveSong(songId, e) {
    e.stopPropagation();
    try {
      await api.removeSongFromPlaylist(id, songId);
      setPlaylist((prev) => ({
        ...prev,
        songs: prev.songs.filter((s) => s.id !== songId),
        song_count: Math.max(0, (prev.song_count || 1) - 1),
      }));
    } catch (err) {
      alert('Failed to remove song: ' + err.message);
    }
  }

  async function handleDeletePlaylist() {
    if (!confirm(`Are you sure you want to delete "${playlist.name}"?`)) return;
    try {
      await api.deletePlaylist(id);
      navigate('/library');
    } catch (err) {
      alert('Failed to delete playlist: ' + err.message);
    }
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingCover(true);
    try {
      const res = await api.uploadPlaylistCover(id, file);
      setPlaylist((prev) => ({
        ...prev,
        cover_image: `${res.cover_url}?t=${Date.now()}`,
      }));
    } catch (err) {
      alert('Failed to upload cover: ' + err.message);
    }
    setIsUploadingCover(false);
  }

  async function handleCacheOffline(song, e) {
    e.stopPropagation();
    const songId = song.id || song.songId;
    if (!songId || cachingId) return;
    setCachingId(songId);
    try {
      await downloadSongEverywhere(song);
      setOfflineStatus((prev) => ({ ...prev, [songId]: true }));
    } catch (err) {
      console.error('Failed to cache song:', err);
    }
    setCachingId(null);
  }

  const handlePlayAll = (shuffleMode = false) => {
    if (!playlist?.songs || playlist.songs.length === 0) return;
    let list = [...playlist.songs];
    if (shuffleMode) {
      list = list.sort(() => Math.random() - 0.5);
    }
    playList(list, 0);
  };

  if (isLoading) {
    return (
      <div className="page">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton" style={{ width: '100%', height: 180, borderRadius: 'var(--radius-lg)' }} />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="song-item">
              <div className="skeleton skeleton-cover" />
              <div className="song-info">
                <div className="skeleton skeleton-text" style={{ width: '60%' }} />
                <div className="skeleton skeleton-text-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="page">
        <div className="empty-state">
          <IconMusic size={64} />
          <h2 style={{ marginTop: 16 }}>Playlist not found</h2>
          <p>{error || "This playlist doesn't exist or was deleted."}</p>
          <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => navigate('/library')}>
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  const songs = playlist.songs || [];
  const totalDuration = songs.reduce((acc, s) => acc + (s.duration || 0), 0);

  return (
    <div className="page">
      {/* Header Banner */}
      <div
        className="glass-card"
        style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          marginBottom: 'var(--space-2xl)',
          position: 'relative',
        }}
      >
        <button
          onClick={() => navigate('/library')}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            color: 'var(--text-tertiary)',
          }}
          title="Close"
        >
          ✕
        </button>

        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleCoverUpload}
        />
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: 'clamp(85px, 24vw, 130px)',
            height: 'clamp(85px, 24vw, 130px)',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--accent-dim), var(--bg-highlight))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden',
            position: 'relative',
            cursor: 'pointer',
          }}
          title="Click to change playlist cover"
        >
          {playlist.cover_image ? (
            <img
              src={playlist.cover_image}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : songs[0]?.cover_art_url ? (
            <img
              src={songs[0].cover_art_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <IconMusic size={36} style={{ color: 'var(--accent)' }} />
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isUploadingCover ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isUploadingCover ? 1 : 0.85,
              transition: 'opacity 0.2s ease',
            }}
          >
            {isUploadingCover ? (
              <div className="loading-spinner" style={{ width: 20, height: 20 }} />
            ) : (
              <span style={{ fontSize: '1.25rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>📷</span>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-micro">PLAYLIST</div>
          <h1
            style={{
              fontSize: 'clamp(1.15rem, 4vw, 1.6rem)',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 4,
            }}
          >
            {playlist.name}
          </h1>
          {playlist.description && (
            <p
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                marginTop: 4,
              }}
            >
              {playlist.description}
            </p>
          )}
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-tertiary)',
              marginTop: 8,
            }}
          >
            {songs.length} songs • {formatDuration(totalDuration)}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 'var(--space-xl)',
        }}
      >
        <button
          className="btn btn-primary"
          onClick={() => handlePlayAll(false)}
          disabled={songs.length === 0}
          style={{ padding: '12px 28px', fontSize: '1rem' }}
        >
          <IconPlay size={20} /> Play
        </button>

        <button
          className="btn btn-secondary btn-icon"
          onClick={() => handlePlayAll(true)}
          disabled={songs.length === 0}
          title="Shuffle Play"
        >
          <IconShuffle size={20} />
        </button>

        <button
          className="btn btn-ghost btn-icon"
          onClick={handleDeletePlaylist}
          title="Delete Playlist"
          style={{ marginLeft: 'auto', color: 'var(--danger)' }}
        >
          <IconDelete size={20} />
        </button>
      </div>

      {/* Song List */}
      {songs.length === 0 ? (
        <div className="empty-state">
          <IconMusic size={48} />
          <p>No songs in this playlist yet.</p>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 16 }}
            onClick={() => navigate('/search')}
          >
            Find & add music
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {songs.map((song, idx) => {
            const isPlaying = currentSong?.id === song.id;
            const isOffline = offlineStatus[song.id];
            const isCaching = cachingId === song.id;

            return (
              <div
                key={song.id || idx}
                className={`song-item ${isPlaying ? 'active' : ''}`}
                onClick={() => playList(songs, idx)}
              >
                <div style={{ width: 24, textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                  {isPlaying ? (
                    <div className="playing-bars" style={{ justifyContent: 'center' }}>
                      <div className="playing-bar" />
                      <div className="playing-bar" />
                      <div className="playing-bar" />
                    </div>
                  ) : (
                    idx + 1
                  )}
                </div>

                {song.cover_art_url ? (
                  <img className="song-cover" src={song.cover_art_url} alt="" />
                ) : (
                  <div className="song-cover-placeholder">♪</div>
                )}

                <div className="song-info">
                  <div className="song-title">{song.title}</div>
                  <div className="song-artist">
                    {song.artist}
                    {isOffline && (
                      <span className="download-badge" style={{ marginLeft: 6 }}>
                        <IconOffline size={10} /> Saved
                      </span>
                    )}
                  </div>
                </div>

                <div className="song-duration">{formatDuration(song.duration)}</div>

                <div className="song-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-icon"
                    onClick={(e) => handleCacheOffline(song, e)}
                    disabled={isOffline || isCaching}
                    title={isOffline ? 'Saved offline' : 'Download for offline'}
                    style={{ color: isOffline ? 'var(--accent)' : 'var(--text-tertiary)' }}
                  >
                    {isCaching ? (
                      <div className="loading-spinner" style={{ width: 14, height: 14 }} />
                    ) : isOffline ? (
                      <IconOffline size={16} />
                    ) : (
                      <IconDownload size={16} />
                    )}
                  </button>

                  <button
                    className="btn-icon"
                    onClick={(e) => handleRemoveSong(song.id, e)}
                    title="Remove from playlist"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <IconDelete size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
