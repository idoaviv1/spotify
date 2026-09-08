import usePlayerStore from '../../stores/playerStore';
import { IconClose, IconMoon } from '../common/Icons';

export default function SleepTimerModal() {
  const {
    isSleepTimerOpen,
    toggleSleepTimer,
    sleepTimerMinutes,
    sleepTimerRemaining,
    setSleepTimer,
    clearSleepTimer,
  } = usePlayerStore();

  if (!isSleepTimerOpen) return null;

  const formatRemaining = (sec) => {
    if (!sec || sec < 0) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const timerOptions = [
    { label: '15 Minutes', minutes: 15 },
    { label: '30 Minutes', minutes: 30 },
    { label: '45 Minutes', minutes: 45 },
    { label: '60 Minutes (1 Hour)', minutes: 60 },
    { label: 'End of Current Song', minutes: 'end_of_song' },
  ];

  return (
    <div className="modal-overlay" onClick={toggleSleepTimer} style={{ zIndex: 'var(--z-modal)' }}>
      <div
        className="glass-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90%',
          maxWidth: 380,
          padding: 24,
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          animation: 'fadeIn 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconMoon size={22} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Sleep Timer</h3>
          </div>
          <button className="btn-icon" onClick={toggleSleepTimer}>
            <IconClose size={20} />
          </button>
        </div>

        {sleepTimerMinutes && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(29, 185, 84, 0.15)',
              border: '1px solid var(--accent)',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--accent-hover)', fontWeight: 600 }}>
                {sleepTimerMinutes === 'end_of_song'
                  ? 'Turning off after this song'
                  : `Turning off in ${formatRemaining(sleepTimerRemaining)}`}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>Volume will fade smoothly</div>
            </div>
            <button
              className="btn btn-ghost"
              onClick={clearSleepTimer}
              style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--danger)' }}
            >
              Turn Off
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {timerOptions.map((opt) => {
            const isActive = sleepTimerMinutes === opt.minutes;
            return (
              <button
                key={opt.label}
                className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  justifyContent: 'flex-start',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
                onClick={() => setSleepTimer(opt.minutes)}
              >
                {opt.label} {isActive ? '✓' : ''}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
