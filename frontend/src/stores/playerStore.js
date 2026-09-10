/**
 * Player Store - Zustand state management for audio playback.
 * Manages the current track, queue, playback state, and audio element.
 */
import { create } from 'zustand';
import api from '../api/client';
import { getOfflineAudio } from '../utils/storage';
import { triggerHaptic } from '../utils/haptics';

let initialFavorites = [];
try {
  initialFavorites = JSON.parse(localStorage.getItem('homeify_favorites') || '[]');
} catch {}

const usePlayerStore = create((set, get) => ({
  // Current track
  currentSong: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,

  // Favorites / Liked Songs
  favoriteIds: new Set(initialFavorites.map(String)),
  isFavoritesLoaded: false,

  // Queue & Autoplay
  queue: [],
  queueIndex: -1,
  shuffle: false,
  repeat: 'off', // 'off', 'all', 'one'
  autoplay: localStorage.getItem('homeify_autoplay') !== 'false', // Infinite queue similar tracks
  _isFetchingRadio: false,
  _lastRadioSeed: null,
  setAutoplay: (enabled) => {
    localStorage.setItem('homeify_autoplay', String(enabled));
    set({ autoplay: enabled });
  },
  toggleAutoplay: () => {
    const next = !get().autoplay;
    get().setAutoplay(next);
  },

  // Pro Audio Settings
  crossfadeSeconds: parseInt(localStorage.getItem('homeify_crossfade') || '0', 10),
  volumeNormalization: localStorage.getItem('homeify_normalization') === 'true',
  theme: localStorage.getItem('homeify_theme') || 'default',
  _preloadedId: null,

  // Sleep Timer
  sleepTimerMinutes: null,
  sleepTimerRemaining: null,
  _sleepInterval: null,
  isSleepTimerOpen: false,

  // Visualizer & Quick Search & Context Menu UI State
  isNowPlayingOpen: false,
  isLyricsOpen: false,
  isQueueOpen: false,
  isVisualizerOpen: false,
  visualizerStyle: localStorage.getItem('homeify_vis_style') || 'bars',
  isQuickSearchOpen: false,
  contextMenu: { isOpen: false, x: 0, y: 0, song: null },
  isLoading: false,

  // Audio element reference & Web Audio context
  _audio: null,
  _audioContext: null,
  _sourceNode: null,
  _analyserNode: null,
  _compressorNode: null,
  _gainNode: null,
  _currentBlobUrl: null,
  setAudioContext: (ctx) => set({ _audioContext: ctx }),

  // ─── Initialize Audio & Web Audio Pipeline ───
  initAudio: () => {
    if (get()._audio) return;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';

    audio.addEventListener('timeupdate', () => {
      const curTime = audio.currentTime;
      set({ currentTime: curTime });

      // Gapless Preloading: 15 seconds before track ends, preload the next track
      const dur = audio.duration || 0;
      if (dur > 20 && dur - curTime <= 15) {
        get().preloadNextTrack();

        // Autoplay proactive fetch: if approaching queue end, fetch more similar tracks
        const { autoplay, queue, queueIndex, currentSong } = get();
        if (autoplay && currentSong && queueIndex >= queue.length - 2) {
          get().fetchAndAppendRadio(currentSong);
        }
      }
    });

    audio.addEventListener('durationchange', () => {
      set({ duration: audio.duration || 0 });
    });

    audio.addEventListener('ended', () => {
      const { sleepTimerMinutes } = get();
      if (sleepTimerMinutes === 'end_of_song') {
        get().clearSleepTimer();
        audio.pause();
        set({ isPlaying: false });
        return;
      }
      get().playNext();
    });

    audio.addEventListener('play', () => set({ isPlaying: true }));
    audio.addEventListener('pause', () => set({ isPlaying: false }));

    audio.addEventListener('error', (e) => {
      const err = audio.error;
      console.error('Audio playback error code:', err?.code, 'message:', err?.message, 'current src:', audio.src, e);
      set({ isLoading: false, isPlaying: false });
    });

    audio.addEventListener('canplay', () => {
      set({ isLoading: false });
    });

    // Restore volume
    const savedVolume = localStorage.getItem('homeify_volume') || localStorage.getItem('soniclink_volume');
    if (savedVolume) {
      audio.volume = parseFloat(savedVolume);
      set({ volume: parseFloat(savedVolume) });
    }

    set({ _audio: audio });
  },

  // Ensure Web Audio Pipeline (EQ, DynamicsCompressor, Analyser, Gain) is active
  initWebAudioPipeline: () => {
    const { _audio, _audioContext, _analyserNode } = get();
    if (!_audio) return null;
    if (_analyserNode && _audioContext) return _analyserNode;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = _audioContext || new AudioCtx();
      if (!_audioContext) {
        set({ _audioContext: ctx });
      }

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaElementSource(_audio);

      // Dynamics Compressor (Volume Normalization)
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, ctx.currentTime);
      compressor.knee.setValueAtTime(30, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      // Fast Fourier Transform Analyser (for Visualizer)
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;

      // Gain Node (for crossfade and sleep timer fade)
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(1, ctx.currentTime);

      // Pipeline: source -> compressor -> analyser -> gainNode -> destination
      const isNorm = get().volumeNormalization;
      if (isNorm) {
        source.connect(compressor);
        compressor.connect(analyser);
      } else {
        source.connect(analyser);
      }
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      set({
        _sourceNode: source,
        _analyserNode: analyser,
        _compressorNode: compressor,
        _gainNode: gainNode,
      });

      return analyser;
    } catch (e) {
      console.warn('Web Audio pipeline init warning:', e);
      return null;
    }
  },

  // ─── Play a Song ───
  playSong: async (song, addToQueue = false) => {
    const { _audio, _audioContext, queue, queueIndex } = get();
    if (!_audio || !song) return;

    // Ensure audio context is resumed on user gesture if one exists
    if (_audioContext && _audioContext.state === 'suspended') {
      _audioContext.resume().catch(() => {});
    }

    set({ isLoading: true });

    try {
      // Revoke previous object URL to prevent memory leaks
      const { _currentBlobUrl } = get();
      if (_currentBlobUrl) {
        URL.revokeObjectURL(_currentBlobUrl);
        set({ _currentBlobUrl: null });
      }

      let audioSrc;

      // 1. PRIORITY 1: Check if song is saved locally on device (works 100% offline!)
      const offlineBlob = await getOfflineAudio(song);
      if (offlineBlob) {
        const blobUrl = URL.createObjectURL(offlineBlob);
        audioSrc = blobUrl;
        set({ _currentBlobUrl: blobUrl });
        console.log('🎵 Playing from device local offline storage:', song.title);
      }

      // 2. If downloaded on server library, stream local file directly
      if (!audioSrc && song.id && song.is_downloaded) {
        audioSrc = api.getStreamUrl(song.id);
      }

      // 3. If it has a YouTube URL or ID, stream via server proxy (bypasses 403 & unsupported codecs)
      let ytUrl = song.youtube_url || (song.youtube_id ? `https://www.youtube.com/watch?v=${song.youtube_id}` : null);

      // On-demand audio stream resolution if track was imported from Spotify/Apple Music
      if (!audioSrc && !ytUrl && song.id) {
        try {
          const res = await api.resolveSongTrack(song.id);
          if (res?.song?.youtube_url || res?.song?.youtube_id) {
            song.youtube_url = res.song.youtube_url;
            song.youtube_id = res.song.youtube_id;
            ytUrl = song.youtube_url || `https://www.youtube.com/watch?v=${song.youtube_id}`;
          }
        } catch (resolveErr) {
          console.warn('On-demand stream resolution failed:', resolveErr);
        }
      }

      if (!audioSrc && ytUrl) {
        audioSrc = api.getYoutubeStreamUrl(ytUrl);
      }

      if (!audioSrc) {
        console.warn('No audio source could be determined for song:', song);
        set({ isLoading: false });
        return;
      }

      _audio.src = audioSrc;
      _audio.load();
      try {
        await _audio.play();
      } catch (playErr) {
        console.warn('Audio play() error:', playErr);
      }

      // Smooth crossfade volume fade-in if crossfade is enabled
      const { crossfadeSeconds } = get();
      if (crossfadeSeconds > 0 && _audio) {
        const fadeDuration = Math.min(crossfadeSeconds, 2.0);
        _audio.volume = 0;
        const startFade = performance.now();
        const fadeInterval = setInterval(() => {
          const { _audio: curAudio, volume: curTarget } = get();
          if (!curAudio) {
            clearInterval(fadeInterval);
            return;
          }
          const elapsed = (performance.now() - startFade) / 1000;
          const progress = Math.min(1, elapsed / fadeDuration);
          curAudio.volume = progress * curTarget;
          if (progress >= 1) {
            clearInterval(fadeInterval);
            curAudio.volume = curTarget;
          }
        }, 50);
      }

      // Update MediaSession for lock screen (supports offline cover_data_url)
      if ('mediaSession' in navigator) {
        const artworkUrl = song.cover_data_url || song.cover_art_url || song.thumbnail;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title || 'Unknown',
          artist: song.artist || 'Unknown Artist',
          album: song.album || '',
          artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
        });

        navigator.mediaSession.setActionHandler('play', () => {
          const { _audio, isPlaying } = get();
          if (_audio && !isPlaying) _audio.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          const { _audio, isPlaying } = get();
          if (_audio && isPlaying) _audio.pause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => get().playPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => get().playNext());
        try {
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) get().seek(details.seekTime);
          });
        } catch {}
      }

      // Update queue
      let newQueue = [...queue];
      let newIndex = queueIndex;

      if (addToQueue) {
        newQueue.push(song);
        newIndex = newQueue.length - 1;
      } else {
        // Replace current position in queue
        const existingIdx = newQueue.findIndex(s =>
          (s.id && s.id === song.id) || (s.youtube_url && s.youtube_url === song.youtube_url)
        );
        if (existingIdx >= 0) {
          newIndex = existingIdx;
        } else {
          newQueue.push(song);
          newIndex = newQueue.length - 1;
        }
      }

      set({
        currentSong: song,
        queue: newQueue,
        queueIndex: newIndex,
        isLoading: false,
      });

      // Infinite Autoplay: automatically queue similar tracks so music never stops!
      if (get().autoplay) {
        if (!addToQueue && (newQueue.length <= 1 || newQueue.length - newIndex <= 2)) {
          get().fetchAndAppendRadio(song);
        }
      }

      // Record play in history (non-blocking)
      if (song.id) {
        api.recordPlay(song.id, 0).catch(() => { });
      }
    } catch (err) {
      console.error('Play error:', err);
      set({ isLoading: false });
    }
  },

  // ─── Play a list of songs ───
  playList: (songs, startIndex = 0) => {
    set({ queue: songs, queueIndex: startIndex });
    if (songs[startIndex]) {
      get().playSong(songs[startIndex]);
    }
  },

  // ─── Controls ───
  togglePlay: () => {
    const { _audio, _audioContext, isPlaying } = get();
    if (!_audio) return;
    if (_audioContext && _audioContext.state === 'suspended') {
      _audioContext.resume().catch(() => {});
    }
    if (isPlaying) {
      _audio.pause();
    } else {
      _audio.play().catch((err) => console.warn('togglePlay error:', err));
    }
  },

  seek: (time) => {
    const { _audio } = get();
    if (_audio) {
      _audio.currentTime = time;
      set({ currentTime: time });
    }
  },

  setVolume: (vol) => {
    const { _audio } = get();
    if (_audio) {
      _audio.volume = vol;
      localStorage.setItem('homeify_volume', vol.toString());
      set({ volume: vol, isMuted: vol === 0 });
    }
  },

  toggleMute: () => {
    const { _audio, isMuted, volume } = get();
    if (!_audio) return;
    if (isMuted) {
      _audio.volume = volume || 0.5;
      set({ isMuted: false });
    } else {
      _audio.volume = 0;
      set({ isMuted: true });
    }
  },

  // ─── Queue Navigation ───
  playNext: () => {
    const { queue, queueIndex, repeat, shuffle } = get();
    if (queue.length === 0) return;

    if (repeat === 'one') {
      const { _audio } = get();
      if (_audio) {
        _audio.currentTime = 0;
        set({ currentTime: 0 });
        _audio.play().catch(() => { });
      }
      return;
    }

    let nextIndex;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeat === 'all') {
          nextIndex = 0;
        } else if (get().autoplay && get().currentSong) {
          // Infinite Autoplay: seamlessly fetch next batch of similar tracks and continue playing
          get().fetchAndAppendRadio(get().currentSong, true);
          return;
        } else {
          return; // End of queue
        }
      }
    }

    set({ queueIndex: nextIndex });
    get().playSong(queue[nextIndex]);

    // If approaching the end of the queue, proactively load more similar songs
    if (get().autoplay && nextIndex >= queue.length - 2 && queue[nextIndex]) {
      get().fetchAndAppendRadio(queue[nextIndex]);
    }
  },

  playPrev: () => {
    const { _audio, queue, queueIndex } = get();
    if (!_audio) return;

    // If more than 3 seconds in, restart current song
    if (_audio.currentTime > 3) {
      _audio.currentTime = 0;
      set({ currentTime: 0 });
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) prevIndex = queue.length - 1;

    set({ queueIndex: prevIndex });
    get().playSong(queue[prevIndex]);
  },

  // ─── Gapless Preloading ───
  preloadNextTrack: async () => {
    const { queue, queueIndex, _preloadedId } = get();
    const nextSong = queue[queueIndex + 1];
    if (!nextSong) return;

    const nextId = nextSong.id || nextSong.youtube_id;
    if (_preloadedId === nextId) return; // already preloading

    set({ _preloadedId: nextId });
    try {
      const cached = await getOfflineAudio(nextSong);
      if (!cached && nextSong.youtube_url) {
        // Pre-warm the YouTube stream URL on backend
        api.getYoutubeStreamUrl(nextSong.youtube_url);
      }
    } catch {}
  },

  // ─── Infinite Autoplay / Song Radio ───
  fetchAndAppendRadio: async (seedSong, playImmediatelyIfEmpty = false) => {
    const { autoplay, _isFetchingRadio } = get();
    if (!autoplay || _isFetchingRadio || !seedSong) return;

    const seedKey = `${seedSong.artist || ''}-${seedSong.title || ''}`;
    set({ _isFetchingRadio: true });

    try {
      const res = await api.getRelatedSongs({
        artist: seedSong.artist || '',
        title: seedSong.title || '',
        youtube_id: seedSong.youtube_id || '',
        song_id: seedSong.id || '',
        limit: 10,
      });

      const related = res.related || [];
      if (related.length === 0) {
        set({ _isFetchingRadio: false });
        return;
      }

      // Deduplicate against tracks already in current queue
      const currentQueue = get().queue;
      const existingKeys = new Set(
        currentQueue.map((s) => (s.youtube_id || s.id || `${s.artist}-${s.title}`).toLowerCase())
      );

      const newTracks = [];
      for (const track of related) {
        const key = (track.youtube_id || track.id || `${track.artist}-${track.title}`).toLowerCase();
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          newTracks.push({
            ...track,
            isAutoplay: true,
          });
        }
      }

      if (newTracks.length > 0) {
        const currentQueueIdx = get().queueIndex;
        const updatedQueue = [...get().queue, ...newTracks];
        set({
          queue: updatedQueue,
          _isFetchingRadio: false,
          _lastRadioSeed: seedKey,
        });

        // If the queue had reached the end and needs immediate playback
        if (playImmediatelyIfEmpty && currentQueueIdx >= currentQueue.length - 1) {
          const nextIdx = currentQueueIdx + 1;
          if (updatedQueue[nextIdx]) {
            set({ queueIndex: nextIdx });
            get().playSong(updatedQueue[nextIdx]);
          }
        }
      } else {
        set({ _isFetchingRadio: false });
      }
    } catch (err) {
      console.warn('Failed to fetch autoplay radio tracks:', err);
      set({ _isFetchingRadio: false });
    }
  },

  // ─── Sleep Timer (with smooth fade-out) ───
  setSleepTimer: (minutes) => {
    const { _sleepInterval, _audio, volume } = get();
    if (_sleepInterval) clearInterval(_sleepInterval);

    if (!minutes) {
      if (_audio) _audio.volume = volume;
      set({ sleepTimerMinutes: null, sleepTimerRemaining: null, _sleepInterval: null });
      return;
    }

    if (minutes === 'end_of_song') {
      triggerHaptic('selection');
      set({ sleepTimerMinutes: 'end_of_song', sleepTimerRemaining: null, _sleepInterval: null, isSleepTimerOpen: false });
      return;
    }

    const totalSeconds = minutes * 60;
    triggerHaptic('selection');
    set({ sleepTimerMinutes: minutes, sleepTimerRemaining: totalSeconds, isSleepTimerOpen: false });

    const interval = setInterval(() => {
      const { sleepTimerRemaining, _audio, volume } = get();
      if (sleepTimerRemaining === null) {
        clearInterval(interval);
        return;
      }

      if (sleepTimerRemaining <= 1) {
        clearInterval(interval);
        if (_audio) {
          _audio.pause();
          _audio.volume = volume;
        }
        set({
          sleepTimerMinutes: null,
          sleepTimerRemaining: null,
          _sleepInterval: null,
          isPlaying: false,
        });
      } else {
        // Smooth fade-out in final 20 seconds
        if (sleepTimerRemaining <= 20 && _audio) {
          _audio.volume = Math.max(0, (sleepTimerRemaining / 20) * volume);
        }
        set({ sleepTimerRemaining: sleepTimerRemaining - 1 });
      }
    }, 1000);

    set({ _sleepInterval: interval });
  },

  clearSleepTimer: () => {
    const { _sleepInterval, _audio, volume } = get();
    if (_sleepInterval) clearInterval(_sleepInterval);
    if (_audio) _audio.volume = volume;
    triggerHaptic('light');
    set({ sleepTimerMinutes: null, sleepTimerRemaining: null, _sleepInterval: null });
  },

  toggleSleepTimer: () => set((state) => ({ isSleepTimerOpen: !state.isSleepTimerOpen })),

  // ─── Audio Settings ───
  setCrossfadeSeconds: (sec) => {
    localStorage.setItem('homeify_crossfade', sec.toString());
    set({ crossfadeSeconds: sec });
  },

  setVolumeNormalization: (enabled) => {
    localStorage.setItem('homeify_normalization', enabled ? 'true' : 'false');
    set({ volumeNormalization: enabled });
    const { _sourceNode, _compressorNode, _analyserNode } = get();
    if (_sourceNode && _compressorNode && _analyserNode) {
      try {
        _sourceNode.disconnect();
        if (enabled) {
          _sourceNode.connect(_compressorNode);
          _compressorNode.connect(_analyserNode);
        } else {
          _sourceNode.connect(_analyserNode);
        }
      } catch (e) {
        console.warn('Volume normalization toggle warning:', e);
      }
    }
  },

  setTheme: (theme) => {
    localStorage.setItem('homeify_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  // ─── Visualizer ───
  toggleVisualizer: () => {
    const nextState = !get().isVisualizerOpen;
    if (nextState) {
      get().initWebAudioPipeline();
    }
    triggerHaptic('selection');
    set({ isVisualizerOpen: nextState });
  },

  setVisualizerStyle: (style) => {
    localStorage.setItem('homeify_vis_style', style);
    set({ visualizerStyle: style });
  },

  // ─── Quick Search ───
  toggleQuickSearch: () => set((state) => ({ isQuickSearchOpen: !state.isQuickSearchOpen })),
  setQuickSearchOpen: (open) => set({ isQuickSearchOpen: open }),

  // ─── Context Menu ───
  openContextMenu: (x, y, song) => {
    triggerHaptic('selection');
    set({ contextMenu: { isOpen: true, x, y, song } });
  },
  closeContextMenu: () => set({ contextMenu: { isOpen: false, x: 0, y: 0, song: null } }),

  // ─── Queue Management ───
  addToQueue: (song) => {
    triggerHaptic('light');
    set((state) => ({ queue: [...state.queue, song] }));
  },

  removeFromQueue: (index) => {
    triggerHaptic('light');
    set((state) => {
      const newQueue = state.queue.filter((_, i) => i !== index);
      let newIndex = state.queueIndex;
      if (index < newIndex) newIndex--;
      if (index === newIndex && newIndex >= newQueue.length) newIndex = newQueue.length - 1;
      return { queue: newQueue, queueIndex: newIndex };
    });
  },

  clearQueue: () => {
    triggerHaptic('medium');
    set({ queue: [], queueIndex: -1 });
  },

  // ─── Toggles ───
  toggleShuffle: () => {
    triggerHaptic('light');
    set((state) => ({ shuffle: !state.shuffle }));
  },

  toggleRepeat: () => {
    triggerHaptic('light');
    const modes = ['off', 'all', 'one'];
    set((state) => {
      const idx = modes.indexOf(state.repeat);
      return { repeat: modes[(idx + 1) % modes.length] };
    });
  },

  toggleNowPlaying: () => {
    triggerHaptic('light');
    set((state) => ({ isNowPlayingOpen: !state.isNowPlayingOpen }));
  },
  setNowPlayingOpen: (open) => set({ isNowPlayingOpen: open }),
  toggleLyrics: () => {
    triggerHaptic('light');
    set((state) => ({ isLyricsOpen: !state.isLyricsOpen }));
  },
  toggleQueue: () => {
    triggerHaptic('light');
    set((state) => ({ isQueueOpen: !state.isQueueOpen }));
  },

  // ─── Favorites Actions ───
  fetchFavorites: async () => {
    try {
      const data = await api.getFavoriteIds();
      const ids = (data.favorite_ids || []).map(String);
      set({ favoriteIds: new Set(ids), isFavoritesLoaded: true });
      try {
        localStorage.setItem('homeify_favorites', JSON.stringify(ids));
      } catch {}
    } catch (err) {
      console.warn('Failed to fetch favorite IDs from server (using offline cache):', err);
    }
  },

  isFavorite: (songId) => {
    if (!songId) return false;
    return get().favoriteIds.has(String(songId));
  },

  toggleFavorite: async (song) => {
    if (!song) return;
    const songId = String(song.id || song.songId || song.youtube_id || '');
    if (!songId) return;

    triggerHaptic('medium');

    const currentFavs = new Set(get().favoriteIds);
    const willLike = !currentFavs.has(songId);

    // Optimistic update
    if (willLike) {
      currentFavs.add(songId);
    } else {
      currentFavs.delete(songId);
    }
    set({ favoriteIds: new Set(currentFavs) });

    // Cache locally immediately
    try {
      localStorage.setItem('homeify_favorites', JSON.stringify(Array.from(currentFavs)));
    } catch {}

    // Sync with server
    try {
      const payload = {
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        youtube_url: song.youtube_url,
        youtube_id: song.youtube_id,
        cover_art_url: song.cover_art_url || song.thumbnail,
      };
      const res = await api.toggleFavorite(songId, payload);
      if (res && typeof res.is_liked === 'boolean') {
        const updatedFavs = new Set(get().favoriteIds);
        if (res.is_liked) {
          updatedFavs.add(songId);
          if (res.song && res.song.id && String(res.song.id) !== songId) {
            updatedFavs.add(String(res.song.id));
          }
        } else {
          updatedFavs.delete(songId);
        }
        set({ favoriteIds: updatedFavs });
        try {
          localStorage.setItem('homeify_favorites', JSON.stringify(Array.from(updatedFavs)));
        } catch {}
      }
    } catch (err) {
      console.error('Failed to sync favorite with server:', err);
    }
  },
}));

export default usePlayerStore;
