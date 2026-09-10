import PlaylistImportModal from '../components/Import/PlaylistImportModal';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import usePlayerStore from '../stores/playerStore';
import useI18nStore from '../stores/i18nStore';
import { formatDuration, formatFileSize } from '../utils/format';
import { IconMusic, IconPlus, IconSearch, IconDelete, IconPlay, IconDownload, IconOffline, IconHeart, IconSparkles } from '../components/common/Icons';
import { isSongOffline, downloadSongEverywhere, getAllOfflineSongs, removeOfflineAudio, getOfflineStorageSize } from '../utils/storage';
import useDownloadStore from '../stores/downloadStore';
import ActiveDownloadsBanner from '../components/common/ActiveDownloadsBanner';

export default function LibraryPage() {
  const t = useI18nStore((s) => s.t);
  const language = useI18nStore((s) => s.language);
  const [tab, setTab] = useState('songs');
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [offlineList, setOfflineList] = useState([]);
  const [offlineBytes, setOfflineBytes] = useState(0);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [offlineSongs, setOfflineSongs] = useState({});
  const [cachingIds, setCachingIds] = useState({});
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const playSong = usePlayerStore((s) => s.playSong);
  const playList = usePlayerStore((s) => s.playList);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const openContextMenu = usePlayerStore((s) => s.openContextMenu);
  const isFavorite = usePlayerStore((s) => s.isFavorite);
  const toggleFavorite = usePlayerStore((s) => s.toggleFavorite);
  const favoriteIds = usePlayerStore((s) => s.favoriteIds);
  const navigate = useNavigate();
  const startDownload = useDownloadStore((s) => s.startDownload);
  const isDownloading = useDownloadStore((s) => s.isDownloading);
  const getProgress = useDownloadStore((s) => s.getProgress);

  // 1. Instantly load local offline songs from IndexedDB (0ms network delay)
  const loadOfflineDataImmediately = useCallback(async () => {
    try {
      const localCached = await getAllOfflineSongs();
      const cachedList = localCached || [];
      setOfflineList(cachedList);

      const bytes = await getOfflineStorageSize();
      setOfflineBytes(bytes);

      const statusMap = {};
      for (const item of cachedList) {
        if (item.songId) statusMap[item.songId] = true;
        if (item.id) statusMap[item.id] = true;
        if (item.youtube_id) statusMap[item.youtube_id] = true;
      }
      setOfflineSongs(statusMap);

      // If device is offline or user has downloaded songs and no server songs yet, default to offline tab
      if (!navigator.onLine || cachedList.length > 0) {
        if (!navigator.onLine) {
          setTab('offline');
          setIsOfflineMode(true);
          setIsLoading(false);
        }
      }
      return cachedList;
    } catch (e) {
      console.warn('Failed to load local offline data:', e);
      return [];
    }
  }, []);

  const loadData = useCallback(async (isMountedRef) => {
    // A. Read local offline storage immediately
    const localCached = await loadOfflineDataImmediately();
    if (isMountedRef && !isMountedRef()) return;

    // B. Fetch server data with a 3.5-second timeout so offline devices never hang!
    let serverSongs = [];
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Server timeout - running in offline mode')), 3500)
    );

    try {
      const serverFetch = Promise.all([
        api.getLibrary(1, 200),
        api.getPlaylists(),
        api.getLibraryStats(),
      ]);

      const [libData, playlistData, statsData] = await Promise.race([serverFetch, timeoutPromise]);
      if (isMountedRef && !isMountedRef()) return;

      serverSongs = libData?.songs || [];
      setSongs(serverSongs);
      setPlaylists(playlistData?.playlists || []);
      setStats(statsData);
      setIsOfflineMode(false);

      // Sync offline indicators across server songs
      const statusMap = {};
      for (const item of localCached) {
        if (item.songId) statusMap[item.songId] = true;
        if (item.id) statusMap[item.id] = true;
        if (item.youtube_id) statusMap[item.youtube_id] = true;
      }

      setOfflineSongs(statusMap);
    } catch (err) {
      console.warn('Server unreachable or timeout, running in offline mode:', err.message);
      setIsOfflineMode(true);
      // Automatically switch to offline tab if server is unreachable and we have offline songs
      if (localCached.length > 0) {
        setTab('offline');
      }
    } finally {
      if (!isMountedRef || isMountedRef()) {
        setIsLoading(false);
      }
    }
  }, [loadOfflineDataImmediately]);

  useEffect(() => {
    let mounted = true;
    loadData(() => mounted);
    return () => {
      mounted = false;
    };
  }, [loadData]);

  useEffect(() => {
    const onOfflineUpdated = async () => {
      await loadOfflineDataImmediately();
    };
    window.addEventListener('homeify:offline-updated', onOfflineUpdated);
    return () => window.removeEventListener('homeify:offline-updated', onOfflineUpdated);
  }, [loadOfflineDataImmediately]);

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
    setOfflineList(prev => prev.filter(s => (s.songId || s.id) !== id && (!song.youtube_id || s.youtube_id !== song.youtube_id)));
    setOfflineSongs(prev => ({
      ...prev,
      [id]: false,
      ...(song.youtube_id ? { [song.youtube_id]: false } : {})
    }));
    const bytes = await getOfflineStorageSize();
    setOfflineBytes(bytes);
  };

  const handleCacheOffline = async (e, song) => {
    e.stopPropagation();
    try {
      await startDownload(song);
    } catch (err) {
      console.error('Cache error:', err);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-display">{t('library.title')}</h1>
        {stats && tab === 'songs' && (
          <div className="text-caption" style={{ marginTop: 4 }}>
            {stats.total_songs} {t('library.songs')} · {stats.total_duration_hours}h · {stats.total_size_mb} MB
          </div>
        )}
        {tab === 'offline' && (
          <div className="text-caption" style={{ marginTop: 4, color: '#10b981' }}>
            ✓ {offlineList.length} {t('library.songs')} · {formatFileSize(offlineBytes)}
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
            color: '#fff',
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
            flexShrink: 0,
          }}
        >
          <IconHeart size={24} filled={true} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
            {t('library.favorites')}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {favoriteIds.size} {favoriteIds.size === 1 ? 'track' : 'tracks'}
          </div>
        </div>
        <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem' }}>
          {language === 'he' ? 'פתח ‹' : 'Open ›'}
        </div>
      </div>

      {/* Real-time Active Downloads Banner */}
      <ActiveDownloadsBanner />

      {/* Offline Storage Information Card */}
      {tab === 'offline' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          marginBottom: 18,
          borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.08) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
              flexShrink: 0,
            }}>
              <IconOffline size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{language === 'he' ? 'נפח אחסון תפוס בטלפון:' : 'Local Storage on Device:'}</span>
                <span style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 6, fontSize: '0.95rem' }}>
                  {formatFileSize(offlineBytes)}
                </span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {offlineList.length} {language === 'he' ? 'שירים שמורים פיזית בזיכרון המכשיר · זמינים תמיד ללא אינטרנט' : 'songs stored locally · available offline anytime'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'songs' ? 'active' : ''}`} onClick={() => setTab('songs')}>
          {t('library.songs')} ({songs.length})
        </button>
        <button className={`tab ${tab === 'offline' ? 'active' : ''}`} onClick={() => setTab('offline')}>
          {t('library.offline')} ({offlineList.length}{offlineBytes > 0 ? ` · ${formatFileSize(offlineBytes)}` : ''})
        </button>
        <button className={`tab ${tab === 'playlists' ? 'active' : ''}`} onClick={() => setTab('playlists')}>
          {t('library.playlists')}
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
              const isDling = isDownloading(song) || Boolean(cachingIds[id] || cachingIds[song.songId] || (song.youtube_id && cachingIds[song.youtube_id]));
              const dlingPct = getProgress(song);

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
                        className={`btn-icon ${isDling ? 'download-btn-live is-downloading' : ''}`}
                        style={{ minWidth: 32, height: 32 }}
                        onClick={(e) => handleCacheOffline(e, song)}
                        disabled={isDling}
                        title={isDling ? `${dlingPct}%` : "Save to Phone"}
                      >
                        {isDling ? (
                          <span>{dlingPct}%</span>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCreatePlaylist(true)}
            >
              <IconPlus size={18} /> {language === 'he' ? 'צור פלייליסט' : 'Create Playlist'}
            </button>
            <button
              className="btn btn-secondary"
              style={{
                borderColor: 'rgba(29, 185, 84, 0.4)',
                background: 'rgba(29, 185, 84, 0.08)',
                color: '#10b981',
                fontWeight: 600,
              }}
              onClick={() => setIsImportModalOpen(true)}
            >
              <IconSparkles size={18} /> {language === 'he' ? 'ייבא מ-Spotify / Apple' : 'Import Playlist'}
            </button>
          </div>

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
      <PlaylistImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={() => loadData()}
      />
    </div>
  );
}
