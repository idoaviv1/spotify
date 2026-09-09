import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import usePlayerStore from '../stores/playerStore';
import { formatDuration, formatFileSize } from '../utils/format';
import { IconMusic, IconPlus, IconSearch, IconDelete, IconPlay, IconDownload, IconOffline, IconHeart } from '../components/common/Icons';
import { isSongOffline, downloadSongEverywhere, getAllOfflineSongs, removeOfflineAudio, getOfflineStorageSize } from '../utils/storage';

export default function LibraryPage() {
  const [tab, setTab] = useState('songs');
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [offlineList, setOfflineList] = useState([]);
  const [offlineBytes, setOfflineBytes] = useState(0);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [offlineSongs, setOfflineSongs] = useState({});
  const [cachingId, setCachingId] = useState(null);

  const playSong = usePlayerStore((s) => s.playSong);
  const playList = usePlayerStore((s) => s.playList);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const openContextMenu = usePlayerStore((s) => s.openContextMenu);
  const isFavorite = usePlayerStore((s) => s.isFavorite);
  const toggleFavorite = usePlayerStore((s) => s.toggleFavorite);
  const favoriteIds = usePlayerStore((s) => s.favoriteIds);
  const navigate = useNavigate();

  const loadData = useCallback(async (isMountedRef) => {
    let serverSongs = [];
    try {
      const [libData, playlistData, statsData] = await Promise.all([
        api.getLibrary(1, 200).catch(() => ({ songs: [] })),
        api.getPlaylists().catch(() => ({ playlists: [] })),
        api.getLibraryStats().catch(() => null),
      ]);
      if (isMountedRef && !isMountedRef()) return;
      serverSongs = libData.songs || [];
      setSongs(serverSongs);
      setPlaylists(playlistData.playlists || []);
      setStats(statsData);
    } catch (err) {
      console.warn('Library server load error (might be offline):', err);
    }

    // Load local offline storage
    try {
      const localCached = await getAllOfflineSongs();
      if (isMountedRef && !isMountedRef()) return;
      setOfflineList(localCached || []);
      const bytes = await getOfflineStorageSize();
      if (isMountedRef && !isMountedRef()) return;
      setOfflineBytes(bytes);

      const statusMap = {};
      for (const item of (localCached || [])) {
        statusMap[item.songId || item.id] = true;
      }

      // Check remaining server songs concurrently
      const unverified = serverSongs.filter(s => s.id && !statusMap[s.id]);
      if (unverified.length > 0) {
        const results = await Promise.all(
          unverified.map(async s => [s.id, await isSongOffline(s)])
        );
        if (isMountedRef && !isMountedRef()) return;
        for (const [id, isOff] of results) {
          statusMap[id] = isOff;
        }
      }

      setOfflineSongs(statusMap);

      // If server returned no songs or is offline, switch to Offline tab automatically
      if (serverSongs.length === 0 && localCached && localCached.length > 0) {
        setTab('offline');
      }
    } catch (err) {
      console.error('Offline storage load error:', err);
    } finally {
      if (!isMountedRef || isMountedRef()) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    loadData(() => mounted);
    return () => {
      mounted = false;
    };
  }, [loadData]);

  const filteredSongs = (tab === 'offline' ? offlineList : songs).filter(s =>
    !searchQuery ||
    s.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.artist?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      await api.createPlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      setShowCreatePlaylist(false);
      loadData();
    } catch (err) {
      console.error('Create playlist error:', err);
    }
  };

  const handleDeleteSong = async (e, songId) => {
    e.stopPropagation();
    if (!confirm('Delete this song from your server library?')) return;
    try {
      await api.deleteSong(songId);
      setSongs(songs.filter(s => s.id !== songId));
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleRemoveOfflineOnly = async (e, song) => {
    e.stopPropagation();
    if (!confirm(`האם להסיר את השיר "${song.title}" מהזיכרון של המכשיר?`)) return;
    const id = song.songId || song.id;
    await removeOfflineAudio(song);
    setOfflineList(prev => prev.filter(s => (s.songId || s.id) !== id));
    setOfflineSongs(prev => ({ ...prev, [id]: false }));
    const bytes = await getOfflineStorageSize();
    setOfflineBytes(bytes);
  };

  const handleCacheOffline = async (e, song) => {
    e.stopPropagation();
    const id = song.id || song.songId;
    setCachingId(id);
    try {
      await downloadSongEverywhere(song);
      setOfflineSongs(prev => ({ ...prev, [id]: true }));
      const localCached = await getAllOfflineSongs();
      setOfflineList(localCached);
      const bytes = await getOfflineStorageSize();
      setOfflineBytes(bytes);
    } catch (err) {
      console.error('Cache error:', err);
    }
    setCachingId(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-display">Your Library</h1>
        {stats && tab === 'songs' && (
          <div className="text-caption" style={{ marginTop: 4 }}>
            {stats.total_songs} songs on server · {stats.total_duration_hours}h · {stats.total_size_mb} MB
          </div>
        )}
        {tab === 'offline' && (
          <div className="text-caption" style={{ marginTop: 4, color: '#10b981' }}>
            ✓ {offlineList.length} songs stored locally on device · {formatFileSize(offlineBytes)}
          </div>
        )}
      </div>

      {/* Liked Songs Featured Pinned Banner */}
      <div
        className="glass-card liked-songs-banner"
        onClick={() => navigate('/playlist/favorites')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 18px',
          marginBottom: 18,
          borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.2) 0%, rgba(16, 185, 129, 0.15) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #4f46e5 0%, #10b981 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            flexShrink: 0,
          }}
        >
          <IconHeart size={26} filled={true} style={{ color: '#fff' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Liked Songs · שירים שאהבתי 💚
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {favoriteIds.size} {favoriteIds.size === 1 ? 'favorite track' : 'favorite tracks'}
          </div>
        </div>
        <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem' }}>
          Open ›
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'songs' ? 'active' : ''}`} onClick={() => setTab('songs')}>
          All Songs ({songs.length})
        </button>
        <button className={`tab ${tab === 'offline' ? 'active' : ''}`} onClick={() => setTab('offline')}>
          Downloaded ({offlineList.length})
        </button>
        <button className={`tab ${tab === 'playlists' ? 'active' : ''}`} onClick={() => setTab('playlists')}>
          Playlists
        </button>
      </div>

      {/* Filter Search */}
      {(tab === 'songs' || tab === 'offline') && (
        <>
          <div className="search-input-wrapper" style={{ marginBottom: 16 }}>
            <IconSearch size={18} className="search-icon" />
            <input
              className="search-input"
              type="text"
              placeholder={tab === 'offline' ? 'Filter downloaded songs...' : 'Filter library songs...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {filteredSongs.length > 0 && (
            <button
              className="btn btn-primary"
              style={{ marginBottom: 16, width: '100%' }}
              onClick={() => playList(filteredSongs, 0)}
            >
              <IconPlay size={18} /> Play All ({filteredSongs.length})
            </button>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((i) => {
                const widthPct = 50 + ((i * 19) % 40);
                return (
                  <div key={i} className="song-item">
                    <div className="skeleton skeleton-cover" />
                    <div className="song-info" style={{ gap: 6 }}>
                      <div className="skeleton skeleton-text" style={{ width: `${widthPct}%` }} />
                      <div className="skeleton skeleton-text-sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : filteredSongs.length > 0 ? (
            filteredSongs.map((song) => {
              const id = song.id || song.songId;
              const isOff = offlineSongs[id] || tab === 'offline';
              const isCurr = currentSong?.id === id || (currentSong?.title === song.title && currentSong?.artist === song.artist);

              return (
                <div
                  key={id || song.title}
                  className={`song-item ${isCurr ? 'active' : ''}`}
                  onClick={() => playSong({ ...song, id, is_downloaded: true })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openContextMenu(e.clientX, e.clientY, { ...song, id, is_downloaded: true });
                  }}
                >
                  {song.cover_data_url || song.cover_art_url || song.thumbnail ? (
                    <img className="song-cover" src={song.cover_data_url || song.cover_art_url || song.thumbnail} alt="" />
                  ) : (
                    <div className="song-cover-placeholder">♪</div>
                  )}
                  <div className="song-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="song-title">{song.title}</span>
                      {isOff && (
                        <IconOffline size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                      )}
                    </div>
                    <span className="song-artist">{song.artist}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className={`heart-btn ${isFavorite(id) ? 'liked' : ''}`}
                      style={{ padding: 6 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(song);
                      }}
                      title={isFavorite(id) ? 'Remove from Favorites' : 'Save to Favorites'}
                    >
                      <IconHeart size={16} filled={isFavorite(id)} />
                    </button>
                    <span className="song-duration">{formatDuration(song.duration)}</span>
                    {!isOff && (
                      <button
                        className="btn-icon"
                        style={{ width: 32, height: 32 }}
                        onClick={(e) => handleCacheOffline(e, song)}
                        disabled={cachingId === id}
                        title="Save to Phone"
                      >
                        {cachingId === id ? (
                          <div className="loading-spinner" style={{ width: 14, height: 14 }} />
                        ) : (
                          <IconDownload size={16} style={{ color: 'var(--text-tertiary)' }} />
                        )}
                      </button>
                    )}
                    {tab === 'offline' ? (
                      <button
                        className="btn-icon"
                        style={{ width: 32, height: 32, color: 'var(--text-tertiary)' }}
                        onClick={(e) => handleRemoveOfflineOnly(e, song)}
                        title="Remove from Device"
                      >
                        <IconDelete size={16} />
                      </button>
                    ) : (
                      <button
                        className="btn-icon"
                        style={{ width: 32, height: 32, color: 'var(--text-tertiary)' }}
                        onClick={(e) => handleDeleteSong(e, song.id)}
                        title="Delete from Library"
                      >
                        <IconDelete size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">
              <IconMusic size={64} />
              <h3 style={{ color: 'var(--text-secondary)' }}>
                {tab === 'offline' ? 'No songs downloaded yet' : 'No songs in your library'}
              </h3>
              <p>
                {tab === 'offline'
                  ? 'Download songs to listen offline without internet'
                  : 'Search and download songs to build your collection'}
              </p>
            </div>
          )}
        </>
      )}

      {/* Playlists Tab */}
      {tab === 'playlists' && (
        <>
          <button
            className="btn btn-secondary"
            style={{ marginBottom: 16, width: '100%' }}
            onClick={() => setShowCreatePlaylist(true)}
          >
            <IconPlus size={18} /> Create Playlist
          </button>

          {showCreatePlaylist && (
            <div className="glass-card" style={{ marginBottom: 16 }}>
              <input
                className="input"
                type="text"
                placeholder="Playlist name..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowCreatePlaylist(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleCreatePlaylist}>
                  Create
                </button>
              </div>
            </div>
          )}

          {playlists.length > 0 ? (
            playlists.map((pl) => (
              <div key={pl.id} className="song-item" onClick={() => navigate(`/playlist/${pl.id}`)}>
                {pl.id === 'favorites' ? (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      minWidth: 48,
                      borderRadius: 'var(--radius-sm)',
                      background: 'linear-gradient(135deg, #4f46e5 0%, #10b981 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)',
                    }}
                  >
                    <IconHeart size={22} filled={true} style={{ color: '#fff' }} />
                  </div>
                ) : (
                  <div
                    className="playlist-cover"
                    style={{ width: 48, height: 48, minWidth: 48, borderRadius: 'var(--radius-sm)' }}
                  >
                    <IconMusic size={20} style={{ color: 'var(--accent)', opacity: 0.6 }} />
                  </div>
                )}
                <div className="song-info">
                  <span className="song-title">{pl.name}</span>
                  <span className="song-artist">{pl.song_count} songs</span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <IconMusic size={64} />
              <h3 style={{ color: 'var(--text-secondary)' }}>No playlists yet</h3>
              <p>Create your first playlist!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
