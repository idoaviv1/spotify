import usePlayerStore from '../../stores/playerStore';
import { IconPlay, IconPause, IconSkipNext } from '../common/Icons';
import { formatDuration } from '../../utils/format';

export default function PlayerBar() {
  const {
    currentSong, isPlaying, currentTime, duration, isLoading,
    togglePlay, playNext, toggleNowPlaying,
  } = usePlayerStore();

  if (!currentSong) return null;

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const coverUrl = currentSong.cover_art_url || currentSong.thumbnail || '';

  return (
    <div className="player-bar" onClick={toggleNowPlaying}>
      {/* Mini progress */}
      <div className="player-progress-mini" style={{ width: `${progressPct}%` }} />

      {/* Cover */}
      {coverUrl ? (
        <img className="player-cover" src={coverUrl} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
      ) : (
        <div className="song-cover-placeholder" style={{ width: 48, height: 48 }}>♪</div>
      )}

      {/* Info */}
      <div className="player-info">
        <div className="player-title">{currentSong.title || 'Unknown'}</div>
        <div className="player-artist">{currentSong.artist || 'Unknown Artist'}</div>
      </div>

      {/* Controls */}
      <div className="player-controls" onClick={(e) => e.stopPropagation()}>
        {isLoading ? (
          <div className="loading-spinner" />
        ) : (
          <>
            <button className="btn-icon" onClick={togglePlay}>
              {isPlaying ? <IconPause size={28} /> : <IconPlay size={28} />}
            </button>
            <button className="btn-icon" onClick={playNext}>
              <IconSkipNext size={24} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
