import usePlayerStore from '../../stores/playerStore';
import { formatDuration } from '../../utils/format';
import {
  IconClose,
  IconDelete,
  IconPlay,
  IconQueue,
  IconMusic,
} from '../common/Icons';

export default function QueueModal() {
  const {
    isQueueOpen,
    toggleQueue,
    currentSong,
    queue,
    queueIndex,
    playSong,
    removeFromQueue,
    clearQueue,
  } = usePlayerStore();

  if (!isQueueOpen) return null;

  const upNext = queue.slice(queueIndex + 1);

  return (
    <div className="modal-overlay" onClick={toggleQueue}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconQueue size={22} style={{ color: 'var(--accent)' }} />
            <h2 className="text-heading">Playback Queue</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {queue.length > 0 && (
              <button
                className="btn btn-ghost"
                onClick={clearQueue}
                style={{ fontSize: '0.75rem', color: 'var(--danger)', padding: '4px 8px' }}
              >
                Clear
              </button>
            )}
            <button className="btn-icon" onClick={toggleQueue}>
              <IconClose size={20} />
            </button>
          </div>
        </div>

        {/* Now Playing */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <div className="text-micro" style={{ marginBottom: 8 }}>
            NOW PLAYING
          </div>
          {currentSong ? (
            <div
              className="glass-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderLeft: '3px solid var(--accent)',
              }}
            >
              {currentSong.cover_art_url || currentSong.thumbnail ? (
                <img
                  src={currentSong.cover_art_url || currentSong.thumbnail}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }}
                />
              ) : (
                <div className="song-cover-placeholder" style={{ width: 44, height: 44 }}>
                  ♪
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="song-title" style={{ color: 'var(--accent)' }}>
                  {currentSong.title}
                </div>
                <div className="song-artist">{currentSong.artist}</div>
              </div>
              <div className="playing-bars">
                <div className="playing-bar" />
                <div className="playing-bar" />
                <div className="playing-bar" />
              </div>
            </div>
          ) : (
            <div className="text-caption">No track currently playing</div>
          )}
        </div>

        {/* Up Next List */}
        <div>
          <div className="text-micro" style={{ marginBottom: 8 }}>
            NEXT IN QUEUE ({upNext.length})
          </div>

          {upNext.length === 0 ? (
            <div
              style={{
                padding: 'var(--space-xl) 0',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '0.875rem',
              }}
            >
              Queue is empty. Search or pick a playlist to add more music!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {upNext.map((song, i) => {
                const actualIndex = queueIndex + 1 + i;
                return (
                  <div
                    key={`${song.id || song.youtube_url}-${actualIndex}`}
                    className="song-item"
                    onClick={() => playSong(song)}
                  >
                    <div
                      style={{
                        width: 20,
                        fontSize: '0.75rem',
                        color: 'var(--text-tertiary)',
                        textAlign: 'center',
                      }}
                    >
                      {i + 1}
                    </div>

                    {song.cover_art_url || song.thumbnail ? (
                      <img
                        className="song-cover"
                        src={song.cover_art_url || song.thumbnail}
                        alt=""
                      />
                    ) : (
                      <div className="song-cover-placeholder">♪</div>
                    )}

                    <div className="song-info">
                      <div className="song-title">{song.title}</div>
                      <div className="song-artist">{song.artist}</div>
                    </div>

                    <div className="song-duration">{formatDuration(song.duration)}</div>

                    <button
                      className="btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(actualIndex);
                      }}
                      title="Remove from queue"
                      style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}
                    >
                      <IconClose size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
