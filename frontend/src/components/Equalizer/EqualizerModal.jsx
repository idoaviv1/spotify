import { useState, useEffect, useRef } from 'react';
import usePlayerStore from '../../stores/playerStore';
import api from '../../api/client';
import { IconClose, IconEqualizer, IconChevronLeft, IconChevronRight } from '../common/Icons';
import useDragToClose from '../../hooks/useDragToClose';

const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const FREQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

const DEFAULT_PRESETS = [
  { id: 'flat', name: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass_boost', name: 'Bass Boost', bands: [5, 4, 3, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'treble_boost', name: 'Treble Boost', bands: [0, 0, 0, 0, 0, 1, 2, 3, 4, 5] },
  { id: 'vocal_boost', name: 'Vocal', bands: [-2, -2, -1, 1, 3, 3, 2, 1, 0, -1] },
  { id: 'acoustic', name: 'Acoustic', bands: [3, 2, 1, 0, 1, 1, 2, 3, 2, 1] },
  { id: 'electronic', name: 'Electronic', bands: [4, 3, 0, -1, -2, 1, 2, 3, 4, 4] },
  { id: 'rock', name: 'Rock', bands: [4, 3, 1, 0, -1, 0, 1, 3, 4, 4] },
  { id: 'pop', name: 'Pop', bands: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2] },
];

export default function EqualizerModal({ isOpen, onClose }) {
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [activePreset, setActivePreset] = useState('flat');
  const [bands, setBands] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [isEnabled, setIsEnabled] = useState(false);

  // Audio nodes refs
  const audioContextRef = useRef(null);
  const filtersRef = useRef([]);
  const sourceConnectedRef = useRef(false);

  // Presets drag and wheel scroll refs & state
  const presetsRef = useRef(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);

  const [isDragging, setIsDragging] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Load presets from backend if available
  useEffect(() => {
    api
      .getEqualizerPresets()
      .then((res) => {
        if (res.presets && res.presets.length > 0) {
          setPresets(res.presets);
        }
      })
      .catch(() => {});
  }, []);

  // Initialize Web Audio API only on user interaction when EQ is enabled
  const initWebAudioIfNeeded = () => {
    const audio = usePlayerStore.getState()._audio;
    if (!audio) return false;

    if (!audioContextRef.current) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;

        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        usePlayerStore.getState().setAudioContext(ctx);

        if (!sourceConnectedRef.current) {
          const source = ctx.createMediaElementSource(audio);
          const filters = FREQUENCIES.map((freq) => {
            const filter = ctx.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1.4;
            filter.gain.value = 0;
            return filter;
          });

          // Chain filters
          source.connect(filters[0]);
          for (let i = 0; i < filters.length - 1; i++) {
            filters[i].connect(filters[i + 1]);
          }
          filters[filters.length - 1].connect(ctx.destination);

          filtersRef.current = filters;
          sourceConnectedRef.current = true;
        }
      } catch (e) {
        console.warn('Web Audio API equalizer initialization warning:', e);
        return false;
      }
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return true;
  };

  // Apply band gains to Web Audio filters
  const applyGains = (newBands, enabled = isEnabled) => {
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    if (filtersRef.current.length === 10) {
      filtersRef.current.forEach((filter, idx) => {
        filter.gain.value = enabled ? newBands[idx] || 0 : 0;
      });
    }
  };

  const handleBandChange = (index, value) => {
    const num = parseFloat(value);
    const newBands = [...bands];
    newBands[index] = num;
    setBands(newBands);
    setActivePreset('custom');
    if (isEnabled) {
      initWebAudioIfNeeded();
      applyGains(newBands, true);
    }
  };

  const handleSelectPreset = (preset) => {
    setActivePreset(preset.id);
    const newBands = [...preset.bands];
    setBands(newBands);
    if (isEnabled) {
      initWebAudioIfNeeded();
      applyGains(newBands, true);
    }
  };

  const handleToggleEnabled = () => {
    const next = !isEnabled;
    setIsEnabled(next);
    if (next) {
      initWebAudioIfNeeded();
      applyGains(bands, true);
    } else {
      applyGains(bands, false);
    }
  };

  // Helper to check if preset row can scroll left/right
  const updateScrollIndicators = () => {
    const el = presetsRef.current;
    if (!el) return;
    const tolerance = 2;
    setCanScrollLeft(el.scrollLeft > tolerance);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - tolerance);
  };

  const scrollByAmount = (amount) => {
    const el = presetsRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  // Wheel horizontal scrolling on presets
  useEffect(() => {
    if (!isOpen) return;
    const el = presetsRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      // Support vertical wheel and horizontal scroll gestures
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta !== 0) {
        e.preventDefault();
        el.scrollLeft += delta;
        updateScrollIndicators();
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('scroll', updateScrollIndicators, { passive: true });

    const timeout = setTimeout(updateScrollIndicators, 150);
    window.addEventListener('resize', updateScrollIndicators);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('scroll', updateScrollIndicators);
      window.removeEventListener('resize', updateScrollIndicators);
      clearTimeout(timeout);
    };
  }, [isOpen, presets]);

  // Global mousemove and mouseup for drag-to-scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const el = presetsRef.current;
      if (!el) return;

      const deltaX = e.pageX - startXRef.current;
      if (Math.abs(deltaX) > 4) {
        hasDraggedRef.current = true;
      }

      const now = Date.now();
      const dt = now - lastTimeRef.current;
      if (dt > 0) {
        velocityRef.current = (e.pageX - lastXRef.current) / dt;
      }
      lastXRef.current = e.pageX;
      lastTimeRef.current = now;

      el.scrollLeft = scrollLeftStartRef.current - deltaX;
      updateScrollIndicators();
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);

      const el = presetsRef.current;
      if (el && Math.abs(velocityRef.current) > 0.2) {
        const momentum = velocityRef.current * 180;
        el.scrollBy({ left: -momentum, behavior: 'smooth' });
      }

      setTimeout(() => {
        hasDraggedRef.current = false;
        updateScrollIndicators();
      }, 60);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isOpen]);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const el = presetsRef.current;
    if (!el) return;

    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = e.pageX;
    scrollLeftStartRef.current = el.scrollLeft;
    hasDraggedRef.current = false;
    lastXRef.current = e.pageX;
    lastTimeRef.current = Date.now();
    velocityRef.current = 0;
  };

  const handlePresetClick = (e, preset) => {
    if (hasDraggedRef.current) {
      e.stopPropagation();
      return;
    }
    handleSelectPreset(preset);
    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const {
    modalContentRef,
    overlayRef,
    isDragging: isModalDragging,
    handleDragStartProps: modalDragProps,
  } = useDragToClose({ onClose, threshold: 80 });

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={onClose}>
      <div
        ref={modalContentRef}
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Handle Bar - click and drag down to dismiss */}
        <div
          className={`modal-handle-bar ${isModalDragging ? 'is-dragging' : ''}`}
          {...modalDragProps}
          title="גרור למטה לסגירה"
        >
          <div className="modal-handle" />
        </div>

        {/* Header - also supports pulling down from empty area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-lg)',
            cursor: isModalDragging ? 'grabbing' : 'default',
          }}
          onMouseDown={(e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            modalDragProps.onMouseDown(e);
          }}
          onTouchStart={(e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            modalDragProps.onTouchStart(e);
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconEqualizer size={22} style={{ color: 'var(--accent)' }} />
            <h2 className="text-heading">Equalizer</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className={`toggle ${isEnabled ? 'on' : ''}`}
              onClick={handleToggleEnabled}
              title={isEnabled ? 'Disable EQ' : 'Enable EQ'}
            />
            <button className="btn-icon" onClick={onClose}>
              <IconClose size={20} />
            </button>
          </div>
        </div>

        {/* Presets Chips with Wheel & Drag-to-Scroll */}
        <div className="eq-presets-container">
          {canScrollLeft && (
            <button
              className="eq-scroll-btn left"
              onClick={() => scrollByAmount(-160)}
              title="Scroll left"
              aria-label="Scroll left"
            >
              <IconChevronLeft size={16} />
            </button>
          )}

          <div
            ref={presetsRef}
            className={`eq-presets-scroll ${isDragging ? 'is-dragging' : ''}`}
            onMouseDown={handleMouseDown}
          >
            {presets.map((p) => {
              const isSelected = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  className={`eq-preset-chip ${isSelected ? 'active' : ''}`}
                  onClick={(e) => handlePresetClick(e, p)}
                >
                  {p.name}
                </button>
              );
            })}
          </div>

          {canScrollRight && (
            <button
              className="eq-scroll-btn right"
              onClick={() => scrollByAmount(160)}
              title="Scroll right"
              aria-label="Scroll right"
            >
              <IconChevronRight size={16} />
            </button>
          )}
        </div>

        {/* 10-Band Interactive Sliders */}
        <div
          className="glass-card"
          style={{
            padding: '24px 12px 16px',
            opacity: isEnabled ? 1 : 0.4,
            pointerEvents: isEnabled ? 'auto' : 'none',
            transition: 'opacity 0.2s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              height: 180,
              gap: 4,
            }}
          >
            {bands.map((val, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flex: 1,
                  height: '100%',
                }}
              >
                <span
                  style={{
                    fontSize: '0.625rem',
                    color: val > 0 ? 'var(--accent)' : 'var(--text-tertiary)',
                    marginBottom: 4,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {val > 0 ? `+${val}` : val}
                </span>

                <div
                  style={{
                    position: 'relative',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={val}
                    onChange={(e) => handleBandChange(idx, e.target.value)}
                    onWheel={(e) => {
                      e.preventDefault();
                      const step = e.deltaY < 0 ? 1 : -1;
                      const nextVal = Math.min(12, Math.max(-12, val + step));
                      handleBandChange(idx, nextVal);
                    }}
                    style={{
                      writingMode: 'vertical-lr',
                      direction: 'rtl',
                      width: 24,
                      height: 120,
                      accentColor: 'var(--accent)',
                      cursor: 'pointer',
                    }}
                  />
                </div>

                <span
                  style={{
                    fontSize: '0.625rem',
                    color: 'var(--text-secondary)',
                    marginTop: 8,
                  }}
                >
                  {FREQ_LABELS[idx]}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.6875rem',
              color: 'var(--text-muted)',
              marginTop: 12,
              padding: '0 8px',
            }}
          >
            <span>-12 dB</span>
            <span>0 dB</span>
            <span>+12 dB</span>
          </div>
        </div>
      </div>
    </div>
  );
}
