import { useState, useEffect, useRef, useCallback } from 'react';
import usePlayerStore from '../../stores/playerStore';
import api from '../../api/client';
import { parseLRC } from '../../utils/format';
import { IconClose, IconLyrics, IconMusic } from '../common/Icons';

export default function LyricsOverlay() {
  const { isLyricsOpen, toggleLyrics, currentSong, currentTime, seek } = usePlayerStore();
  const [lyricsData, setLyricsData] = useState(null);
  const [parsedLines, setParsedLines] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const activeLineRef = useRef(null);
  const containerRef = useRef(null);
  const lyricsSeqRef = useRef(0);

  const loadLyrics = useCallback(async () => {
    if (!currentSong) return;
    const seq = ++lyricsSeqRef.current;
    await Promise.resolve();
    if (seq !== lyricsSeqRef.current) return;
    setIsLoading(true);
    setError(null);
    setLyricsData(null);
    setParsedLines([]);

    try {
      let data = null;
      if (currentSong.id) {
        try {
          data = await api.getLyrics(currentSong.id);
        } catch {
          // fallback to direct
        }
      }

      if (seq !== lyricsSeqRef.current) return;

      if (!data && currentSong.title) {
        data = await api.getLyricsDirect(
          currentSong.title,
          currentSong.artist || '',
          currentSong.album || '',
          currentSong.duration || 0
        );
      }

      if (seq !== lyricsSeqRef.current) return;

      if (data) {
        setLyricsData(data);
        if (data.synced_lyrics) {
          const lines = parseLRC(data.synced_lyrics);
          setParsedLines(lines);
        }
      } else {
        setError('No lyrics found for this song');
      }
    } catch (err) {
      if (seq !== lyricsSeqRef.current) return;
      setError(err.message || 'Could not fetch lyrics');
    } finally {
      if (seq === lyricsSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [currentSong]);

  useEffect(() => {
    if (isLyricsOpen && currentSong) {
      loadLyrics();
    }
  }, [isLyricsOpen, currentSong, loadLyrics]);

  // Find active line index
  let activeIndex = -1;
  if (parsedLines.length > 0) {
    for (let i = 0; i < parsedLines.length; i++) {
      if (currentTime >= parsedLines[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }
  }

  // Auto-scroll active line into view smoothly
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  if (!isLyricsOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        background: 'linear-gradient(180deg, #151520 0%, #0a0a0f 100%)',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        animation: 'fadeIn 0.25s ease',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'calc(var(--safe-top) + 16px) 20px 16px',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {currentSong?.cover_art_url || currentSong?.thumbnail ? (
            <img
              src={currentSong.cover_art_url || currentSong.thumbnail}
              alt=""
              style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }}
            />
          ) : (
            <IconMusic size={24} style={{ color: 'var(--accent)' }} />
          )}
          <div>
            <div
              style={{
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                maxWidth: 220,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {currentSong?.title || 'Lyrics'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              {currentSong?.artist}
            </div>
          </div>
        </div>

        <button
          className="btn-icon"
          onClick={toggleLyrics}
          style={{ width: 36, height: 36, color: 'var(--text-secondary)' }}
        >
          <IconClose size={20} />
        </button>
      </div>

      {/* Lyrics Content */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '40px 24px calc(var(--safe-bottom) + 80px)',
          textAlign: 'center',
          scrollBehavior: 'smooth',
        }}
      >
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              gap: 16,
              color: 'var(--text-tertiary)',
            }}
          >
            <div className="loading-spinner" style={{ width: 36, height: 36 }} />
            <div>Fetching synchronized lyrics...</div>
          </div>
        ) : error || !lyricsData ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              color: 'var(--text-tertiary)',
              gap: 12,
            }}
          >
            <IconLyrics size={48} />
            <div style={{ fontSize: '1rem', fontWeight: 500 }}>No Lyrics Found</div>
            <div className="text-caption">
              {error || 'Lyrics could not be found for this track on LRCLIB.'}
            </div>
          </div>
        ) : parsedLines.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {parsedLines.map((line, idx) => {
              const isActive = idx === activeIndex;
              const isPast = idx < activeIndex;

              return (
                <div
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => seek(line.time)}
                  style={{
                    fontSize: isActive ? '1.5rem' : '1.125rem',
                    fontWeight: isActive ? 800 : 500,
                    color: isActive
                      ? '#ffffff'
                      : isPast
                      ? 'rgba(255, 255, 255, 0.45)'
                      : 'rgba(255, 255, 255, 0.25)',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.25s ease',
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: 8,
                    lineHeight: 1.4,
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.color = isPast
                        ? 'rgba(255, 255, 255, 0.45)'
                        : 'rgba(255, 255, 255, 0.25)';
                  }}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        ) : (
          /* Plain text fallback */
          <div
            style={{
              whiteSpace: 'pre-line',
              fontSize: '1.125rem',
              lineHeight: 2,
              color: 'var(--text-secondary)',
            }}
          >
            {lyricsData.plain_lyrics}
          </div>
        )}
      </div>
    </div>
  );
}
