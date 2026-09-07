/**
 * SonicLink API Client
 * 
 * Communicates with the FastAPI backend over Tailscale.
 * Falls back to localhost for development.
 */

const STORAGE_KEY = 'soniclink_server_url';
export const TAILSCALE_DEFAULT_URL = 'http://100.127.161.16:8686';

function getServerUrl() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return saved;

  // If running inside Capacitor iOS native app (capacitor://localhost)
  if (
    typeof window !== 'undefined' &&
    (window.location.protocol === 'capacitor:' ||
     window.location.protocol === 'ionic:' ||
     window.location.protocol === 'file:' ||
     window.location.origin.includes('capacitor://'))
  ) {
    return TAILSCALE_DEFAULT_URL;
  }

  // Same origin when served by FastAPI backend or localhost
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

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);

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

  getStreamUrl: (songId) => `${getServerUrl()}/api/music/stream/${songId}`,

  getYoutubeStreamUrl: (url) => `${getServerUrl()}/api/music/stream-yt?url=${encodeURIComponent(url)}`,

  getStreamFromYoutube: (url) =>
    request(`/api/music/stream-url?url=${encodeURIComponent(url)}`),

  getDownloadUrl: (songId) => `${getServerUrl()}/api/music/download-file/${songId}`,

  getCoverUrl: (songId) => `${getServerUrl()}/api/music/cover/${songId}`,

  updateSong: (songId, data) =>
    request(`/api/music/${songId}`, { method: 'PUT', body: data }),

  deleteSong: (songId) =>
    request(`/api/music/${songId}`, { method: 'DELETE' }),

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

  addSongToPlaylist: (playlistId, songId) =>
    request(`/api/playlists/${playlistId}/songs`, { method: 'POST', body: { song_id: songId } }),

  removeSongFromPlaylist: (playlistId, songId) =>
    request(`/api/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' }),

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
};

export default api;
