import { useEffect, useRef, useState } from 'react';
import usePlayerStore from '../../stores/playerStore';
import { useI18nStore } from '../../stores/i18nStore';
import {
  IconClose,
  IconPlay,
  IconPause,
  IconSkipNext,
  IconSkipPrev,
  IconShuffle,
  IconRepeat,
  IconRepeatOne,
  IconHeart,
  IconMusic
} from '../common/Icons';
import { formatDuration } from '../../utils/format';

export default function VisualizerModal() {
  const {
    isVisualizerOpen,
    toggleVisualizer,
    currentSong,
    isPlaying,
    visualizerStyle,
    setVisualizerStyle,
    _analyserNode,
    initWebAudioPipeline,
    currentTime,
    duration,
    seek,
    playNext,
    playPrev,
    togglePlay,
    shuffle,
    toggleShuffle,
    repeat,
    toggleRepeat,
    isFavorite,
    toggleFavorite,
  } = usePlayerStore();

  const t = useI18nStore((s) => s.t);
  const [scrubTime, setScrubTime] = useState(null);

  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  const currentSongId = currentSong ? String(currentSong.id || currentSong.songId || currentSong.youtube_id || '') : '';
  const isLiked = isFavorite(currentSongId);
  const activeTime = scrubTime !== null ? scrubTime : currentTime;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (activeTime / duration) * 100)) : 0;

  useEffect(() => {
    if (!isVisualizerOpen) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const analyser = _analyserNode || initWebAudioPipeline();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Deep dark cosmic background
      const bgGrad = ctx.createRadialGradient(
        width / 2, height / 2, 50,
        width / 2, height / 2, Math.max(width, height) / 1.2
      );
      bgGrad.addColorStop(0, 'rgba(20, 30, 25, 0.95)');
      bgGrad.addColorStop(1, 'rgba(5, 5, 8, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      if (analyser) {
        if (visualizerStyle === 'wave') {
          analyser.getByteTimeDomainData(dataArray);
        } else {
          analyser.getByteFrequencyData(dataArray);
        }
      } else {
        // Fallback simulation when audio is playing but analyser isn't hooked
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = isPlaying ? Math.sin((Date.now() / 200) + i) * 50 + 80 : 0;
        }
      }

      if (visualizerStyle === 'bars') {
        // Glowing frequency bars with gradient
        const barCount = Math.min(bufferLength, 64);
        const barWidth = (width / barCount) * 0.75;
        const spacing = (width / barCount) * 0.25;

        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i] / 255;
          const barHeight = val * (height * 0.65);
          const x = i * (barWidth + spacing) + spacing / 2;
          const y = height - barHeight - 40;

          const grad = ctx.createLinearGradient(0, y, 0, height);
          grad.addColorStop(0, '#1ed760');
          grad.addColorStop(0.5, '#10b981');
          grad.addColorStop(1, 'rgba(16, 185, 129, 0.2)');

          ctx.fillStyle = grad;
          ctx.shadowBlur = 16;
          ctx.shadowColor = 'rgba(29, 185, 84, 0.7)';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
          ctx.fill();
        }
      } else if (visualizerStyle === 'wave') {
        // Oscilloscope / Neon Waveform
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#1ed760';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#10b981';
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
      } else {
        // Radial Circle Pulse
        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.18;
        const barCount = 64;

        // Draw central pulse
        let bassSum = 0;
        for (let i = 0; i < 16; i++) bassSum += dataArray[i];
        const bassLevel = (bassSum / 16) / 255;
        const dynamicRadius = baseRadius + bassLevel * 35;

        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, dynamicRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(29, 185, 84, 0.15)';
        ctx.shadowBlur = 30;
        ctx.shadowColor = 'rgba(29, 185, 84, 0.6)';
        ctx.fill();

        // Draw radial spikes
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2;
          const val = dataArray[i % bufferLength] / 255;
          const spikeLen = val * (baseRadius * 1.2);

          const x1 = centerX + Math.cos(angle) * dynamicRadius;
          const y1 = centerY + Math.sin(angle) * dynamicRadius;
          const x2 = centerX + Math.cos(angle) * (dynamicRadius + spikeLen);
          const y2 = centerY + Math.sin(angle) * (dynamicRadius + spikeLen);

          ctx.strokeStyle = `hsl(${140 + i * 2}, 90%, ${50 + val * 20}%)`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isVisualizerOpen, visualizerStyle, isPlaying, _analyserNode, initWebAudioPipeline]);

  if (!isVisualizerOpen) return null;

  return (
    <div className="visualizer-overlay">
      <canvas ref={canvasRef} className="visualizer-canvas" />

      {/* Top Header Row */}
      <header className="visualizer-header">
        <div className="visualizer-badge">
          <span className="visualizer-badge-dot" />
          <span>{t('player.visualizer')}</span>
        </div>

        <div className="visualizer-top-actions">
          <div className="visualizer-modes">
            {[
              { id: 'bars', label: t('visualizer.bars') },
              { id: 'wave', label: t('visualizer.wave') },
              { id: 'circle', label: t('visualizer.circle') },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`visualizer-mode-btn ${visualizerStyle === mode.id ? 'active' : ''}`}
                onClick={() => setVisualizerStyle(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="visualizer-close-btn"
            onClick={toggleVisualizer}
            title={t('action.close')}
            aria-label={t('action.close')}
          >
            <IconClose size={20} />
          </button>
        </div>
      </header>

      {/* Song Banner: Clean, full width, prominent single-line title & artist */}
      <div className="visualizer-song-banner">
        {currentSong?.cover_art_url || currentSong?.thumbnail ? (
          <img
            src={currentSong.cover_art_url || currentSong.thumbnail}
            alt={currentSong.title || ''}
            className="visualizer-song-cover"
          />
        ) : (
          <div
            className="visualizer-song-cover"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.08)'
            }}
          >
            <IconMusic size={22} style={{ opacity: 0.7 }} />
          </div>
        )}

        <div className="visualizer-song-info">
          <div className="visualizer-song-title" title={currentSong?.title}>
            {currentSong?.title || t('player.visualizer')}
          </div>
          <div className="visualizer-song-artist" title={currentSong?.artist}>
            {currentSong?.artist || 'Homeify'}
          </div>
        </div>

        <button
          type="button"
          className={`heart-btn ${isLiked ? 'liked' : ''}`}
          onClick={() => currentSong && toggleFavorite(currentSong)}
          style={{ flexShrink: 0, padding: 8 }}
          title={isLiked ? 'Remove from Favorites' : 'Save to Favorites'}
          aria-label="Favorite"
        >
          <IconHeart size={20} filled={isLiked} />
        </button>
      </div>

      {/* Spacer to keep middle canvas area unobstructed */}
      <div style={{ flex: 1, minHeight: 40 }} />

      {/* Floating Bottom Playback Dock */}
      <div className="visualizer-bottom-dock">
        {/* Scrubber Row */}
        <div className="visualizer-scrub-row">
          <span className="visualizer-scrub-time">{formatDuration(activeTime)}</span>
          <input
            type="range"
            className="visualizer-scrub-bar"
            min={0}
            max={duration || 100}
            step={0.5}
            value={activeTime}
            onChange={(e) => setScrubTime(Number(e.target.value))}
            onMouseUp={(e) => {
              seek(Number(e.target.value));
              setScrubTime(null);
            }}
            onTouchEnd={() => {
              if (scrubTime !== null) {
                seek(scrubTime);
                setScrubTime(null);
              }
            }}
            style={{
              background: `linear-gradient(to right, var(--accent) ${progressPct}%, rgba(255, 255, 255, 0.18) ${progressPct}%)`
            }}
            aria-label="Seek track position"
          />
          <span className="visualizer-scrub-time">{formatDuration(duration)}</span>
        </div>

        {/* Transport Controls Row */}
        <div className="visualizer-controls-row">
          <button
            type="button"
            className={`visualizer-ctrl-btn ${shuffle ? 'active' : ''}`}
            onClick={toggleShuffle}
            title={t('player.shuffle')}
            aria-label={t('player.shuffle')}
          >
            <IconShuffle size={20} />
          </button>

          <button
            type="button"
            className="visualizer-ctrl-btn"
            onClick={playPrev}
            title="Previous"
            aria-label="Previous"
          >
            <IconSkipPrev size={24} />
          </button>

          <button
            type="button"
            className="visualizer-play-btn"
            onClick={togglePlay}
            title={isPlaying ? t('action.pause') : t('action.play')}
            aria-label={isPlaying ? t('action.pause') : t('action.play')}
          >
            {isPlaying ? (
              <IconPause size={24} />
            ) : (
              <IconPlay size={24} style={{ marginInlineStart: '2px' }} />
            )}
          </button>

          <button
            type="button"
            className="visualizer-ctrl-btn"
            onClick={playNext}
            title="Next"
            aria-label="Next"
          >
            <IconSkipNext size={24} />
          </button>

          <button
            type="button"
            className={`visualizer-ctrl-btn ${repeat !== 'off' ? 'active' : ''}`}
            onClick={toggleRepeat}
            title={`${t('player.repeat')}: ${repeat}`}
            aria-label={`${t('player.repeat')}: ${repeat}`}
          >
            {repeat === 'one' ? <IconRepeatOne size={20} /> : <IconRepeat size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
