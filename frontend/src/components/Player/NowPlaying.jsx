import { useState, useRef, useCallback, useEffect } from 'react';
import usePlayerStore from '../../stores/playerStore';
import {
  IconPlay, IconPause, IconSkipNext, IconSkipPrev,
  IconChevronDown, IconShuffle, IconRepeat, IconRepeatOne,
  IconQueue, IconLyrics, IconDownload, IconEqualizer, IconOffline
} from '../common/Icons';
import { formatDuration } from '../../utils/format';
import { downloadSongEverywhere, isSongOffline } from '../../utils/storage';

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
  const [scrubTime, setScrubTime] = useState(null);
  const [dragY, setDragY] = useState(0);

  const progressRef = useRef(null);
  const isDraggingScrubber = useRef(false);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const isSwipingDown = useRef(false);

  // Check offline availability on song change
  useEffect(() => {
    if (currentSong) {
      isSongOffline(currentSong).then(setIsOffline).catch(() => {});
    } else {
      setIsOffline(false);
    }
  }, [currentSong]);

  // ─── Live Scrubber (Calculate time on drag, seek ONLY on release) ───
  const calcTimeFromClientX = useCallback((clientX) => {
    if (!progressRef.current || !duration) return 0;
    const rect = progressRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    return pct * duration;
  }, [duration]);

  const handlePointerDown = (e) => {
    e.stopPropagation();
    isDraggingScrubber.current = true;
    const target = calcTimeFromClientX(e.clientX);
    setScrubTime(target);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e) => {
    if (!isDraggingScrubber.current) return;
    const target = calcTimeFromClientX(e.clientX);
    setScrubTime(target);
  };

  const handlePointerUp = (e) => {
    if (!isDraggingScrubber.current) return;
    isDraggingScrubber.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (scrubTime !== null) {
      seek(scrubTime);
    }
    setScrubTime(null);
  };

  // ─── Swipe Down Gesture to Minimize Now Playing ───
  const handleTouchStart = (e) => {
    if (isDraggingScrubber.current) return;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isSwipingDown.current = true;
  };

  const handleTouchMove = (e) => {
    if (!isSwipingDown.current || isDraggingScrubber.current) return;
    touchCurrentY.current = e.touches[0].clientY;
    const delta = touchCurrentY.current - touchStartY.current;
    if (delta > 0) {
      setDragY(delta);
    } else {
      setDragY(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwipingDown.current) return;
    isSwipingDown.current = false;
    const delta = touchCurrentY.current - touchStartY.current;
    if (delta > 80) {
      setNowPlayingOpen(false);
    }
    setDragY(0);
  };

  // ─── Download Everywhere (Server Windows + Phone Offline) ───
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

  if (!currentSong) return null;

  // Compute live progress bar state
  const isScrubbing = scrubTime !== null;
  const activeTime = isScrubbing ? scrubTime : currentTime;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (activeTime / duration) * 100)) : 0;
  const coverUrl = currentSong.cover_art_url || currentSong.thumbnail || '';

  // Dynamic transform style for swipe-down feel
  const transformStyle = isNowPlayingOpen
    ? dragY > 0
      ? `translateY(${dragY}px)`
      : 'translateY(0)'
    : 'translateY(100%)';

  return (
    <div
      className={`now-playing ${isNowPlayingOpen ? 'open' : ''}`}
      style={{
        transform: transformStyle,
        transition: dragY > 0 ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header with Chevron & Pull Indicator */}
      <div className="now-playing-header">
        <button
          className="btn-icon"
          onClick={() => setNowPlayingOpen(false)}
          aria-label="Minimize player"
        >
          <IconChevronDown size={28} />
        </button>
        <div className="now-playing-header-center">
          <div className="now-playing-pull-bar" />
          <span className="text-micro" style={{ marginTop: 4, display: 'block' }}>
            NOW PLAYING
          </span>
        </div>
        <button className="btn-icon" onClick={toggleQueue} aria-label="Queue">
          <IconQueue size={22} />
        </button>
      </div>

      {/* Centered Artwork Container */}
      <div className="now-playing-artwork-container">
        <div className="now-playing-artwork">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={currentSong.title}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="song-cover-placeholder" style={{ width: '100%', height: '100%', fontSize: '4.5rem' }}>
              ♪
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls Group (Anchored comfortably to bottom) */}
      <div className="now-playing-bottom">
        {/* Track Title & Artist */}
        <div className="now-playing-info">
          <div className="now-playing-title">{currentSong.title || 'Unknown'}</div>
          <div className="now-playing-artist">{currentSong.artist || 'Unknown Artist'}</div>
        </div>

        {/* Real Visible Progress Bar with Live Scrubbing */}
        <div
          className={`progress-container ${isScrubbing ? 'is-scrubbing' : ''}`}
          ref={progressRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPct}%` }}>
              <div className="progress-knob" />
            </div>
          </div>
          <div className="progress-times">
            <span>{formatDuration(activeTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="main-controls">
          <button
            className={`control-btn btn-icon ${shuffle ? 'active' : ''}`}
            onClick={toggleShuffle}
            title="Shuffle"
          >
            <IconShuffle size={22} />
          </button>
          <button className="control-btn btn-icon" onClick={playPrev} title="Previous">
            <IconSkipPrev size={32} />
          </button>
          <button className="play-btn-large" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <IconPause size={32} /> : <IconPlay size={32} />}
          </button>
          <button className="control-btn btn-icon" onClick={playNext} title="Next">
            <IconSkipNext size={32} />
          </button>
          <button
            className={`control-btn btn-icon ${repeat !== 'off' ? 'active' : ''}`}
            onClick={toggleRepeat}
            title="Repeat"
          >
            {repeat === 'one' ? <IconRepeatOne size={22} /> : <IconRepeat size={22} />}
          </button>
        </div>

        {/* Secondary Actions */}
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
    </div>
  );
}
