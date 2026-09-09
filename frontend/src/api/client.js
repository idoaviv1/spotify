/**
 * Homeify API Client
 * 
 * Communicates with the FastAPI backend over Tailscale or direct web.
 * Falls back to localhost for development.
 */

const STORAGE_KEY = 'homeify_server_url';
export const TAILSCALE_DEFAULT_URL = 'http://100.127.161.16:8686';

function getServerUrl() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('soniclink_server_url');
  if (saved) return saved;

  // If running inside Capacitor native app (iOS or Android)
  const isNative = typeof window !== 'undefined' && (
    (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:' ||
    window.location.protocol === 'file:' ||
    window.location.origin.includes('capacitor://')
  );

  if (isNative) {
    return TAILSCALE_DEFAULT_URL;
  }

  // Same origin when served by FastAPI backend or local dev server
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return window.location.port ? window.location.origin : 'http://localhost:8686';
    }
    if (window.location.origin && window.location.origin.startsWith('http')) {
      return window.location.origin;
    }
  }

  return TAILSCALE_DEFAULT_URL;
}

export function setServerUrl(url) {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/$/, ''));
}

export function getConfiguredServerUrl() {
  return getServerUrl();
}

async function request(path, options = {}) {
  const base = getServerUrl();
  const url = `${base}${path}`;

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('homeify_token') : null;

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);

  if (response.status === 401 && !path.startsWith('/api/auth/login')) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('homeify_token');
      localStorage.removeItem('homeify_user');
    }
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `Request failed: ${response.status}`);
  }

  return response.json();
}

// ─── Search ───
export const api = {
  // Search
  searchSongs: (query, limit = 20) =>
    request(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  searchMetadata: (query) =>
    request(`/api/search/metadata?q=${encodeURIComponent(query)}`),

  enrichMetadata: (title, artist) =>
    request(`/api/search/enrich?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`),

  // Music
  downloadSong: (youtubeUrl, title, artist) =>
    request('/api/music/download', {
      method: 'POST',
      body: { youtube_url: youtubeUrl, title, artist },
    }),

  getStreamUrl: (songId) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('homeify_token') : null;
    const authQuery = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${getServerUrl()}/api/music/stream/${songId}${authQuery}`;
  },

  getYoutubeStreamUrl: (url) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('homeify_token') : null;
    const authQuery = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${getServerUrl()}/api/music/stream-yt?url=${encodeURIComponent(url)}${authQuery}`;
  },

  getStreamFromYoutube: (url) =>
    request(`/api/music/stream-url?url=${encodeURIComponent(url)}`),

  getDownloadUrl: (songId) => `${getServerUrl()}/api/music/download-file/${songId}`,

  getCoverUrl: (songId) => `${getServerUrl()}/api/music/cover/${songId}`,

  updateSong: (songId, data) =>
    request(`/api/music/${songId}`, { method: 'PUT', body: data }),

  deleteSong: (songId) =>
    request(`/api/music/${songId}`, { method: 'DELETE' }),

  uploadAudioFile: async (file) => {
    const base = getServerUrl();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${base}/api/music/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to upload audio file');
    }
    return res.json();
  },

  // Library
  getLibrary: (page = 1, limit = 50, sort = 'created_at', order = 'desc', search = '') =>
    request(`/api/library?page=${page}&limit=${limit}&sort=${sort}&order=${order}&search=${encodeURIComponent(search)}`),

  getLibraryStats: () => request('/api/library/stats'),

  getArtists: () => request('/api/library/artists'),

  getRecentSongs: (limit = 20) => request(`/api/library/recent?limit=${limit}`),

  getSong: (songId) => request(`/api/library/song/${songId}`),

  // Playlists
  getPlaylists: () => request('/api/playlists'),

  createPlaylist: (name, description = '') =>
    request('/api/playlists', { method: 'POST', body: { name, description } }),

  getPlaylist: (id) => request(`/api/playlists/${id}`),

  updatePlaylist: (id, data) =>
    request(`/api/playlists/${id}`, { method: 'PUT', body: data }),

  deletePlaylist: (id) =>
    request(`/api/playlists/${id}`, { method: 'DELETE' }),

  uploadPlaylistCover: async (playlistId, file) => {
    const base = getServerUrl();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${base}/api/playlists/${playlistId}/cover`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload playlist cover');
    return res.json();
  },

  getPlaylistCoverUrl: (playlistId) => `${getServerUrl()}/api/playlists/${playlistId}/cover`,

  // Recommendations based on listening history
  getRecommendations: (limit = 10) => request(`/api/recommendations?limit=${limit}`),

  // Explore & Discover Hub (Hebrew, English, Spanish, Fresh Unheard)
  getExploreRecommendations: (category = 'all', refresh = false, limit = 12) => {
    const params = new URLSearchParams({ category, refresh: refresh.toString(), limit: limit.toString() });
    return request(`/api/recommendations/explore?${params.toString()}`);
  },

  // Song Radio / Related Tracks based on seed track & artist
  getRelatedSongs: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.title) searchParams.set('title', params.title);
    if (params.artist) searchParams.set('artist', params.artist);
    if (params.youtube_id) searchParams.set('youtube_id', params.youtube_id);
    if (params.song_id) searchParams.set('song_id', params.song_id);
    if (params.limit) searchParams.set('limit', params.limit);
    return request(`/api/recommendations/related?${searchParams.toString()}`);
  },

  addSongToPlaylist: (playlistId, songId) =>
    request(`/api/playlists/${playlistId}/songs`, { method: 'POST', body: { song_id: songId } }),

  removeSongFromPlaylist: (playlistId, songId) =>
    request(`/api/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' }),

  reorderPlaylist: (playlistId, songIds) =>
    request(`/api/playlists/${playlistId}/reorder`, { method: 'PUT', body: { song_ids: songIds } }),

  importPlaylist: (url, name = '') =>
    request('/api/playlists/import', { method: 'POST', body: { url, name } }),

  // Favorites / Liked Songs
  getFavorites: () => request('/api/favorites'),

  getFavoriteIds: () => request('/api/favorites/ids'),

  toggleFavorite: (songId, songData = null) =>
    request('/api/favorites/toggle', { method: 'POST', body: { song_id: songId, song_data: songData } }),

  // System Backup & Restore
  exportBackup: () => request('/api/system/backup'),

  importBackup: (backupData) =>
    request('/api/system/restore', { method: 'POST', body: backupData }),

  // Lyrics
  getLyrics: (songId) => request(`/api/lyrics/${songId}`),

  getLyricsDirect: (title, artist, album, duration) => {
    const params = new URLSearchParams({ title, artist, album, duration: duration.toString() });
    return request(`/api/lyrics/direct/get?${params}`);
  },

  searchLyrics: (query) =>
    request(`/api/lyrics/search/query?q=${encodeURIComponent(query)}`),

  // History
  getHistory: (page = 1, limit = 50) =>
    request(`/api/history?page=${page}&limit=${limit}`),

  recordPlay: (songId, durationListened = 0) =>
    request('/api/history', { method: 'POST', body: { song_id: songId, duration_listened: durationListened } }),

  getTopSongs: (limit = 20) => request(`/api/history/top?limit=${limit}`),

  clearHistory: () => request('/api/history', { method: 'DELETE' }),

  // Equalizer
  getEqualizerPresets: () => request('/api/equalizer/presets'),

  // Health
  healthCheck: () => request('/api/health'),

  // ─── Authentication ───
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),

  getMe: () => request('/api/auth/me'),

  updateProfile: (data) =>
    request('/api/auth/profile', { method: 'PUT', body: data }),

  // ─── Admin Management (Restricted to Administrators) ───
  adminGetUsers: () => request('/api/admin/users'),

  adminCreateUser: (userData) =>
    request('/api/admin/users', { method: 'POST', body: userData }),

  adminGetUserDetails: (userId) =>
    request(`/api/admin/users/${userId}`),

  adminUpdateUser: (userId, userData) =>
    request(`/api/admin/users/${userId}`, { method: 'PUT', body: userData }),

  adminDeleteUser: (userId) =>
    request(`/api/admin/users/${userId}`, { method: 'DELETE' }),

  adminGetUserPlaylists: (userId) =>
    request(`/api/admin/users/${userId}/playlists`),

  adminCreateUserPlaylist: (userId, data) =>
    request(`/api/admin/users/${userId}/playlists`, { method: 'POST', body: data }),

  adminUpdatePlaylist: (playlistId, data) =>
    request(`/api/admin/playlists/${playlistId}`, { method: 'PUT', body: data }),

  adminDeletePlaylist: (playlistId) =>
    request(`/api/admin/playlists/${playlistId}`, { method: 'DELETE' }),

  adminAddSongToPlaylist: (playlistId, songId, songData = null) =>
    request(`/api/admin/playlists/${playlistId}/songs`, { method: 'POST', body: { song_id: songId, song_data: songData } }),

  adminRemoveSongFromPlaylist: (playlistId, songId) =>
    request(`/api/admin/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' }),
};

export default api;
