import PlaylistImportModal, { IconSpotify, IconAppleMusic, IconYouTube, IconTextList } from '../components/Import/PlaylistImportModal';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getConfiguredServerUrl, setServerUrl, TAILSCALE_DEFAULT_URL } from '../api/client';
import usePlayerStore from '../stores/playerStore';
import useAuthStore from '../stores/authStore';
import useI18nStore from '../stores/i18nStore';
import {
  getOfflineStorageSize,
  getAllOfflineSongs,
  removeOfflineAudio,
} from '../utils/storage';
import { formatFileSize } from '../utils/format';
import { triggerHaptic } from '../utils/haptics';
import {
  IconOffline,
  IconDelete,
  IconEqualizer,
  IconCopy,
  IconCheck,
  IconGlobe,
  IconLaptop,
  IconPalette,
  IconUpload,
  IconDownload,
  IconUser,
  IconShield,
  IconLogout,
} from '../components/common/Icons';

export default function SettingsPage({ onOpenEqualizer }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);

  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const t = useI18nStore((s) => s.t);

  const [serverInput, setServerInput] = useState(getConfiguredServerUrl());
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalPlatform, setImportModalPlatform] = useState('spotify');
  const [testingStatus, setTestingStatus] = useState(null); // 'testing' | 'success' | 'error'
  const [statusMessage, setStatusMessage] = useState('');
  const [storageBytes, setStorageBytes] = useState(0);
  const [offlineSongs, setOfflineSongs] = useState([]);
  const [isClearing, setIsClearing] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Pro Audio & Theme Store
  const theme = usePlayerStore((s) => s.theme);
  const setTheme = usePlayerStore((s) => s.setTheme);
  const crossfadeSeconds = usePlayerStore((s) => s.crossfadeSeconds);
  const setCrossfadeSeconds = usePlayerStore((s) => s.setCrossfadeSeconds);
  const volumeNormalization = usePlayerStore((s) => s.volumeNormalization);
  const setVolumeNormalization = usePlayerStore((s) => s.setVolumeNormalization);
  const autoplay = usePlayerStore((s) => s.autoplay);
  const setAutoplay = usePlayerStore((s) => s.setAutoplay);

  // YouTube Playlist Import State
  const [importUrl, setImportUrl] = useState('');
  const [importName, setImportName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null); // { type: 'success'|'error', text: '' }

  // Backup & Restore State
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null); // { type: 'success'|'error', text: '' }
  const restoreFileRef = useRef(null);

  const currentWebUrl =
    typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http')
      ? window.location.origin
      : TAILSCALE_DEFAULT_URL;

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

  function handleCopyWebUrl() {
    const urlToCopy = currentWebUrl.includes('localhost') ? TAILSCALE_DEFAULT_URL : currentWebUrl;
    navigator.clipboard.writeText(urlToCopy).then(() => {
      setCopiedUrl(true);
      triggerHaptic('light');
      setTimeout(() => setCopiedUrl(false), 2500);
    }).catch(() => {
      prompt('Copy this URL to connect remotely:', urlToCopy);
    });
  }

  async function handleClearStorage() {
    if (!confirm(language === 'he' ? 'האם למחוק את כל השירים השמורים באופליין במכשיר זה?' : 'Delete all offline cached music from this device?')) return;
    setIsClearing(true);
    try {
      for (const song of offlineSongs) {
        if (song.songId) {
          await removeOfflineAudio(song.songId);
        }
      }
      await loadOfflineStats();
      triggerHaptic('medium');
    } catch (e) {
      alert('Error clearing storage: ' + e.message);
    }
    setIsClearing(false);
  }

  // Playlist Import Handler
  async function handleImportPlaylist(e) {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      const res = await api.importPlaylist(importUrl.trim(), importName.trim());
      const songCount = res.playlist?.songs?.length || 0;
      setImportStatus({
        type: 'success',
        text: `✓ Successfully imported playlist "${res.playlist?.name || 'Playlist'}" with ${songCount} songs!`,
      });
      setImportUrl('');
      setImportName('');
      triggerHaptic('success');
    } catch (err) {
      setImportStatus({
        type: 'error',
        text: `Failed to import playlist: ${err.message}`,
      });
      triggerHaptic('error');
    } finally {
      setIsImporting(false);
    }
  }

  // Library Backup Export
  async function handleExportBackup() {
    setIsExporting(true);
    setBackupStatus(null);
    try {
      const data = await api.exportBackup();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `homeify_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupStatus({
        type: 'success',
        text: `✓ Backup downloaded successfully (${data.songs?.length || 0} songs, ${data.playlists?.length || 0} playlists).`,
      });
      triggerHaptic('success');
    } catch (err) {
      setBackupStatus({
        type: 'error',
        text: `Backup export failed: ${err.message}`,
      });
      triggerHaptic('error');
    } finally {
      setIsExporting(false);
    }
  }

  // Library Backup Restore
  function handleRestoreFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsRestoring(true);
        setBackupStatus(null);
        const json = JSON.parse(event.target?.result);
        const res = await api.importBackup(json);
        setBackupStatus({
          type: 'success',
          text: `✓ Restored successfully: ${res.restored_songs} songs, ${res.restored_playlists} playlists!`,
        });
        triggerHaptic('success');
      } catch (err) {
        setBackupStatus({
          type: 'error',
          text: `Restore failed: ${err.message}`,
        });
        triggerHaptic('error');
      } finally {
        setIsRestoring(false);
        if (restoreFileRef.current) restoreFileRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }

  const themes = [
    { id: 'default', name: 'Emerald', desc: 'Classic Spotify vibe', accent: '#1db954', bg: '#0a0a0a' },
    { id: 'amoled', name: 'AMOLED Black', desc: 'Pure black for OLED', accent: '#1db954', bg: '#000000' },
    { id: 'cyberpunk', name: 'Cyberpunk', desc: 'Neon magenta & violet', accent: '#d946ef', bg: '#0b0813' },
    { id: 'sunset', name: 'Sunset Glow', desc: 'Warm amber & coffee', accent: '#f59e0b', bg: '#120e0a' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-display">{t('settings.title')} ⚙️</h1>
        <p className="text-caption" style={{ marginTop: 4 }}>
          {language === 'he' 
            ? 'התאם אישית ערכות נושא, שפת ממשק, קרוספייד סאונד, חיבור מרוחק, גיבויים ואחסון.'
            : 'Personalize themes, interface language, audio crossfade, remote access, backups, and storage.'}
        </p>
      </div>

      {/* ─── Interface Language / שפת ממשק ─── */}
      <div className="settings-group">
        <div className="settings-group-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <IconGlobe size={18} style={{ color: 'var(--accent)' }} />
            {t('settings.languageTitle')}
          </span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {t('settings.languageDesc')}
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}>
            <button
              type="button"
              className={`btn ${language === 'he' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setLanguage('he');
                triggerHaptic('selection');
              }}
              style={{
                justifyContent: 'center',
                padding: '14px 18px',
                fontSize: '0.9375rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>🇮🇱</span>
              <span>{t('settings.langHebrew')}</span>
              {language === 'he' && <IconCheck size={18} />}
            </button>

            <button
              type="button"
              className={`btn ${language === 'en' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setLanguage('en');
                triggerHaptic('selection');
              }}
              style={{
                justifyContent: 'center',
                padding: '14px 18px',
                fontSize: '0.9375rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>🇺🇸</span>
              <span>{t('settings.langEnglish')}</span>
              {language === 'en' && <IconCheck size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Account & Session ─── */}
      <div className="settings-group">
        <div className="settings-group-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <IconUser size={18} style={{ color: 'var(--accent)' }} />
            {t('settings.accountTitle')}
          </span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent) 0%, #0d8236 100%)',
                color: '#fff',
                fontSize: '1.25rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(29, 185, 84, 0.3)',
              }}>
                {user?.display_name ? user.display_name.charAt(0).toUpperCase() : (user?.username?.charAt(0).toUpperCase() || 'U')}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {user?.display_name || user?.username || 'משתמש'}
                  <span style={{
                    fontSize: '0.6875rem',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontWeight: 600,
                    background: isAdmin ? 'rgba(245, 158, 11, 0.18)' : 'rgba(56, 189, 248, 0.18)',
                    color: isAdmin ? '#f59e0b' : '#38bdf8',
                    border: `1px solid ${isAdmin ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.4)'}`,
                  }}>
                    {isAdmin ? '👑 מנהל מערכת (Admin)' : '👤 משתמש רגיל'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  @{user?.username} • מחובר באופן מאובטח (JWT)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {isAdmin && (
                <button
                  className="btn btn-primary"
                  onClick={() => navigate('/admin')}
                  style={{ fontSize: '0.8125rem', padding: '8px 16px', gap: 8 }}
                >
                  <IconShield size={16} />
                  מסך ניהול מערכת (Admin)
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (window.confirm('האם ברצונך להתנתק מהחשבון?')) {
                    logout();
                  }
                }}
                style={{ fontSize: '0.8125rem', padding: '8px 16px', gap: 8, color: '#e74c3c', borderColor: 'rgba(231,76,60,0.3)' }}
              >
                <IconLogout size={16} />
                התנתק מהחשבון
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Appearance & Color Themes ─── */}
      <div className="settings-group">
        <div className="settings-group-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <IconPalette size={18} style={{ color: 'var(--accent)' }} />
            Appearance & Themes (ערכות נושא)
          </span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Choose a visual theme tailored for day or night listening, including battery-friendly AMOLED pure black:
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12,
          }}>
            {themes.map((t) => {
              const isActive = (theme || 'default') === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    triggerHaptic('selection');
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: t.bg,
                    border: `2px solid ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                    boxShadow: isActive ? '0 0 12px var(--accent-glow)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: t.accent,
                      border: '2px solid rgba(255,255,255,0.4)',
                    }} />
                    {isActive && (
                      <span style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontWeight: 700 }}>
                        Active ✓
                      </span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#ffffff' }}>{t.name}</div>
                    <div style={{ fontSize: '0.6875rem', color: '#a0a0a0', marginTop: 2 }}>{t.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Audio & Playback Enhancements ─── */}
      <div className="settings-group">
        <div className="settings-group-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <IconEqualizer size={18} style={{ color: 'var(--accent)' }} />
            Audio Engine & Playback Experience
          </span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Equalizer link */}
          <div
            className="settings-item"
            style={{ cursor: 'pointer' }}
            onClick={onOpenEqualizer}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <IconEqualizer size={20} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <div className="settings-label">10-Band Equalizer & Bass Boost</div>
                <div className="text-caption">Acoustic, Electronic, Rock, Vocal Boost presets</div>
              </div>
            </div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '1.2rem' }}>›</span>
          </div>

          <div style={{ height: 1, background: 'var(--glass-border)' }} />

          {/* Crossfade */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div>
                <div className="settings-label">Crossfade Tracks (מעבר חלק בין שירים)</div>
                <div className="text-caption">Smoothly blends the ending track into the next one</div>
              </div>
              <span style={{
                fontWeight: 700,
                fontSize: '0.875rem',
                color: crossfadeSeconds > 0 ? 'var(--accent)' : 'var(--text-tertiary)'
              }}>
                {crossfadeSeconds === 0 ? 'Off' : `${crossfadeSeconds}s`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="12"
              step="1"
              value={crossfadeSeconds}
              onChange={(e) => {
                setCrossfadeSeconds(parseInt(e.target.value, 10));
                triggerHaptic('light');
              }}
              style={{
                width: '100%',
                accentColor: 'var(--accent)',
                height: 6,
                borderRadius: 3,
                cursor: 'pointer',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
              <span>Off</span>
              <span>4s</span>
              <span>8s</span>
              <span>12s</span>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--glass-border)' }} />

          {/* Volume Normalization */}
          <div className="settings-item">
            <div>
              <div className="settings-label">Volume Normalization (נרמול עוצמה)</div>
              <div className="text-caption">
                Balances dynamic range with Web Audio Compressor to avoid sudden volume spikes
              </div>
            </div>
            <div
              className={`toggle ${volumeNormalization ? 'on' : ''}`}
              onClick={() => {
                setVolumeNormalization(!volumeNormalization);
                triggerHaptic('selection');
              }}
              title="Toggle Normalization"
            />
          </div>

          <div style={{ height: 1, background: 'var(--glass-border)' }} />

          {/* Autoplay & Song Radio */}
          <div className="settings-item">
            <div>
              <div className="settings-label">Autoplay & Song Radio (השמעה רציפה של שירים דומים)</div>
              <div className="text-caption">
                Automatically queues similar and related music so the playback never stops
              </div>
            </div>
            <div
              className={`toggle ${autoplay ? 'on' : ''}`}
              onClick={() => {
                setAutoplay(!autoplay);
                triggerHaptic('selection');
              }}
              title="Toggle Autoplay"
            />
          </div>
        </div>
      </div>

      {/* ─── Multi-Platform Playlist Importer (Spotify, Apple Music, YouTube) ─── */}
      <div className="settings-group">
        <div className="settings-group-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <IconDownload size={18} style={{ color: 'var(--accent)' }} />
            {t('settings.importTitle') || 'ייבוא מ-Spotify, Apple Music ו-YouTube'}
          </span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            {t('settings.importDesc') || 'ייבא פלייליסטים, אלבומים ורשימות שירים מחשבונות Spotify ו-Apple Music ישירות ל-Homeify בלחיצה אחת:'}
          </p>

          {/* Quick Platform Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setImportModalPlatform('spotify');
                setIsImportModalOpen(true);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '14px 10px',
                borderRadius: 14,
                background: 'rgba(29, 185, 84, 0.08)',
                border: '1px solid rgba(29, 185, 84, 0.3)',
                color: '#1DB954',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <IconSpotify size={24} />
              <span style={{ fontSize: '0.8125rem' }}>Spotify</span>
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => {
                setImportModalPlatform('apple_music');
                setIsImportModalOpen(true);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '14px 10px',
                borderRadius: 14,
                background: 'rgba(250, 36, 60, 0.08)',
                border: '1px solid rgba(250, 36, 60, 0.3)',
                color: '#FA243C',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <IconAppleMusic size={24} />
              <span style={{ fontSize: '0.8125rem' }}>Apple Music</span>
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => {
                setImportModalPlatform('youtube');
                setIsImportModalOpen(true);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '14px 10px',
                borderRadius: 14,
                background: 'rgba(255, 0, 0, 0.08)',
                border: '1px solid rgba(255, 0, 0, 0.3)',
                color: '#FF4444',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <IconYouTube size={24} />
              <span style={{ fontSize: '0.8125rem' }}>YouTube</span>
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => {
                setImportModalPlatform('text');
                setIsImportModalOpen(true);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '14px 10px',
                borderRadius: 14,
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#A78BFA',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <IconTextList size={24} />
              <span style={{ fontSize: '0.8125rem' }}>{language === 'he' ? 'רשימת שירים' : 'Text List'}</span>
            </button>
          </div>

          {/* Quick Hub Launch Button */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsImportModalOpen(true)}
            style={{
              width: '100%',
              padding: '12px 18px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: 'linear-gradient(135deg, #1DB954 0%, #059669 50%, #4f46e5 100%)',
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
            }}
          >
            <IconDownload size={18} />
            <span>{t('settings.importBtn') || 'פתח מרכז ייבוא (Import Hub)'}</span>
          </button>
        </div>
      </div>

            {/* ─── Library Backup & Restore ─── */}
      <div className="settings-group">
        <div className="settings-group-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <IconUpload size={18} style={{ color: 'var(--accent)' }} />
            Library Backup & Restore (גיבוי ושחזור ספרייה)
          </span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Export your entire music catalog, playlists, and playback history to a portable JSON backup, or restore from a previously saved file.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              className="btn btn-secondary"
              onClick={handleExportBackup}
              disabled={isExporting}
              style={{ fontSize: '0.8125rem', gap: 8, padding: '9px 16px' }}
            >
              <IconDownload size={16} />
              {isExporting ? 'Generating JSON...' : 'Export Backup (JSON)'}
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => restoreFileRef.current?.click()}
              disabled={isRestoring}
              style={{ fontSize: '0.8125rem', gap: 8, padding: '9px 16px' }}
            >
              <IconUpload size={16} />
              {isRestoring ? 'Restoring...' : 'Restore from Backup'}
            </button>

            <input
              ref={restoreFileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleRestoreFileChange}
            />
          </div>

          {backupStatus && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
              background: backupStatus.type === 'success' ? 'rgba(29, 185, 84, 0.15)' : 'rgba(231, 76, 60, 0.15)',
              border: `1px solid ${backupStatus.type === 'success' ? 'var(--accent)' : 'var(--danger)'}`,
              color: backupStatus.type === 'success' ? 'var(--accent-hover)' : 'var(--danger)',
            }}>
              {backupStatus.text}
            </div>
          )}
        </div>
      </div>

      {/* ─── Remote Web Access ─── */}
      <div className="settings-group">
        <div className="settings-group-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IconGlobe size={18} style={{ color: 'var(--accent)' }} />
            Remote Web Access (דפדפן וחיבור מרחוק)
          </span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            You can access Homeify directly from any computer, laptop, tablet, or phone connected to your Tailscale network:
          </p>

          <div className="remote-url-box">
            <div className="remote-url-text">
              <span className="remote-url-badge">Tailscale URL</span>
              <code>{TAILSCALE_DEFAULT_URL}</code>
            </div>
            <button
              className={`btn ${copiedUrl ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleCopyWebUrl}
              style={{ padding: '8px 16px', fontSize: '0.8125rem' }}
            >
              {copiedUrl ? (
                <>
                  <IconCheck size={16} /> Copied!
                </>
              ) : (
                <>
                  <IconCopy size={16} /> Copy URL
                </>
              )}
            </button>
          </div>

          <div className="web-tips-grid">
            <div className="web-tip-card">
              <div className="web-tip-title">
                <IconLaptop size={16} style={{ color: 'var(--accent)' }} /> Desktop Browser
              </div>
              <p className="web-tip-desc">
                Open in Chrome, Firefox, or Edge. You can also click <strong>Install Homeify</strong> from the browser address bar to run it as a standalone desktop app!
              </p>
            </div>
            <div className="web-tip-card">
              <div className="web-tip-title">
                <IconGlobe size={16} style={{ color: 'var(--accent)' }} /> Tailscale Network
              </div>
              <p className="web-tip-desc">
                Ensure Tailscale is running on both your server and your remote device. No port forwarding or public router setup required.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tailscale Server Connection ─── */}
      <div className="settings-group">
        <div className="settings-group-title">Server Connection Config</div>
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
              Backend API Server URL
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
              Default port is 8686. Make sure Homeify server is running.
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

      {/* ─── Offline Storage ─── */}
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

      {/* ─── Mobile & iPhone Installation ─── */}
      <div className="settings-group">
        <div className="settings-group-title">Mobile Installation (iPhone / Android)</div>
        <div className="glass-card" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Open the Tailscale URL in <strong>Safari</strong> (iOS) or <strong>Chrome</strong> (Android).</li>
            <li>On iPhone: tap the <strong>Share</strong> button and tap <strong>"Add to Home Screen"</strong> (הוסף למסך הבית).</li>
            <li>On Android: tap the <strong>⋮</strong> menu and tap <strong>"Install app"</strong>.</li>
            <li>Homeify will launch in full-screen standalone mode with background audio support!</li>
          </ol>
        </div>
      </div>

      {/* ─── About ─── */}
      <div className="settings-group">
        <div className="settings-group-title">About</div>
        <div className="glass-card" style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            Homeify Pro v1.2.0
          </div>
          <div>Personal Music Cloud & Web Player over Tailscale VPN Mesh.</div>
          <div style={{ marginTop: 8 }}>Powered by FastAPI, yt-dlp, LRCLIB, React, Web Audio & Capacitor.</div>
        </div>
      </div>
    </div>
  );
}
