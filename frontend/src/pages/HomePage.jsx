import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import usePlayerStore from '../stores/playerStore';
import { formatDuration, formatRelativeTime } from '../utils/format';
import { IconMusic, IconHistory, IconChevronRight, IconPlay } from '../components/common/Icons';

export default function HomePage() {
  const [recentSongs, setRecentSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [topSongs, setTopSongs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(true);
  const playSong = usePlayerStore((s) => s.playSong);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      await api.healthCheck();
      setServerOnline(true);
      const [recent, playlistData, top] = await Promise.all([
        api.getRecentSongs(10).catch(() => ({ songs: [] })),
        api.getPlaylists().catch(() => ({ playlists: [] })),
        api.getTopSongs(10).catch(() => ({ songs: [] })),
      ]);
      setRecentSongs(recent.songs || []);
      setPlaylists(playlistData.playlists || []);
      setTopSongs(top.songs || []);
    } catch {
      setServerOnline(false);
    }
    setIsLoading(false);
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  })();

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-display">{greeting} 🎵</h1>
        {!serverOnline && (
          <div style={{
            marginTop: 12, padding: '10px 16px',
            background: 'rgba(231, 76, 60, 0.15)',
            border: '1px solid rgba(231, 76, 60, 0.3)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8125rem', color: '#e74c3c'
          }}>
            ⚠️ Server offline. Check Tailscale connection.
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="song-item">
              <div className="skeleton skeleton-cover" />
              <div className="song-info" style={{ gap: 6 }}>
                <div className="skeleton skeleton-text" style={{ width: `${60 + Math.random() * 30}%` }} />
                <div className="skeleton skeleton-text-sm" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Continue Playing */}
          {currentSong && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Continue Playing</h2>
              </div>
              <div className="glass-card" style={{
                display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer'
              }} onClick={() => usePlayerStore.getState().toggleNowPlaying()}>
                {(currentSong.cover_art_url || currentSong.thumbnail) ? (
                  <img src={currentSong.cover_art_url || currentSong.thumbnail} alt=""
                    style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <div className="song-cover-placeholder" style={{ width: 64, height: 64, fontSize: '1.5rem' }}>♪</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="song-title" style={{ fontSize: '1rem', fontWeight: 600 }}>{currentSong.title}</div>
                  <div className="song-artist">{currentSong.artist}</div>
                </div>
                <div className="playing-bars">
                  <div className="playing-bar" /><div className="playing-bar" /><div className="playing-bar" /><div className="playing-bar" />
                </div>
              </div>
            </div>
          )}

          {/* Playlists */}
          {playlists.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Your Playlists</h2>
                <button className="section-link" onClick={() => navigate('/library')}>See all <IconChevronRight size={14} /></button>
              </div>
              <div className="horizontal-scroll">
                {playlists.map(pl => (
                  <div key={pl.id} className="playlist-card" onClick={() => navigate(`/playlist/${pl.id}`)}>
                    <div className="playlist-cover">
                      {pl.cover_image ? (
                        <img src={pl.cover_image} alt={pl.name} />
                      ) : (
                        <IconMusic size={40} style={{ color: 'var(--accent)', opacity: 0.6 }} />
                      )}
                    </div>
                    <div className="playlist-name">{pl.name}</div>
                    <div className="playlist-meta">{pl.song_count} songs</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recently Added */}
          {recentSongs.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Recently Added</h2>
                <button className="section-link" onClick={() => navigate('/library')}>See all</button>
              </div>
              {recentSongs.slice(0, 6).map(song => (
                <div key={song.id} className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                  onClick={() => playSong(song)}>
                  {song.cover_art_url ? (
                    <img className="song-cover" src={song.cover_art_url} alt="" />
                  ) : (
                    <div className="song-cover-placeholder">♪</div>
                  )}
                  <div className="song-info">
                    <span className="song-title">{song.title}</span>
                    <span className="song-artist">{song.artist}</span>
                  </div>
                  <span className="song-duration">{formatDuration(song.duration)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Most Played */}
          {topSongs.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Most Played</h2>
              </div>
              {topSongs.slice(0, 5).map((song, idx) => (
                <div key={song.id} className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                  onClick={() => playSong(song)}>
                  <span style={{
                    width: 28, textAlign: 'center', fontWeight: 700,
                    color: idx < 3 ? 'var(--accent)' : 'var(--text-tertiary)',
                    fontSize: '1rem',
                  }}>{idx + 1}</span>
                  {song.cover_art_url ? (
                    <img className="song-cover" src={song.cover_art_url} alt="" />
                  ) : (
                    <div className="song-cover-placeholder">♪</div>
                  )}
                  <div className="song-info">
                    <span className="song-title">{song.title}</span>
                    <span className="song-artist">{song.artist}</span>
                  </div>
                  <span className="song-duration" style={{ color: 'var(--text-tertiary)' }}>
                    {song.play_count}×
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {recentSongs.length === 0 && playlists.length === 0 && (
            <div className="empty-state">
              <IconMusic size={64} />
              <h3 style={{ marginBottom: 8, color: 'var(--text-secondary)' }}>Your library is empty</h3>
              <p>Search for music to start building your collection!</p>
              <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => navigate('/search')}>
                Search Music
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
