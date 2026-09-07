import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import usePlayerStore from './stores/playerStore';

// Pages
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import LibraryPage from './pages/LibraryPage';
import PlaylistPage from './pages/PlaylistPage';
import SettingsPage from './pages/SettingsPage';

// Components
import PlayerBar from './components/Player/PlayerBar';
import NowPlaying from './components/Player/NowPlaying';
import BottomNav from './components/common/BottomNav';
import QueueModal from './components/Queue/QueueModal';
import LyricsOverlay from './components/Lyrics/LyricsOverlay';
import EqualizerModal from './components/Equalizer/EqualizerModal';

export default function App() {
  const initAudio = usePlayerStore((s) => s.initAudio);
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);

  useEffect(() => {
    // Initialize global audio element
    initAudio();
  }, [initAudio]);

  return (
    <Router>
      <div className="app-container">
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Persistent Floating Audio Player Bar */}
        <PlayerBar />

        {/* Persistent Bottom Tab Bar */}
        <BottomNav />

        {/* Modals & Fullscreen Overlays */}
        <NowPlaying onOpenEqualizer={() => setIsEqualizerOpen(true)} />
        <QueueModal />
        <LyricsOverlay />
        <EqualizerModal
          isOpen={isEqualizerOpen}
          onClose={() => setIsEqualizerOpen(false)}
        />
      </div>
    </Router>
  );
}
