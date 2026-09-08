import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import usePlayerStore from '../../stores/playerStore';
import api from '../../api/client';
import { formatDuration } from '../../utils/format';
import { IconSearch, IconClose, IconPlay } from '../common/Icons';

export default function QuickSearchModal() {
  const { isQuickSearchOpen, setQuickSearchOpen, playSong } = usePlayerStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isQuickSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isQuickSearchOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await api.getLibrary(1, 10, 'created_at', 'desc', query.trim());
        setResults(res.songs || []);
      } catch {
        setResults([]);
      }
      setIsLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isQuickSearchOpen) return null;

  const handleFullSearch = () => {
    setQuickSearchOpen(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => setQuickSearchOpen(false)}
      style={{
        zIndex: 10000,
        alignItems: 'flex-start',
        paddingTop: 'clamp(40px, 12vh, 100px)',
      }}
    >
      <div
        className="glass-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '92%',
          maxWidth: 560,
          padding: 0,
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          border: '1px solid var(--glass-border)',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease',
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid var(--glass-border)',
            gap: 12,
          }}
        >
          <IconSearch size={22} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search songs, artists, or press Enter for YouTube..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFullSearch();
              if (e.key === 'Escape') setQuickSearchOpen(false);
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '1.05rem',
              color: '#ffffff',
            }}
          />
          {isLoading && <div className="loading-spinner" style={{ width: 18, height: 18 }} />}
          <button className="btn-icon" onClick={() => setQuickSearchOpen(false)} style={{ width: 32, height: 32 }}>
            <IconClose size={18} />
          </button>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 12px' }}>
          {results.length > 0 ? (
            results.map((song) => (
              <div
                key={song.id}
                className="song-item"
                style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)' }}
                onClick={() => {
                  playSong(song);
                  setQuickSearchOpen(false);
                }}
              >
                {song.cover_art_url ? (
                  <img className="song-cover" src={song.cover_art_url} alt="" style={{ width: 40, height: 40 }} />
                ) : (
                  <div className="song-cover-placeholder" style={{ width: 40, height: 40, fontSize: '1rem' }}>♪</div>
                )}
                <div className="song-info">
                  <div className="song-title" style={{ fontSize: '0.9rem' }}>{song.title}</div>
                  <div className="song-artist" style={{ fontSize: '0.75rem' }}>{song.artist}</div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginRight: 8 }}>
                  {formatDuration(song.duration)}
                </div>
                <IconPlay size={18} style={{ color: 'var(--accent)', opacity: 0.8 }} />
              </div>
            ))
          ) : query.trim() ? (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                No local songs matching "{query}"
              </p>
              <button className="btn btn-primary" onClick={handleFullSearch} style={{ margin: '0 auto', fontSize: '0.8125rem' }}>
                Search YouTube for "{query}" ⏎
              </button>
            </div>
          ) : (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
              Tip: Press <kbd style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>Ctrl</kbd> + <kbd style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>K</kbd> anywhere to search instantly.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
