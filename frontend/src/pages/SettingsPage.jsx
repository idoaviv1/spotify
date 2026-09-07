import { useState, useEffect } from 'react';
import api, { getConfiguredServerUrl, setServerUrl } from '../api/client';
import {
  getOfflineStorageSize,
  getAllOfflineSongs,
  removeOfflineAudio,
} from '../utils/storage';
import { formatFileSize } from '../utils/format';
import {
  IconSettings,
  IconOffline,
  IconDelete,
  IconEqualizer,
} from '../components/common/Icons';

export default function SettingsPage({ onOpenEqualizer }) {
  const [serverInput, setServerInput] = useState(getConfiguredServerUrl());
  const [testingStatus, setTestingStatus] = useState(null); // 'testing' | 'success' | 'error'
  const [statusMessage, setStatusMessage] = useState('');
  const [storageBytes, setStorageBytes] = useState(0);
  const [offlineSongs, setOfflineSongs] = useState([]);
  const [isClearing, setIsClearing] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    loadOfflineStats();
  }, []);

  async function loadOfflineStats() {
    try {
      const [bytes, songs] = await Promise.all([
        getOfflineStorageSize(),
        getAllOfflineSongs(),
      ]);
      setStorageBytes(bytes);
      setOfflineSongs(songs || []);
    } catch (e) {
      console.error('Failed to load storage info', e);
    }
  }

  async function handleTestConnection() {
    setTestingStatus('testing');
    setStatusMessage('Pinging server...');
    const start = performance.now();
    try {
      // Temporarily set server URL for the test
      const original = getConfiguredServerUrl();
      setServerUrl(serverInput);
      const res = await api.healthCheck();
      const latency = Math.round(performance.now() - start);
      setTestingStatus('success');
      setStatusMessage(`Connected! (${res.service} v${res.version}) - Latency: ${latency}ms`);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setTestingStatus('error');
      setStatusMessage(`Connection failed: ${err.message}`);
    }
  }

  function handleSaveUrl() {
    setServerUrl(serverInput);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
    handleTestConnection();
  }

  async function handleClearStorage() {
    if (!confirm('Delete all offline cached music from this device?')) return;
    setIsClearing(true);
    try {
      for (const song of offlineSongs) {
        if (song.songId) {
          await removeOfflineAudio(song.songId);
        }
      }
      await loadOfflineStats();
    } catch (e) {
      alert('Error clearing storage: ' + e.message);
    }
    setIsClearing(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-display">Settings ⚙️</h1>
        <p className="text-caption" style={{ marginTop: 4 }}>
          Manage your server connection, offline storage, and playback.
        </p>
      </div>

      {/* Tailscale Server Connection */}
      <div className="settings-group">
        <div className="settings-group-title">Tailscale Server Connection</div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                marginBottom: 8,
                display: 'block',
              }}
            >
              Backend Server URL (Tailscale IP & Port)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                type="text"
                value={serverInput}
                onChange={(e) => setServerInput(e.target.value)}
                placeholder="http://100.127.161.16:8686"
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={handleSaveUrl}>
                Save
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 6 }}>
              Default port is 8686. Make sure Tailscale is connected on both this device and your computer.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              className="btn btn-secondary"
              onClick={handleTestConnection}
              disabled={testingStatus === 'testing'}
              style={{ fontSize: '0.8125rem', padding: '8px 16px' }}
            >
              {testingStatus === 'testing' ? 'Testing...' : '⚡ Test Connection'}
            </button>

            {savedSuccess && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--accent)' }}>
                ✓ Server URL Saved!
              </span>
            )}
          </div>

          {statusMessage && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
                background:
                  testingStatus === 'success'
                    ? 'rgba(29, 185, 84, 0.15)'
                    : testingStatus === 'error'
                    ? 'rgba(231, 76, 60, 0.15)'
                    : 'var(--bg-elevated)',
                border: `1px solid ${
                  testingStatus === 'success'
                    ? 'var(--accent)'
                    : testingStatus === 'error'
                    ? 'var(--danger)'
                    : 'var(--glass-border)'
                }`,
                color:
                  testingStatus === 'success'
                    ? 'var(--accent-hover)'
                    : testingStatus === 'error'
                    ? 'var(--danger)'
                    : 'var(--text-secondary)',
              }}
            >
              {statusMessage}
            </div>
          )}
        </div>
      </div>

      {/* Offline Storage */}
      <div className="settings-group">
        <div className="settings-group-title">Device Offline Storage</div>
        <div className="glass-card">
          <div className="settings-item">
            <div>
              <div className="settings-label">Cached Offline Songs</div>
              <div className="text-caption">Available without network connection</div>
            </div>
            <div className="download-badge">
              <IconOffline size={12} /> {offlineSongs.length} songs
            </div>
          </div>

          <div className="settings-item">
            <div>
              <div className="settings-label">Storage Space Used</div>
              <div className="text-caption">IndexedDB Cache</div>
            </div>
            <div className="settings-value">{formatFileSize(storageBytes)}</div>
          </div>

          {offlineSongs.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                onClick={handleClearStorage}
                disabled={isClearing}
                style={{ color: 'var(--danger)', fontSize: '0.8125rem', gap: 6 }}
              >
                <IconDelete size={16} />
                {isClearing ? 'Clearing...' : 'Clear Offline Cache'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Audio & Equalizer */}
      <div className="settings-group">
        <div className="settings-group-title">Audio & Sound</div>
        <div className="glass-card">
          <div
            className="settings-item"
            style={{ cursor: 'pointer' }}
            onClick={onOpenEqualizer}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <IconEqualizer size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <div className="settings-label">Equalizer & Presets</div>
                <div className="text-caption">Bass boost, Vocal, Acoustic & custom bands</div>
              </div>
            </div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '1.2rem' }}>›</span>
          </div>
        </div>
      </div>

      {/* iPhone PWA Setup Guide */}
      <div className="settings-group">
        <div className="settings-group-title">iPhone Installation (PWA)</div>
        <div className="glass-card" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Open this URL in <strong>Safari</strong> on your iPhone over Tailscale.</li>
            <li>Tap the <strong>Share</strong> button (box with an arrow pointing up).</li>
            <li>Scroll down and tap <strong>"Add to Home Screen"</strong> (הוסף למסך הבית).</li>
            <li>Tap <strong>Add</strong>. The SonicLink app icon will appear on your iPhone!</li>
          </ol>
        </div>
      </div>

      {/* About */}
      <div className="settings-group">
        <div className="settings-group-title">About</div>
        <div className="glass-card" style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            SonicLink v1.0.0
          </div>
          <div>Personal Music Cloud over Tailscale VPN Mesh.</div>
          <div style={{ marginTop: 8 }}>Powered by FastAPI, yt-dlp, LRCLIB & React PWA.</div>
        </div>
      </div>
    </div>
  );
}
