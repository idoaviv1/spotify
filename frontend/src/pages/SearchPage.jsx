import { useState, useCallback, useRef } from 'react';
import api from '../api/client';
import usePlayerStore from '../stores/playerStore';
import { formatDuration } from '../utils/format';
import { IconSearch, IconPlay, IconDownload, IconPlus, IconMore, IconOffline } from '../components/common/Icons';
import { downloadSongEverywhere, isSongOffline } from '../utils/storage';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [downloading, setDownloading] = useState({});
  const [offlineMap, setOfflineMap] = useState({});
  const [showMenu, setShowMenu] = useState(null);
  const playSong = usePlayerStore((s) => s.playSong);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const debounceRef = useRef(null);

  const handleSearch = useCallback(async (searchQuery) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const data = await api.searchSongs(searchQuery);
      const items = data.results || [];
      setResults(items);

      // Check offline status for each search result
      const offMap = {};
      for (const item of items) {
        offMap[item.youtube_id] = await isSongOffline(item);
      }
      setOfflineMap(offMap);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    }
    setIsSearching(false);
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(val), 500);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    handleSearch(query);
  };

  const handlePlay = (result) => {
    playSong({
      id: result.song_id || null,
      is_downloaded: result.is_downloaded || false,
      title: result.title,
      artist: result.artist,
      youtube_url: result.youtube_url,
      youtube_id: result.youtube_id,
      duration: result.duration,
      cover_art_url: result.thumbnail,
      thumbnail: result.thumbnail,
    });
    setShowMenu(null);
  };

  const handleDownload = async (result) => {
    const key = result.youtube_id || result.song_id;
    setDownloading(prev => ({ ...prev, [key]: true }));
    setShowMenu(null);
    try {
      const saved = await downloadSongEverywhere(result);
      setOfflineMap(prev => ({ ...prev, [key]: true }));
      setResults(prev => prev.map(item =>
        (item.youtube_id === result.youtube_id || (item.song_id && item.song_id === saved.id))
          ? { ...item, is_downloaded: true, song_id: saved.id }
          : item
      ));
    } catch (err) {
      console.error('Download error:', err);
    }
    setDownloading(prev => ({ ...prev, [key]: false }));
  };

  const handleAddToQueue = (result) => {
    addToQueue({
      title: result.title,
      artist: result.artist,
      youtube_url: result.youtube_url,
      youtube_id: result.youtube_id,
      duration: result.duration,
      cover_art_url: result.thumbnail,
      thumbnail: result.thumbnail,
    });
    setShowMenu(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-display">Search</h1>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSubmit} className="search-input-wrapper">
        <IconSearch size={20} className="search-icon" />
        <input
          className="search-input"
          type="text"
          placeholder="What do you want to listen to?"
          value={query}
          onChange={handleInputChange}
          autoFocus
        />
      </form>

      {/* Loading */}
      {isSearching && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="song-item">
              <div className="skeleton skeleton-cover" />
              <div className="song-info" style={{ gap: 6 }}>
                <div className="skeleton skeleton-text" style={{ width: `${50 + Math.random() * 40}%` }} />
                <div className="skeleton skeleton-text-sm" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!isSearching && results.length > 0 && (
        <div>
          <div className="text-caption" style={{ marginBottom: 12 }}>
            {results.length} results for "{query}"
          </div>
          {results.map((result) => {
            const isActive = currentSong?.youtube_url === result.youtube_url;
            const isDownloadingThis = downloading[result.youtube_id];

            return (
              <div key={result.youtube_id} className={`song-item ${isActive ? 'active' : ''}`}>
                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => handlePlay(result)}>
                  {result.thumbnail ? (
                    <img className="song-cover" src={result.thumbnail} alt=""
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }} />
                  ) : null}
                  <div className="song-cover-placeholder" style={{ display: result.thumbnail ? 'none' : 'flex' }}>♪</div>
                </div>
                <div className="song-info" onClick={() => handlePlay(result)} style={{ cursor: 'pointer' }}>
                  <span className="song-title">{result.title}</span>
                  <span className="song-artist">
                    {result.artist || result.uploader}
                    {offlineMap[result.youtube_id] ? (
                      <span style={{ color: '#10b981', marginLeft: 8, fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        ✓ במכשיר (Offline)
                      </span>
                    ) : result.is_downloaded ? (
                      <span style={{ color: 'var(--accent)', marginLeft: 8, fontSize: '0.75rem', fontWeight: 600 }}>
                        ✓ In Library
                      </span>
                    ) : null}
                  </span>
                </div>
                <span className="song-duration">{formatDuration(result.duration)}</span>

                {/* Action button */}
                <div style={{ position: 'relative' }}>
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setShowMenu(showMenu === result.youtube_id ? null : result.youtube_id); }}>
                    {isDownloadingThis ? (
                      <div className="loading-spinner" style={{ width: 18, height: 18 }} />
                    ) : (
                      <IconMore size={20} />
                    )}
                  </button>

                  {/* Context menu */}
                  {showMenu === result.youtube_id && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowMenu(null)} />
                      <div style={{
                        position: 'absolute', right: 0, top: '100%', zIndex: 51,
                        background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-lg)',
                        minWidth: 200, overflow: 'hidden',
                      }}>
                        <button onClick={() => handlePlay(result)} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                          width: '100%', fontSize: '0.875rem', color: 'var(--text-primary)',
                          background: 'transparent', border: 'none', cursor: 'pointer',
                        }}>
                          <IconPlay size={18} /> Play Now
                        </button>
                        <button onClick={() => handleAddToQueue(result)} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                          width: '100%', fontSize: '0.875rem', color: 'var(--text-primary)',
                          background: 'transparent', border: 'none', cursor: 'pointer',
                        }}>
                          <IconPlus size={18} /> Add to Queue
                        </button>
                        <button onClick={() => handleDownload(result)} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                          width: '100%', fontSize: '0.875rem', color: offlineMap[result.youtube_id] ? '#10b981' : 'var(--text-primary)',
                          background: 'transparent', border: 'none', cursor: 'pointer',
                        }}>
                          <IconDownload size={18} /> {offlineMap[result.youtube_id] ? '✓ במכשיר (Offline)' : 'הורד למכשיר ולשרת'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!isSearching && hasSearched && results.length === 0 && (
        <div className="empty-state">
          <IconSearch size={64} />
          <h3 style={{ color: 'var(--text-secondary)' }}>No results found</h3>
          <p>Try different keywords</p>
        </div>
      )}

      {/* Initial state */}
      {!hasSearched && !isSearching && (
        <div className="empty-state">
          <IconSearch size={64} />
          <h3 style={{ color: 'var(--text-secondary)' }}>Search for any song</h3>
          <p>Find music from around the world</p>
        </div>
      )}
    </div>
  );
}
