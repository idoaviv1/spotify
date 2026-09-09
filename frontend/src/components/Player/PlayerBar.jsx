import { useState, useEffect } from 'react';
import usePlayerStore from '../../stores/playerStore';
import {
  IconPlay,
  IconPause,
  IconSkipNext,
  IconSkipPrev,
  IconShuffle,
  IconRepeat,
  IconRepeatOne,
  IconHeart,
  IconLyrics,
  IconQueue,
  IconEqualizer,
  IconVolume,
  IconVolumeMute,
  IconOffline,
  IconVisualizer,
  IconMoon,
} from '../common/Icons';
import { formatDuration } from '../../utils/format';
import { isSongOffline } from '../../utils/storage';

export default function PlayerBar({ onOpenEqualizer }) {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    queue,
    shuffle,
    repeat,
    isLyricsOpen,
    isQueueOpen,
    isLoading,
    togglePlay,
    playNext,
    playPrev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    toggleNowPlaying,
    toggleLyrics,
    toggleQueue,
    toggleSleepTimer,
    sleepTimerMinutes,
    toggleVisualizer,
    isVisualizerOpen,
    openContextMenu,
    isFavorite,
    toggleFavorite,
  } = usePlayerStore();

  const [isOffline, setIsOffline] = useState(false);
  const [isMoonAnimated, setIsMoonAnimated] = useState(false);
  const currentSongId = currentSong ? String(currentSong.id || currentSong.songId || currentSong.youtube_id || '') : '';
  const isLiked = isFavorite(currentSongId);

  // Check if current song is cached offline
  useEffect(() => {
    let cancelled = false;
    if (currentSong) {
      isSongOffline(currentSong)
        .then((cached) => {
          if (!cancelled) setIsOffline(cached);
        })
        .catch(() => {});
    } else {
      queueMicrotask(() => {
        if (!cancelled) setIsOffline(false);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [currentSong]);

  if (!currentSong) return null;

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const coverUrl = currentSong.cover_data_url || currentSong.cover_art_url || currentSong.thumbnail || '';
  const effectiveVolume = isMuted ? 0 : volume;

  const handleSeekChange = (e) => {
    const val = parseFloat(e.target.value);
    seek(val);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
  };

  return (
    <div className="player-bar-wrapper">
      {/* ─── Mobile Player Bar (hidden on desktop) ─── */}
      <div className="player-bar-mobile" onClick={toggleNowPlaying}>
        {/* Mini progress line */}
        <div className="player-progress-mini" style={{ width: `${progressPct}%` }} />

        {coverUrl ? (
          <img
            className="player-cover"
            src={coverUrl}
            alt=""
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="song-cover-placeholder" style={{ width: 44, height: 44 }}>♪</div>
        )}

        <div className="player-info">
          <div className="player-title">{currentSong.title || 'Unknown'}</div>
          <div className="player-artist">{currentSong.artist || 'Unknown Artist'}</div>
        </div>

        <div className="player-controls" onClick={(e) => e.stopPropagation()}>
          {isLoading ? (
            <div className="loading-spinner" />
          ) : (
            <>
              <button className="btn-icon" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? <IconPause size={28} /> : <IconPlay size={28} />}
              </button>
              <button className="btn-icon" onClick={playNext} aria-label="Next track">
                <IconSkipNext size={24} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Desktop Full Player Bar (hidden on mobile) ─── */}
      <div className="player-bar-desktop">
        {/* Left: Track Info */}
        <div
          className="desktop-player-left desktop-player-track"
          onContextMenu={(e) => {
            e.preventDefault();
            openContextMenu(e.clientX, e.clientY, currentSong);
          }}
        >
          <div className={`track-cover-container ${isPlaying ? 'is-playing' : ''}`} onClick={toggleNowPlaying} title="Expand Album Art">
            {coverUrl ? (
              <img
                className={`desktop-player-cover ${isPlaying ? 'is-playing' : ''}`}
                src={coverUrl}
                alt=""
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="desktop-cover-placeholder">♪</div>
            )}
          </div>

          <div className="desktop-track-meta">
            <span className="desktop-track-title" title={currentSong.title}>
              {currentSong.title || 'Unknown Title'}
            </span>
            <span className="desktop-track-artist" title={currentSong.artist}>
              {currentSong.artist || 'Unknown Artist'}
              {isOffline && (
                <span className="offline-pill" title="Saved offline">
                  <IconOffline size={12} />
                </span>
              )}
            </span>
          </div>

          <button
            className={`heart-btn ${isLiked ? 'liked' : ''}`}
            onClick={() => {
              if (currentSong) {
                toggleFavorite(currentSong);
              }
            }}
            title={isLiked ? 'Remove from Favorites' : 'Save to Favorites'}
          >
            <IconHeart size={18} filled={isLiked} />
          </button>
        </div>

        {/* Center: Playback Controls & Scrubber */}
        <div className="desktop-player-center">
          <div className="desktop-controls-row">
            {/* Shuffle */}
            <button
              className={`btn-icon-control ${shuffle ? 'active' : ''}`}
              onClick={toggleShuffle}
              title={shuffle ? 'Shuffle On' : 'Shuffle Off'}
            >
              <IconShuffle size={18} />
            </button>

            {/* Previous */}
            <button
              className="btn-icon-control"
              onClick={playPrev}
              title="Previous"
            >
              <IconSkipPrev size={20} />
            </button>

            {/* Play/Pause */}
            <button
              className="desktop-play-btn"
              onClick={togglePlay}
              disabled={isLoading}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isLoading ? (
                <div className="loading-spinner-sm" />
              ) : isPlaying ? (
                <IconPause size={22} />
              ) : (
                <IconPlay size={22} style={{ marginLeft: 2 }} />
              )}
            </button>

            {/* Next */}
            <button
              className="btn-icon-control"
              onClick={playNext}
              title="Next"
            >
              <IconSkipNext size={20} />
            </button>

            {/* Repeat */}
            <button
              className={`btn-icon-control ${repeat !== 'off' ? 'active' : ''}`}
              onClick={toggleRepeat}
              title={`Repeat: ${repeat}`}
            >
              {repeat === 'one' ? <IconRepeatOne size={18} /> : <IconRepeat size={18} />}
            </button>
          </div>

          {/* Time & Progress Bar */}
          <div className="desktop-scrubber-row">
            <span className="time-label current-time">{formatDuration(currentTime)}</span>

            <div className="scrubber-track-container">
              <input
                type="range"
                className="desktop-scrubber-input"
                min={0}
                max={duration || 100}
                step={0.5}
                value={currentTime}
                onChange={handleSeekChange}
                style={{
                  '--progress': `${progressPct}%`,
                }}
              />
            </div>

            <span className="time-label total-duration">{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Right: Extra Controls & Volume */}
        <div className="desktop-player-right">
          {/* Lyrics */}
          <button
            className={`btn-icon-right ${isLyricsOpen ? 'active' : ''}`}
            onClick={toggleLyrics}
            title="Lyrics"
          >
            <IconLyrics size={20} />
          </button>

          {/* Queue */}
          <button
            className={`btn-icon-right ${isQueueOpen ? 'active' : ''}`}
            onClick={toggleQueue}
            title="Queue"
          >
            <IconQueue size={20} />
            {queue.length > 0 && (
              <span className="queue-count-badge">{queue.length}</span>
            )}
          </button>

          {/* Equalizer */}
          {onOpenEqualizer && (
            <button
              className="btn-icon-right"
              onClick={onOpenEqualizer}
              title="Equalizer"
            >
              <IconEqualizer size={20} />
            </button>
          )}

          {/* Visualizer */}
          <button
            className={`btn-icon-right ${isVisualizerOpen ? 'active' : ''}`}
            onClick={toggleVisualizer}
            title="Audio Spectrum Visualizer (V)"
          >
            <IconVisualizer size={20} />
          </button>

          {/* Sleep Timer */}
          <button
            className={`btn-icon-right moon-btn ${sleepTimerMinutes ? 'active' : ''} ${isMoonAnimated ? 'animate-pop' : ''}`}
            onClick={() => {
              setIsMoonAnimated(true);
              setTimeout(() => setIsMoonAnimated(false), 450);
              toggleSleepTimer();
            }}
            title={sleepTimerMinutes ? `Sleep Timer: ${sleepTimerMinutes}m` : 'Sleep Timer'}
          >
            <IconMoon size={20} />
          </button>

          {/* Volume Control */}
          <div className="volume-control-wrapper">
            <button
              className={`btn-icon-right volume-btn ${isMuted || effectiveVolume === 0 ? 'is-muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted || effectiveVolume === 0 ? (
                <IconVolumeMute size={20} />
              ) : (
                <IconVolume size={20} />
              )}
            </button>

            <input
              type="range"
              className="volume-slider-input"
              min={0}
              max={1}
              step={0.01}
              value={effectiveVolume}
              onChange={handleVolumeChange}
              title={`Volume: ${Math.round(effectiveVolume * 100)}%`}
              style={{
                '--vol-pct': `${effectiveVolume * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
