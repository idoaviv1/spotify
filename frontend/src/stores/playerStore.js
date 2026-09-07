/**
 * Player Store - Zustand state management for audio playback.
 * Manages the current track, queue, playback state, and audio element.
 */
import { create } from 'zustand';
import api from '../api/client';
import { getOfflineAudio, isSongOffline } from '../utils/storage';

const usePlayerStore = create((set, get) => ({
  // Current track
  currentSong: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,

  // Queue
  queue: [],
  queueIndex: -1,
  shuffle: false,
  repeat: 'off', // 'off', 'all', 'one'

  // UI State
  isNowPlayingOpen: false,
  isLyricsOpen: false,
  isQueueOpen: false,
  isLoading: false,

  // Audio element reference & Web Audio context
  _audio: null,
  _audioContext: null,
  setAudioContext: (ctx) => set({ _audioContext: ctx }),

  // ─── Initialize Audio ───
  initAudio: () => {
    if (get()._audio) return;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';

    audio.addEventListener('timeupdate', () => {
      set({ currentTime: audio.currentTime });
    });

    audio.addEventListener('durationchange', () => {
      set({ duration: audio.duration || 0 });
    });

    audio.addEventListener('ended', () => {
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
    const savedVolume = localStorage.getItem('soniclink_volume');
    if (savedVolume) {
      audio.volume = parseFloat(savedVolume);
      set({ volume: parseFloat(savedVolume) });
    }

    set({ _audio: audio });
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
      let audioSrc;

      // 1. PRIORITY 1: Check if song is saved locally on device (works 100% offline!)
      const offlineBlob = await getOfflineAudio(song);
      if (offlineBlob) {
        audioSrc = URL.createObjectURL(offlineBlob);
        console.log('🎵 Playing from device local offline storage:', song.title);
      }

      // 2. If downloaded on server library, stream local file directly
      if (!audioSrc && song.id && song.is_downloaded) {
        audioSrc = api.getStreamUrl(song.id);
      }

      // 3. If it has a YouTube URL, stream via server proxy (bypasses 403 & unsupported codecs)
      if (!audioSrc && song.youtube_url) {
        audioSrc = api.getYoutubeStreamUrl(song.youtube_url);
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

      // Update MediaSession for lock screen
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title || 'Unknown',
          artist: song.artist || 'Unknown Artist',
          album: song.album || '',
          artwork: (song.cover_art_url || song.thumbnail) ? [{ src: song.cover_art_url || song.thumbnail, sizes: '512x512', type: 'image/jpeg' }] : [],
        });

        navigator.mediaSession.setActionHandler('play', () => get().togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => get().togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => get().playPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => get().playNext());
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
      localStorage.setItem('soniclink_volume', vol.toString());
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
        } else {
          return; // End of queue
        }
      }
    }

    set({ queueIndex: nextIndex });
    get().playSong(queue[nextIndex]);
  },

  playPrev: () => {
    const { _audio, queue, queueIndex } = get();
    if (!_audio) return;

    // If more than 3 seconds in, restart current song
    if (_audio.currentTime > 3) {
      _audio.currentTime = 0;
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) prevIndex = queue.length - 1;

    set({ queueIndex: prevIndex });
    get().playSong(queue[prevIndex]);
  },

  // ─── Queue Management ───
  addToQueue: (song) => {
    set((state) => ({ queue: [...state.queue, song] }));
  },

  removeFromQueue: (index) => {
    set((state) => {
      const newQueue = state.queue.filter((_, i) => i !== index);
      let newIndex = state.queueIndex;
      if (index < newIndex) newIndex--;
      if (index === newIndex && newIndex >= newQueue.length) newIndex = newQueue.length - 1;
      return { queue: newQueue, queueIndex: newIndex };
    });
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: -1 });
  },

  // ─── Toggles ───
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),

  toggleRepeat: () => {
    const modes = ['off', 'all', 'one'];
    set((state) => {
      const idx = modes.indexOf(state.repeat);
      return { repeat: modes[(idx + 1) % modes.length] };
    });
  },

  toggleNowPlaying: () => set((state) => ({ isNowPlayingOpen: !state.isNowPlayingOpen })),
  setNowPlayingOpen: (open) => set({ isNowPlayingOpen: open }),
  toggleLyrics: () => set((state) => ({ isLyricsOpen: !state.isLyricsOpen })),
  toggleQueue: () => set((state) => ({ isQueueOpen: !state.isQueueOpen })),
}));

export default usePlayerStore;
