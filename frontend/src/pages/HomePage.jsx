import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import usePlayerStore from '../stores/playerStore';
import useI18nStore from '../stores/i18nStore';
import { formatDuration } from '../utils/format';
import { triggerHaptic } from '../utils/haptics';
import {
  IconMusic,
  IconChevronRight,
  IconDownload,
  IconOffline,
  IconHeart,
  IconPlay,
  IconShuffle,
  IconRefresh,
  IconSparkles,
  IconMore,
} from '../components/common/Icons';
import { downloadSongEverywhere, isSongOffline } from '../utils/storage';

const CATEGORIES = [
  { id: 'all', labelKey: 'cat.all', flag: '✨' },
  { id: 'hebrew', labelKey: 'cat.hebrew', flag: '🇮🇱' },
  { id: 'english', labelKey: 'cat.english', flag: '🇺🇸' },
  { id: 'spanish', labelKey: 'cat.spanish', flag: '🇪🇸' },
  { id: 'fresh', labelKey: 'cat.fresh', flag: '🔥' },
];

function getBadgeClass(lang) {
  switch (lang) {
    case 'hebrew':
      return 'badge-hebrew';
    case 'english':
      return 'badge-english';
    case 'spanish':
      return 'badge-spanish';
    case 'fresh':
      return 'badge-fresh';
    default:
      return 'badge-fresh';
  }
}

// Explore Song Card Component
function ExploreSongCard({ song, isOff, isDling, onPlay, onDownload, onContextMenu }) {
  const badgeClass = getBadgeClass(song.category || song.language);

  return (
    <div
      className="explore-card"
      onClick={() => onPlay(song)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY, song);
      }}
    >
      <div className="explore-cover-wrapper">
        {song.thumbnail || song.cover_art_url ? (
          <img className="explore-cover-img" src={song.thumbnail || song.cover_art_url} alt="" loading="lazy" />
        ) : (
          <div className="song-cover-placeholder" style={{ width: '100%', height: '100%', fontSize: '2rem' }}>♪</div>
        )}

        {/* Category / Language Badge */}
        {song.badge && (
          <span className={`explore-badge ${badgeClass}`}>
            {song.badge}
          </span>
        )}

        {/* Offline Download Button */}
        <button
          className={`explore-download-btn ${isOff ? 'is-offline' : ''}`}
          onClick={(e) => onDownload(e, song)}
          disabled={isDling}
          title={isOff ? 'שמור לאופליין' : 'הורד לאופליין'}
        >
          {isDling ? (
            <div className="loading-spinner" style={{ width: 14, height: 14 }} />
          ) : isOff ? (
            <IconOffline size={16} />
          ) : (
            <IconDownload size={16} />
          )}
        </button>

        {/* Floating Green Play Button Overlay */}
        <div className="explore-play-overlay">
          <IconPlay size={20} />
        </div>
      </div>

      <div className="playlist-name" title={song.title} style={{ fontSize: '0.875rem', fontWeight: 600 }}>
        {song.title}
      </div>
      <div className="playlist-meta" title={song.artist} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        {song.artist}
      </div>

      <div className="explore-card-footer">
        {song.duration > 0 ? (
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
            {formatDuration(song.duration)}
          </span>
        ) : <span />}

        <button
          className="btn-icon"
          style={{ width: 26, height: 26, opacity: 0.7 }}
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e.clientX, e.clientY, song);
          }}
          title="אפשרויות נוספות"
        >
          <IconMore size={16} />
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const t = useI18nStore((s) => s.t);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exploreSections, setExploreSections] = useState([]);
  const [categoryData, setCategoryData] = useState(null);
  const [isExploreLoading, setIsExploreLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pull to Refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const [recentSongs, setRecentSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [topSongs, setTopSongs] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(true);
  const [downloadingRec, setDownloadingRec] = useState({});
  const [recOfflineMap, setRecOfflineMap] = useState({});

  const playSong = usePlayerStore((s) => s.playSong);
  const playList = usePlayerStore((s) => s.playList);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const openContextMenu = usePlayerStore((s) => s.openContextMenu);
  const navigate = useNavigate();

  // Check offline status for a list of songs
  const updateOfflineStatuses = useCallback(async (songsList) => {
    if (!songsList || songsList.length === 0) return;
    try {
      const entries = await Promise.all(
        songsList.map(async (s) => {
          const ytId = s.youtube_id || s.id;
          return ytId ? [ytId, await isSongOffline(s)] : null;
        })
      );
      const validEntries = entries.filter(Boolean);
      if (validEntries.length > 0) {
        setRecOfflineMap((prev) => ({ ...prev, ...Object.fromEntries(validEntries) }));
      }
    } catch (err) {
      console.warn('Failed to check offline status:', err);
    }
  }, []);

  // Fetch Explore data for category
  const loadExploreData = useCallback(async (category, refresh = false) => {
    setIsExploreLoading(true);
    try {
      const data = await api.getExploreRecommendations(category, refresh, 12);
      if (category === 'all') {
        const sections = data.sections || [];
        setExploreSections(sections);
        setCategoryData(null);
        // Gather all songs from all sections to check offline
        const allSongs = sections.flatMap((sec) => sec.songs || []);
        updateOfflineStatuses(allSongs);
      } else {
        setCategoryData(data);
        updateOfflineStatuses(data.songs || []);
      }
    } catch (err) {
      console.error('Failed to load explore recommendations:', err);
    } finally {
      setIsExploreLoading(false);
      setIsRefreshing(false);
    }
  }, [updateOfflineStatuses]);

  // Initial user library data
  const loadBaseData = useCallback(async () => {
    try {
      await api.healthCheck();
      setServerOnline(true);
      const [recent, playlistData, top, recData] = await Promise.all([
        api.getRecentSongs(10).catch(() => ({ songs: [] })),
        api.getPlaylists().catch(() => ({ playlists: [] })),
        api.getTopSongs(10).catch(() => ({ songs: [] })),
        api.getRecommendations(10).catch(() => ({ recommendations: [] })),
      ]);
      setRecentSongs(recent.songs || []);
      setPlaylists(playlistData.playlists || []);
      setTopSongs(top.songs || []);

      const recs = recData.recommendations || [];
      setRecommendations(recs);
      updateOfflineStatuses(recs);
    } catch {
      setServerOnline(false);
    } finally {
      setIsLoading(false);
    }
  }, [updateOfflineStatuses]);

  useEffect(() => {
    loadBaseData();
    loadExploreData('all');
  }, [loadBaseData, loadExploreData]);

  // Handle category tab change
  const handleSelectCategory = (catId) => {
    setSelectedCategory(catId);
    loadExploreData(catId);
  };

  // Handle refresh button
  const handleRefresh = () => {
    setIsRefreshing(true);
    loadExploreData(selectedCategory, true);
  };

  const handleDownloadSong = async (e, song) => {
    e.stopPropagation();
    const ytId = song.youtube_id || song.id;
    if (!ytId || downloadingRec[ytId]) return;

    setDownloadingRec((prev) => ({ ...prev, [ytId]: true }));
    try {
      const saved = await downloadSongEverywhere(song);
      const savedId = saved.id || ytId;
      setRecOfflineMap((prev) => ({
        ...prev,
        [ytId]: true,
        [savedId]: true,
        ...(song.id ? { [song.id]: true } : {}),
        ...(song.youtube_id ? { [song.youtube_id]: true } : {}),
      }));
    } catch (err) {
      console.error('Failed to download song:', err);
    } finally {
      setDownloadingRec((prev) => {
        const next = { ...prev };
        delete next[ytId];
        return next;
      });
    }
  };

  const handlePlaySong = (song) => {
    playSong({
      title: song.title,
      artist: song.artist,
      youtube_url: song.youtube_url || (song.youtube_id ? `https://www.youtube.com/watch?v=${song.youtube_id}` : null),
      youtube_id: song.youtube_id,
      duration: song.duration,
      cover_art_url: song.thumbnail || song.cover_art_url,
      thumbnail: song.thumbnail || song.cover_art_url,
    });
  };

  // Play all songs in the current category
  const handlePlayAllCategory = (songsToPlay, shuffle = false) => {
    if (!songsToPlay || songsToPlay.length === 0) return;
    let list = songsToPlay.map((s) => ({
      title: s.title,
      artist: s.artist,
      youtube_url: s.youtube_url || (s.youtube_id ? `https://www.youtube.com/watch?v=${s.youtube_id}` : null),
      youtube_id: s.youtube_id,
      duration: s.duration,
      cover_art_url: s.thumbnail || s.cover_art_url,
      thumbnail: s.thumbnail || s.cover_art_url,
    }));
    if (shuffle) {
      list = [...list].sort(() => Math.random() - 0.5);
    }
    playList(list, 0);
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return t('greeting.morning');
    if (h >= 12 && h < 17) return t('greeting.afternoon');
    if (h >= 17 && h < 21) return t('greeting.evening');
    return t('greeting.night');
  })();

  // Touch Pull-to-Refresh Handlers
  const handleTouchStart = (e) => {
    if (window.scrollY <= 2) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    } else {
      isPulling.current = false;
    }
  };

  const handleTouchMove = (e) => {
    if (!isPulling.current) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - touchStartY.current;
    if (delta > 0) {
      const dampened = Math.min(85, delta * 0.45);
      setPullDistance(dampened);
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (isPulling.current && pullDistance >= 55) {
      triggerHaptic('impactMedium');
      handleRefresh();
    }
    isPulling.current = false;
    setPullDistance(0);
  };

  return (
    <div
      className="page"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh Indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className={`pull-to-refresh-bar ${isRefreshing ? 'is-refreshing' : ''}`}
          style={{
            height: isRefreshing ? 42 : pullDistance,
            opacity: Math.min(1, pullDistance / 40),
          }}
        >
          <IconRefresh
            size={18}
            style={{
              transform: isRefreshing ? 'none' : `rotate(${pullDistance * 4}deg)`,
              transition: isRefreshing ? 'none' : 'transform 0.1s ease',
            }}
          />
          <span>
            {isRefreshing
              ? t('home.refreshing')
              : pullDistance >= 55
              ? t('home.releaseToRefresh')
              : t('home.pullToRefresh')}
          </span>
        </div>
      )}

      {/* Header with Greeting, Subtitle & Sleek Icon-Only Refresh Button */}
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div className="home-header-row">
          <div className="home-header-titles">
            <h1 className="text-display" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {greeting} 🎵
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              {t('home.subtitle')}
            </p>
          </div>

          <button
            className={`home-header-refresh-btn ${isRefreshing ? 'is-refreshing' : ''}`}
            onClick={() => {
              triggerHaptic('selection');
              handleRefresh();
            }}
            disabled={isRefreshing || isExploreLoading}
            title={t('home.refreshTooltip')}
            aria-label={t('home.refreshTooltip')}
          >
            <IconRefresh size={18} />
          </button>
        </div>

        {!serverOnline && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 16px',
              background: 'rgba(231, 76, 60, 0.15)',
              border: '1px solid rgba(231, 76, 60, 0.3)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
              color: '#e74c3c',
            }}
          >
            {t('home.serverOffline')}
          </div>
        )}
      </div>

      {/* Explore Navigation Bar (Pills Only - clean, full-width, non-blocked) */}
      <div className="explore-nav-bar">
        <div className="explore-pills">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`explore-pill ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => handleSelectCategory(cat.id)}
            >
              <span>{cat.flag}</span>
              <span>{t(cat.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => {
            const widthPct = 55 + ((i * 17) % 35);
            return (
              <div key={i} className="song-item">
                <div className="skeleton skeleton-cover" />
                <div className="song-info" style={{ gap: 6 }}>
                  <div className="skeleton skeleton-text" style={{ width: `${widthPct}%` }} />
                  <div className="skeleton skeleton-text-sm" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* Continue Playing */}
          {currentSong && (
            <div className="section" style={{ marginBottom: 28 }}>
              <div className="section-header">
                <h2 className="section-title">Continue Playing</h2>
              </div>
              <div
                className="glass-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  cursor: 'pointer',
                }}
                onClick={() => usePlayerStore.getState().setNowPlayingOpen(true)}
              >
                {currentSong.cover_art_url || currentSong.thumbnail ? (
                  <img
                    src={currentSong.cover_art_url || currentSong.thumbnail}
                    alt=""
                    style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }}
                  />
                ) : (
                  <div className="song-cover-placeholder" style={{ width: 64, height: 64, fontSize: '1.5rem' }}>♪</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="song-title" style={{ fontSize: '1rem', fontWeight: 600 }}>{currentSong.title}</div>
                  <div className="song-artist">{currentSong.artist}</div>
                </div>
                <div className="playing-bars">
                  <div className="playing-bar" />
                  <div className="playing-bar" />
                  <div className="playing-bar" />
                  <div className="playing-bar" />
                </div>
              </div>
            </div>
          )}

          {/* ═════════ CATEGORY VIEW (hebrew / english / spanish / fresh) ═════════ */}
          {selectedCategory !== 'all' && (
            <div className="section">
              {categoryData && (
                <div className="explore-category-hero">
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                      {categoryData.title}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
                      {categoryData.subtitle}
                    </p>
                  </div>

                  {categoryData.songs && categoryData.songs.length > 0 && (
                    <div className="explore-category-actions">
                      <button
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        onClick={() => handlePlayAllCategory(categoryData.songs, false)}
                      >
                        <IconPlay size={18} />
                        <span>{t('home.playAll')}</span>
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        onClick={() => handlePlayAllCategory(categoryData.songs, true)}
                      >
                        <IconShuffle size={18} />
                        <span>{t('home.shufflePlay')}</span>
                      </button>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginInlineStart: 'auto' }}>
                        {categoryData.songs.length} {t('home.songsToDiscover')}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {isExploreLoading ? (
                <div className="explore-grid">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="explore-card" style={{ opacity: 0.6 }}>
                      <div className="skeleton skeleton-cover" style={{ width: '100%', aspectRatio: '1', borderRadius: 8, marginBottom: 8 }} />
                      <div className="skeleton skeleton-text" style={{ width: '80%', height: 14 }} />
                      <div className="skeleton skeleton-text-sm" style={{ width: '50%', height: 12, marginTop: 4 }} />
                    </div>
                  ))}
                </div>
              ) : categoryData?.songs?.length > 0 ? (
                <div className="explore-grid">
                  {categoryData.songs.map((song) => {
                    const ytId = song.youtube_id || song.id;
                    const isOff = recOfflineMap[ytId];
                    const isDling = downloadingRec[ytId];

                    return (
                      <ExploreSongCard
                        key={ytId}
                        song={song}
                        isOff={isOff}
                        isDling={isDling}
                        onPlay={handlePlaySong}
                        onDownload={handleDownloadSong}
                        onContextMenu={openContextMenu}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <IconMusic size={48} />
                  <p style={{ marginTop: 12 }}>{t('home.noSongs')}</p>
                  <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleRefresh}>
                    {t('home.refreshBtn')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═════════ ALL VIEW: DISCOVERY CAROUSELS PER LANGUAGE ═════════ */}
          {selectedCategory === 'all' && (
            <>
              {isExploreLoading && exploreSections.length === 0 ? (
                <div className="section">
                  <div className="skeleton skeleton-text" style={{ width: '40%', height: 22, marginBottom: 16 }} />
                  <div className="horizontal-scroll">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="explore-card" style={{ opacity: 0.6 }}>
                        <div className="skeleton skeleton-cover" style={{ width: '100%', aspectRatio: '1', borderRadius: 8, marginBottom: 8 }} />
                        <div className="skeleton skeleton-text" style={{ width: '80%', height: 14 }} />
                        <div className="skeleton skeleton-text-sm" style={{ width: '50%', height: 12, marginTop: 4 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                exploreSections.map((sec) => {
                  if (!sec.songs || sec.songs.length === 0) return null;

                  return (
                    <div key={sec.id} className="section" style={{ marginBottom: 32 }}>
                      <div className="section-header" style={{ alignItems: 'flex-end' }}>
                        <div>
                          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {sec.title}
                          </h2>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            {sec.subtitle}
                          </div>
                        </div>
                        <button
                          className="section-link"
                          onClick={() => handleSelectCategory(sec.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          {t('action.seeAll')} <IconChevronRight size={14} />
                        </button>
                      </div>

                      <div className="horizontal-scroll">
                        {sec.songs.map((song) => {
                          const ytId = song.youtube_id || song.id;
                          const isOff = recOfflineMap[ytId];
                          const isDling = downloadingRec[ytId];

                          return (
                            <ExploreSongCard
                              key={ytId}
                              song={song}
                              isOff={isOff}
                              isDling={isDling}
                              onPlay={handlePlaySong}
                              onDownload={handleDownloadSong}
                              onContextMenu={openContextMenu}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Smart Recommendations based on History */}
              {recommendations.length > 0 && (
                <div className="section" style={{ marginBottom: 32 }}>
                  <div className="section-header">
                    <div>
                      <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <IconSparkles size={20} style={{ color: 'var(--accent)' }} />
                        מומלץ עבורך (מבוסס על האזנות קודמות)
                      </h2>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        שירים ואמנים דומים לאלו שהאזנת להם
                      </div>
                    </div>
                  </div>

                  <div className="horizontal-scroll">
                    {recommendations.map((rec) => {
                      const ytId = rec.youtube_id || rec.id;
                      const isOff = recOfflineMap[ytId];
                      const isDling = downloadingRec[ytId];

                      return (
                        <ExploreSongCard
                          key={ytId}
                          song={{ ...rec, badge: 'המלצה אישית', category: 'fresh' }}
                          isOff={isOff}
                          isDling={isDling}
                          onPlay={handlePlaySong}
                          onDownload={handleDownloadSong}
                          onContextMenu={openContextMenu}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Playlists */}
              {playlists.length > 0 && (
                <div className="section" style={{ marginBottom: 32 }}>
                  <div className="section-header">
                    <h2 className="section-title">{t('home.playlists')}</h2>
                    <button className="section-link" onClick={() => navigate('/library')}>
                      {t('action.seeAll')} <IconChevronRight size={14} />
                    </button>
                  </div>
                  <div className="horizontal-scroll">
                    {playlists.map((pl) => (
                      <div key={pl.id} className="playlist-card" onClick={() => navigate(`/playlist/${pl.id}`)}>
                        <div className="playlist-cover">
                          {pl.id === 'favorites' ? (
                            <div
                              style={{
                                width: '100%',
                                height: '100%',
                                background: 'linear-gradient(135deg, #4f46e5 0%, #10b981 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <IconHeart size={36} filled={true} style={{ color: '#fff' }} />
                            </div>
                          ) : pl.cover_image ? (
                            <img src={pl.cover_image} alt={pl.name} />
                          ) : (
                            <IconMusic size={40} style={{ color: 'var(--accent)', opacity: 0.6 }} />
                          )}
                        </div>
                        <div className="playlist-name">{pl.name}</div>
                        <div className="playlist-meta">{pl.song_count} songs</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recently Added */}
              {recentSongs.length > 0 && (
                <div className="section" style={{ marginBottom: 32 }}>
                  <div className="section-header">
                    <h2 className="section-title">{t('home.recentlyAdded')}</h2>
                    <button className="section-link" onClick={() => navigate('/library')}>
                      {t('action.seeAll')} <IconChevronRight size={14} />
                    </button>
                  </div>
                  {recentSongs.slice(0, 6).map((song) => (
                    <div
                      key={song.id}
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => playSong(song)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openContextMenu(e.clientX, e.clientY, song);
                      }}
                    >
                      {song.cover_art_url ? (
                        <img className="song-cover" src={song.cover_art_url} alt="" />
                      ) : (
                        <div className="song-cover-placeholder">♪</div>
                      )}
                      <div className="song-info">
                        <span className="song-title">{song.title}</span>
                        <span className="song-artist">{song.artist}</span>
                      </div>
                      <span className="song-duration">{formatDuration(song.duration)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Most Played */}
              {topSongs.length > 0 && (
                <div className="section" style={{ marginBottom: 32 }}>
                  <div className="section-header">
                    <h2 className="section-title">הכי מושמעים</h2>
                  </div>
                  {topSongs.slice(0, 5).map((song, idx) => (
                    <div
                      key={song.id}
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => playSong(song)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openContextMenu(e.clientX, e.clientY, song);
                      }}
                    >
                      <span
                        style={{
                          width: 28,
                          textAlign: 'center',
                          fontWeight: 700,
                          color: idx < 3 ? 'var(--accent)' : 'var(--text-tertiary)',
                          fontSize: '1rem',
                        }}
                      >
                        {idx + 1}
                      </span>
                      {song.cover_art_url ? (
                        <img className="song-cover" src={song.cover_art_url} alt="" />
                      ) : (
                        <div className="song-cover-placeholder">♪</div>
                      )}
                      <div className="song-info">
                        <span className="song-title">{song.title}</span>
                        <span className="song-artist">{song.artist}</span>
                      </div>
                      <span className="song-duration" style={{ color: 'var(--text-tertiary)' }}>
                        {song.play_count}×
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {recentSongs.length === 0 && playlists.length === 0 && exploreSections.length === 0 && (
            <div className="empty-state">
              <IconMusic size={64} />
              <h3 style={{ marginBottom: 8, color: 'var(--text-secondary)' }}>הספרייה שלך ריקה</h3>
              <p>חפש שירים או בחר אחת מקטגוריות ה-Explore למעלה כדי להתחיל להאזין!</p>
              <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => navigate('/search')}>
                חיפוש מוזיקה
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
