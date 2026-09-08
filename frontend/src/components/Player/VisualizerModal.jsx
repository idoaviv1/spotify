import { useEffect, useRef } from 'react';
import usePlayerStore from '../../stores/playerStore';
import { IconClose } from '../common/Icons';

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
  } = usePlayerStore();

  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);

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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Top Controls Overlay */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'calc(var(--safe-top) + 20px) 24px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {currentSong?.cover_art_url || currentSong?.thumbnail ? (
            <img
              src={currentSong.cover_art_url || currentSong.thumbnail}
              alt=""
              style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', boxShadow: 'var(--shadow-md)' }}
            />
          ) : null}
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
              {currentSong?.title || 'Visualizer'}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.7)' }}>
              {currentSong?.artist || 'Homeify'}
            </div>
          </div>
        </div>

        {/* Style Selector & Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', borderRadius: 20, padding: 3 }}>
            {['bars', 'wave', 'circle'].map((st) => (
              <button
                key={st}
                onClick={() => setVisualizerStyle(st)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 16,
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  background: visualizerStyle === st ? 'var(--accent)' : 'transparent',
                  color: visualizerStyle === st ? '#000000' : 'rgba(255,255,255,0.8)',
                  transition: 'all 0.2s ease',
                }}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            className="btn-icon"
            onClick={toggleVisualizer}
            style={{ width: 40, height: 40, background: 'rgba(0,0,0,0.5)', color: '#ffffff' }}
          >
            <IconClose size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
