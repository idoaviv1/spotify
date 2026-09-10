import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import usePlayerStore from './stores/playerStore';
import useAuthStore from './stores/authStore';
import useI18nStore from './stores/i18nStore';

// Pages
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import LibraryPage from './pages/LibraryPage';
import PlaylistPage from './pages/PlaylistPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';

// Components
import Sidebar from './components/Navigation/Sidebar';
import PlayerBar from './components/Player/PlayerBar';
import NowPlaying from './components/Player/NowPlaying';
import BottomNav from './components/common/BottomNav';
import QueueModal from './components/Queue/QueueModal';
import LyricsOverlay from './components/Lyrics/LyricsOverlay';
import EqualizerModal from './components/Equalizer/EqualizerModal';
import SleepTimerModal from './components/Player/SleepTimerModal';
import VisualizerModal from './components/Player/VisualizerModal';
import ContextMenu from './components/common/ContextMenu';
import QuickSearchModal from './components/Navigation/QuickSearchModal';
import api from './api/client';
import { triggerHaptic } from './utils/haptics';

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const checkAuth = useAuthStore((s) => s.checkAuth);

  const initAudio = usePlayerStore((s) => s.initAudio);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const seek = usePlayerStore((s) => s.seek);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleQuickSearch = usePlayerStore((s) => s.toggleQuickSearch);
  const toggleVisualizer = usePlayerStore((s) => s.toggleVisualizer);
  const toggleLyrics = usePlayerStore((s) => s.toggleLyrics);
  const toggleQueue = usePlayerStore((s) => s.toggleQueue);
  const fetchFavorites = usePlayerStore((s) => s.fetchFavorites);

  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadToast, setUploadToast] = useState('');

  useEffect(() => {
    // Check JWT validity on app start
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // Initialize global audio element
    initAudio();

    // Initialize favorites from server if authenticated
    if (isAuthenticated) {
      fetchFavorites();
    }

    // Initialize saved theme
    const savedTheme = localStorage.getItem('homeify_theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, [initAudio, fetchFavorites, isAuthenticated]);

  const language = useI18nStore((s) => s.language);
  useEffect(() => {
    const isRtl = language === 'he';
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', language);
    document.body.classList.toggle('rtl-mode', isRtl);
    document.body.classList.toggle('ltr-mode', !isRtl);
  }, [language]);

  // Global Keyboard Shortcuts
  const handleKeyDown = useCallback(
    (e) => {
      // Don't trigger shortcuts if user is typing in an input or textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) {
        return;
      }

      // Quick Search shortcut (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        toggleQuickSearch();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        if (e.target === document.body || e.target.getAttribute('role') === 'button') {
          e.preventDefault();
          seek(Math.min(duration, currentTime + 5));
        }
      } else if (e.code === 'ArrowLeft') {
        if (e.target === document.body || e.target.getAttribute('role') === 'button') {
          e.preventDefault();
          seek(Math.max(0, currentTime - 5));
        }
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if (e.key === 'v' || e.key === 'V') {
        toggleVisualizer();
      } else if (e.key === 'l' || e.key === 'L') {
        toggleLyrics();
      } else if (e.key === 'q' || e.key === 'Q') {
        toggleQueue();
      } else if (e.code === 'ArrowUp') {
        if (e.target === document.body) {
          e.preventDefault();
          setVolume(Math.min(1, Math.round((volume + 0.05) * 100) / 100));
        }
      } else if (e.code === 'ArrowDown') {
        if (e.target === document.body) {
          e.preventDefault();
          setVolume(Math.max(0, Math.round((volume - 0.05) * 100) / 100));
        }
      }
    },
    [togglePlay, toggleMute, seek, currentTime, duration, volume, setVolume, toggleQuickSearch, toggleVisualizer, toggleLyrics, toggleQueue]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Global Drag & Drop Audio Upload
  useEffect(() => {
    const handleDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsDraggingFile(true);
      }
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      if (e.relatedTarget === null) {
        setIsDraggingFile(false);
      }
    };

    const handleDrop = async (e) => {
      e.preventDefault();
      setIsDraggingFile(false);
      const files = Array.from(e.dataTransfer?.files || []);
      const audioFiles = files.filter((f) =>
        /\.(mp3|flac|m4a|wav|ogg|aac)$/i.test(f.name)
      );

      if (audioFiles.length === 0) return;

      triggerHaptic('medium');
      setUploadToast(`Uploading ${audioFiles.length} song(s)...`);

      let successCount = 0;
      for (const file of audioFiles) {
        try {
          await api.uploadAudioFile(file);
          successCount++;
        } catch (err) {
          console.error('Failed to upload file:', file.name, err);
        }
      }

      setUploadToast(`✓ Successfully added ${successCount} song(s) to your library!`);
      setTimeout(() => setUploadToast(''), 4000);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  if (!isAuthenticated) {
    return (
      <Router>
        <div className="app-container">
          <div className="ambient-aurora" aria-hidden="true">
            <div className="aurora-blob aurora-blob-1" />
            <div className="aurora-blob aurora-blob-2" />
            <div className="aurora-blob aurora-blob-3" />
          </div>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </Router>
    );
  }

  return (
    <Router>
      <div className="app-container">
        {/* Dynamic Ambient Aurora Background Glow */}
        <div className="ambient-aurora" aria-hidden="true">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-2" />
          <div className="aurora-blob aurora-blob-3" />
        </div>

        {/* Drag & Drop Visual Overlay */}
        {isDraggingFile && (
          <div className="drop-zone-overlay">
            <span style={{ fontSize: '3.5rem' }}>🎵</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
              Drop Audio Files to Add to Library
            </div>
            <div style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
              Supports MP3, FLAC, M4A, WAV, and OGG
            </div>
          </div>
        )}

        {/* Global Upload Toast */}
        {uploadToast && (
          <div
            style={{
              position: 'fixed',
              top: 'calc(var(--safe-top) + 20px)',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(24, 24, 34, 0.95)',
              backdropFilter: 'blur(16px)',
              color: 'var(--accent-hover)',
              padding: '12px 24px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--accent)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 10002,
              fontWeight: 600,
              fontSize: '0.875rem',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            {uploadToast}
          </div>
        )}

        <div className="app-body-layout">
          {/* Desktop Left Sidebar (hidden on mobile via CSS) */}
          <Sidebar />

          {/* Main Routed Page Content */}
          <main className="main-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/playlist/:id" element={<PlaylistPage />} />
              <Route
                path="/settings"
                element={
                  <SettingsPage onOpenEqualizer={() => setIsEqualizerOpen(true)} />
                }
              />
              <Route
                path="/admin"
                element={isAdmin ? <AdminPage /> : <Navigate to="/" replace />}
              />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>

        {/* Persistent Audio Player Bar (Responsive: Desktop & Mobile) */}
        <PlayerBar onOpenEqualizer={() => setIsEqualizerOpen(true)} />

        {/* Persistent Mobile Bottom Navigation (hidden on desktop via CSS) */}
        <BottomNav />

        {/* Modals & Fullscreen Overlays */}
        <NowPlaying onOpenEqualizer={() => setIsEqualizerOpen(true)} />
        <QueueModal />
        <LyricsOverlay />
        <EqualizerModal
          isOpen={isEqualizerOpen}
          onClose={() => setIsEqualizerOpen(false)}
        />
        <SleepTimerModal />
        <VisualizerModal />
        <ContextMenu />
        <QuickSearchModal />
      </div>
    </Router>
  );
}
