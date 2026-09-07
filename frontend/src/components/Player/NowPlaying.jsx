import { useState, useRef, useCallback, useEffect } from 'react';
import usePlayerStore from '../../stores/playerStore';
import { IconPlay, IconPause, IconSkipNext, IconSkipPrev, IconChevronDown, IconShuffle, IconRepeat, IconRepeatOne, IconQueue, IconLyrics, IconHeart, IconDownload, IconEqualizer, IconOffline } from '../common/Icons';
import { formatDuration } from '../../utils/format';
import { downloadSongEverywhere, isSongOffline } from '../../utils/storage';
import api from '../../api/client';

export default function NowPlaying({ onOpenEqualizer }) {
  const {
    currentSong, isPlaying, currentTime, duration,
    shuffle, repeat,
    togglePlay, seek, playNext, playPrev,
    toggleShuffle, toggleRepeat,
    isNowPlayingOpen, setNowPlayingOpen,
    toggleLyrics, toggleQueue,
  } = usePlayerStore();

  const [isDownloading, setIsDownloading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const progressRef = useRef(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (currentSong) {
      isSongOffline(currentSong).then(setIsOffline).catch(() => {});
    } else {
      setIsOffline(false);
    }
  }, [currentSong]);

  const updateSeekFromEvent = useCallback((clientX) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    seek(pct * duration);
  }, [duration, seek]);

  const handlePointerDown = (e) => {
    isDraggingRef.current = true;
    updateSeekFromEvent(e.clientX);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e) => {
    if (isDraggingRef.current) {
      updateSeekFromEvent(e.clientX);
    }
  };

  const handlePointerUp = (e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleDownload = async () => {
    if (!currentSong || isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadSongEverywhere(currentSong);
      setIsOffline(true);
    } catch (err) {
      console.error('Download error:', err);
    }
    setIsDownloading(false);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!currentSong) return null;

  const coverUrl = currentSong.cover_art_url || currentSong.thumbnail || '';

  return (
    <div className={`now-playing ${isNowPlayingOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="now-playing-header">
        <button className="btn-icon" onClick={() => setNowPlayingOpen(false)}>
          <IconChevronDown size={28} />
        </button>
        <span className="text-micro">NOW PLAYING</span>
        <button className="btn-icon" onClick={toggleQueue}>
          <IconQueue size={22} />
        </button>
      </div>

      {/* Artwork */}
      <div className="now-playing-artwork">
        {coverUrl ? (
          <img src={coverUrl} alt={currentSong.title} onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '4rem', color: 'rgba(255,255,255,0.1)'
          }}>
            ♪
          </div>
        )}
      </div>

      {/* Song Info */}
      <div className="now-playing-info">
        <div className="now-playing-title">{currentSong.title || 'Unknown'}</div>
        <div className="now-playing-artist">{currentSong.artist || 'Unknown Artist'}</div>
      </div>

      {/* Progress */}
      <div className="progress-container">
        <div
          className="progress-bar"
          ref={progressRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="progress-times">
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Main Controls */}
      <div className="main-controls">
        <button className={`control-btn btn-icon ${shuffle ? 'active' : ''}`} onClick={toggleShuffle}>
          <IconShuffle size={22} />
        </button>
        <button className="control-btn btn-icon" onClick={playPrev}>
          <IconSkipPrev size={32} />
        </button>
        <button className="play-btn-large" onClick={togglePlay}>
          {isPlaying ? <IconPause size={32} /> : <IconPlay size={32} />}
        </button>
        <button className="control-btn btn-icon" onClick={playNext}>
          <IconSkipNext size={32} />
        </button>
        <button className={`control-btn btn-icon ${repeat !== 'off' ? 'active' : ''}`} onClick={toggleRepeat}>
          {repeat === 'one' ? <IconRepeatOne size={22} /> : <IconRepeat size={22} />}
        </button>
      </div>

      {/* Extra Controls */}
      <div className="extra-controls">
        <button className="control-btn btn-icon" onClick={toggleLyrics} title="Lyrics">
          <IconLyrics size={22} />
        </button>
        <button className="control-btn btn-icon" onClick={toggleQueue} title="Queue">
          <IconQueue size={22} />
        </button>
        <button className="control-btn btn-icon" onClick={onOpenEqualizer} title="Equalizer">
          <IconEqualizer size={22} />
        </button>
        <button
          className="control-btn btn-icon"
          onClick={handleDownload}
          disabled={isDownloading}
          title={isOffline ? "זמין אופליין במכשיר (Offline Ready)" : "הורד למכשיר (Save Offline)"}
          style={{ color: isOffline ? '#10b981' : undefined }}
        >
          {isDownloading ? (
            <div className="loading-spinner" style={{ width: 20, height: 20 }} />
          ) : isOffline ? (
            <IconOffline size={22} />
          ) : (
            <IconDownload size={22} />
          )}
        </button>
      </div>
    </div>
  );
}
