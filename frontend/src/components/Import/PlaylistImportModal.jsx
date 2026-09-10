import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import useI18nStore from '../../stores/i18nStore';
import { triggerHaptic } from '../../utils/haptics';
import { formatDuration } from '../../utils/format';
import {
  IconClose,
  IconCheck,
  IconMusic,
  IconPlay,
  IconDownload,
  IconSparkles,
} from '../common/Icons';

export const IconSpotify = ({ size = 20, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.502 17.31c-.218.358-.682.473-1.04.254-2.853-1.743-6.444-2.138-10.673-1.173-.408.093-.815-.162-.908-.57-.093-.408.162-.815.57-.908 4.636-1.059 8.608-.614 11.797 1.339.358.218.473.682.254 1.058zm1.47-3.262c-.276.448-.86.59-1.308.314-3.266-2.008-8.245-2.59-12.108-1.417-.506.154-1.042-.134-1.196-.64-.154-.506.134-1.042.64-1.196 4.417-1.341 9.907-.69 13.658 1.62.448.276.59.86.314 1.319zm.126-3.398C15.187 8.356 8.745 8.143 5.02 9.274c-.604.184-1.246-.16-1.43-.764-.184-.604.16-1.246.764-1.43 4.283-1.3 11.39-1.054 15.86 1.602.545.324.726 1.033.402 1.578-.324.545-1.033.726-1.558.402z"/>
  </svg>
);

export const IconAppleMusic = ({ size = 20, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.76 1.05-1.82.93-2.88-.91.04-2 .61-2.65 1.37-.57.65-1.06 1.73-.93 2.76 1.02.08 2.02-.49 2.65-1.25z"/>
  </svg>
);

export const IconYouTube = ({ size = 20, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

export const IconTextList = ({ size = 20, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <line x1="8" y1="6" x2="21" y2="6"></line>
    <line x1="8" y1="12" x2="21" y2="12"></line>
    <line x1="8" y1="18" x2="21" y2="18"></line>
    <line x1="3" y1="6" x2="3.01" y2="6"></line>
    <line x1="3" y1="12" x2="3.01" y2="12"></line>
    <line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);

const PLATFORMS = [
  { id: 'spotify', name: 'Spotify', color: '#1DB954', icon: IconSpotify, placeholder: 'https://open.spotify.com/playlist/...' },
  { id: 'apple_music', name: 'Apple Music', color: '#FA243C', icon: IconAppleMusic, placeholder: 'https://music.apple.com/us/playlist/...' },
  { id: 'youtube', name: 'YouTube', color: '#FF0000', icon: IconYouTube, placeholder: 'https://www.youtube.com/playlist?list=...' },
  { id: 'text', name: 'רשימת שירים (טקסט)', color: '#8B5CF6', icon: IconTextList, placeholder: '1. אמן - שם השיר\n2. Artist - Song Title' },
];

export default function PlaylistImportModal({ isOpen, onClose, initialPlatform = 'spotify', onImportSuccess }) {
  const navigate = useNavigate();
  const language = useI18nStore((s) => s.language);
  const isHe = language === 'he';

  const [activePlatform, setActivePlatform] = useState(initialPlatform);
  const [inputValue, setInputValue] = useState('');
  const [customName, setCustomName] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setActivePlatform(initialPlatform || 'spotify');
      setInputValue('');
      setCustomName('');
      setPreviewData(null);
      setErrorMsg(null);
      setSuccessData(null);
      setIsPreviewing(false);
      setIsImporting(false);
    }
  }, [isOpen, initialPlatform]);

  if (!isOpen) return null;

  // Auto-switch platform tab if a recognized URL is pasted
  const handleInputChange = (val) => {
    setInputValue(val);
    setErrorMsg(null);
    if (val.includes('spotify.com') || val.startsWith('spotify:')) {
      setActivePlatform('spotify');
    } else if (val.includes('music.apple.com')) {
      setActivePlatform('apple_music');
    } else if (val.includes('youtube.com') || val.includes('youtu.be')) {
      setActivePlatform('youtube');
    }
  };

  const handlePreview = async () => {
    if (!inputValue.trim()) return;
    setIsPreviewing(true);
    setErrorMsg(null);
    setPreviewData(null);
    try {
      const res = await api.previewImportPlaylist(inputValue.trim(), activePlatform);
      if (res && res.status === 'success') {
        setPreviewData(res);
        setCustomName(res.title || '');
        triggerHaptic('success');
      } else {
        throw new Error(res?.detail || 'Failed to inspect playlist');
      }
    } catch (err) {
      console.error('Import preview error:', err);
      setErrorMsg(err.message || 'לא ניתן היה לקרוא את הפלייליסט. בדוק את הקישור ונסה שוב.');
      triggerHaptic('error');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!inputValue.trim()) return;
    setIsImporting(true);
    setErrorMsg(null);
    try {
      const payload = {
        url: inputValue.trim(),
        name: customName.trim() || previewData?.title || '',
        source: activePlatform,
        link_audio: true,
      };
      const res = await api.importExternalPlaylist(payload);
      if (res && res.status === 'imported') {
        setSuccessData(res);
        triggerHaptic('success');
        if (onImportSuccess) {
          onImportSuccess(res.playlist);
        }
      } else {
        throw new Error(res?.detail || 'Import failed');
      }
    } catch (err) {
      console.error('Import execute error:', err);
      setErrorMsg(err.message || 'שגיאה בייבוא הפלייליסט.');
      triggerHaptic('error');
    } finally {
      setIsImporting(false);
    }
  };

  const currentPlat = PLATFORMS.find((p) => p.id === activePlatform) || PLATFORMS[0];

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="glass-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 20,
          background: 'rgba(24, 24, 30, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          direction: isHe ? 'rtl' : 'ltr',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: `radial-gradient(circle, ${currentPlat.color}33 0%, rgba(0,0,0,0.4) 100%)`,
                border: `1px solid ${currentPlat.color}66`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: currentPlat.color,
              }}
            >
              <IconSparkles size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#fff' }}>
                {isHe ? 'ייבוא פלייליסט ומוזיקה' : 'Import Music & Playlists'}
              </h2>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                {isHe ? 'מ-Spotify, Apple Music, YouTube או טקסט' : 'From Spotify, Apple Music, YouTube or Text'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {/* Success Screen */}
          {successData ? (
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '2px solid #10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  color: '#10b981',
                }}
              >
                <IconCheck size={36} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px', color: '#fff' }}>
                {isHe ? 'הפלייליסט יובא בהצלחה!' : 'Playlist Imported Successfully!'}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 24px' }}>
                {isHe
                  ? `הפלייליסט "${successData.playlist?.name}" עם ${successData.total_songs} שירים מוכן כעת ב-Homeify`
                  : `Playlist "${successData.playlist?.name}" with ${successData.total_songs} songs is ready in Homeify`}
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSuccessData(null);
                    setPreviewData(null);
                    setInputValue('');
                  }}
                  style={{ padding: '10px 20px', borderRadius: 12 }}
                >
                  {isHe ? 'ייבא פלייליסט נוסף' : 'Import Another'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    navigate(`/playlist/${successData.playlist?.id}`);
                  }}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    fontWeight: 700,
                  }}
                >
                  {isHe ? 'פתח פלייליסט באפליקציה' : 'Open Playlist'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Platform Selector Tabs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                  marginBottom: 20,
                }}
              >
                {PLATFORMS.map((plat) => {
                  const Icon = plat.icon;
                  const isActive = activePlatform === plat.id;
                  return (
                    <button
                      key={plat.id}
                      type="button"
                      onClick={() => {
                        setActivePlatform(plat.id);
                        setErrorMsg(null);
                      }}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 12,
                        border: isActive ? `1.5px solid ${plat.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                        background: isActive ? `${plat.color}1f` : 'rgba(255, 255, 255, 0.03)',
                        color: isActive ? plat.color : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: isActive ? 700 : 500,
                        fontSize: '0.75rem',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <Icon size={20} />
                      <span>{plat.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Input Area */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    marginBottom: 8,
                    color: 'var(--text-primary)',
                  }}
                >
                  {activePlatform === 'text'
                    ? (isHe ? 'הדבק רשימת שירים (אמן - שיר בכל שורה):' : 'Paste song list (one Artist - Song per line):')
                    : (isHe ? `קישור מ-${currentPlat.name} (פלייליסט / אלבום):` : `Link from ${currentPlat.name} (Playlist / Album):`)}
                </label>

                {activePlatform === 'text' ? (
                  <textarea
                    className="input"
                    rows={5}
                    placeholder={currentPlat.placeholder}
                    value={inputValue}
                    onChange={(e) => handleInputChange(e.target.value)}
                    disabled={isPreviewing || isImporting}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      fontFamily: 'monospace',
                      fontSize: '0.8125rem',
                      lineHeight: 1.5,
                      borderRadius: 12,
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      type="url"
                      placeholder={currentPlat.placeholder}
                      value={inputValue}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
                      disabled={isPreviewing || isImporting}
                      style={{ flex: 1, borderRadius: 12 }}
                    />
                    <button
                      className="btn btn-secondary"
                      onClick={handlePreview}
                      disabled={isPreviewing || isImporting || !inputValue.trim()}
                      style={{
                        padding: '10px 18px',
                        borderRadius: 12,
                        whiteSpace: 'nowrap',
                        borderColor: currentPlat.color,
                        color: currentPlat.color,
                      }}
                    >
                      {isPreviewing ? (isHe ? 'בודק...' : 'Checking...') : (isHe ? 'בדוק' : 'Preview')}
                    </button>
                  </div>
                )}

                {activePlatform === 'text' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      className="btn btn-secondary"
                      onClick={handlePreview}
                      disabled={isPreviewing || isImporting || !inputValue.trim()}
                      style={{ padding: '8px 16px', borderRadius: 12 }}
                    >
                      {isPreviewing ? (isHe ? 'מעבד...' : 'Processing...') : (isHe ? 'בדוק רשימה' : 'Inspect List')}
                    </button>
                  </div>
                )}
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    fontSize: '0.8125rem',
                    marginBottom: 16,
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Preview Card */}
              {previewData && (
                <div
                  style={{
                    borderRadius: 16,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: 16,
                    marginBottom: 20,
                  }}
                >
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
                    {previewData.cover_url ? (
                      <img
                        src={previewData.cover_url}
                        alt=""
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 12,
                          objectFit: 'cover',
                          boxShadow: `0 4px 20px ${currentPlat.color}44`,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 12,
                          background: `linear-gradient(135deg, ${currentPlat.color} 0%, #111 100%)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                        }}
                      >
                        <IconMusic size={28} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'inline-block',
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: `${currentPlat.color}22`,
                          color: currentPlat.color,
                          marginBottom: 4,
                        }}
                      >
                        {previewData.platform} · {previewData.total_tracks} {isHe ? 'שירים' : 'tracks'}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {previewData.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {previewData.creator || currentPlat.name}
                      </div>
                    </div>
                  </div>

                  {/* Playlist Name Input */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {isHe ? 'שם הפלייליסט ב-Homeify:' : 'Playlist title in Homeify:'}
                    </label>
                    <input
                      className="input"
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      disabled={isImporting}
                      style={{ fontSize: '0.875rem', padding: '8px 12px', borderRadius: 10 }}
                    />
                  </div>

                  {/* Tracks Mini Preview */}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {isHe ? `תצוגה מקדימה של השירים (${previewData.tracks?.length || 0}):` : `Tracklist Preview (${previewData.tracks?.length || 0}):`}
                  </div>
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: 'auto',
                      borderRadius: 10,
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '4px 8px',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    {previewData.tracks?.slice(0, 20).map((t, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 4px',
                          borderBottom: idx < 19 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <span style={{ width: 20, color: 'var(--text-tertiary)', fontSize: '0.75rem', textAlign: 'center' }}>
                          {idx + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#fff', fontWeight: 500 }}>{t.title}</span>
                          <span style={{ color: 'var(--text-secondary)', marginInlineStart: 6, fontSize: '0.75rem' }}>
                            — {t.artist}
                          </span>
                        </div>
                        {t.duration > 0 && (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.6875rem' }}>
                            {formatDuration(t.duration)}
                          </span>
                        )}
                      </div>
                    ))}
                    {previewData.tracks?.length > 20 && (
                      <div style={{ textAlign: 'center', padding: '6px 0', fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                        {isHe ? `+ עוד ${previewData.tracks.length - 20} שירים נוספים` : `+ ${previewData.tracks.length - 20} more tracks`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!successData && (
          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isImporting}
              style={{ padding: '8px 16px', borderRadius: 10 }}
            >
              {isHe ? 'ביטול' : 'Cancel'}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImport}
              disabled={isImporting || isPreviewing || (!previewData && !inputValue.trim())}
              style={{
                padding: '10px 24px',
                borderRadius: 12,
                fontWeight: 700,
                background: currentPlat.color === '#1DB954'
                  ? 'linear-gradient(135deg, #1DB954 0%, #15803d 100%)'
                  : currentPlat.color === '#FA243C'
                  ? 'linear-gradient(135deg, #FA243C 0%, #b91c1c 100%)'
                  : 'linear-gradient(135deg, #4f46e5 0%, #10b981 100%)',
                boxShadow: `0 4px 18px ${currentPlat.color}44`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {isImporting ? (
                <span>{isHe ? 'מייבא ומקשר אודיו...' : 'Importing & Linking Audio...'}</span>
              ) : (
                <>
                  <IconDownload size={18} />
                  <span>{isHe ? 'ייבא פלייליסט ל-Homeify' : 'Import to Homeify'}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
