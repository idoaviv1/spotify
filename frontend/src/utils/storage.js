/**
 * IndexedDB storage for offline song caching.
 * Uses the 'idb' library for a promise-based API.
 * Supports persistent storage and offline playback without network.
 */
import { openDB } from 'idb';
import api from '../api/client';

const DB_NAME = 'homeify-offline';
const DB_VERSION = 1;

let dbPromise;

// Request persistent storage so iOS/browsers don't evict offline songs
if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((persisted) => {
    if (persisted) {
      console.log('✅ Persistent offline storage granted');
    }
  }).catch(() => {});
}

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('audio')) {
          db.createObjectStore('audio', { keyPath: 'songId' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'songId' });
        }
        if (!db.objectStoreNames.contains('covers')) {
          db.createObjectStore('covers', { keyPath: 'songId' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Save an audio file to IndexedDB for offline playback.
 */
export async function saveAudioOffline(songId, audioBlob, metadata = {}) {
  const db = await getDB();
  const idStr = String(songId);

  // Save audio blob
  await db.put('audio', {
    songId: idStr,
    id: metadata.id || idStr,
    youtube_id: metadata.youtube_id || null,
    youtube_url: metadata.youtube_url || null,
    title: metadata.title || 'Unknown',
    artist: metadata.artist || 'Unknown Artist',
    blob: audioBlob,
    savedAt: new Date().toISOString(),
    size: audioBlob.size,
  });

  // Save metadata
  await db.put('metadata', {
    songId: idStr,
    id: metadata.id || idStr,
    youtube_id: metadata.youtube_id || null,
    youtube_url: metadata.youtube_url || null,
    title: metadata.title || 'Unknown',
    artist: metadata.artist || 'Unknown Artist',
    album: metadata.album || '',
    duration: metadata.duration || 0,
    cover_art_url: metadata.cover_art_url || metadata.thumbnail || null,
    thumbnail: metadata.thumbnail || null,
    size: audioBlob.size,
    isOffline: true,
    savedAt: new Date().toISOString(),
  });
}

/**
 * Get an audio blob from IndexedDB.
 * Supports passing either a string ID or a song object with id/youtube_id/title.
 */
export async function getOfflineAudio(songOrId) {
  if (!songOrId) return null;
  const db = await getDB();

  // 1. If passed a string
  if (typeof songOrId === 'string') {
    const record = await db.get('audio', songOrId);
    if (record?.blob) return record.blob;
  }

  // 2. If passed an object
  if (typeof songOrId === 'object') {
    const keysToCheck = [
      songOrId.id,
      songOrId.song_id,
      songOrId.youtube_id,
      songOrId.youtube_url,
    ].filter(Boolean).map(String);

    for (const key of keysToCheck) {
      const record = await db.get('audio', key);
      if (record?.blob) return record.blob;
    }

    // 3. Search across all stored audio
    const all = await db.getAll('audio');
    const match = all.find((item) => {
      if (songOrId.id && item.id === songOrId.id) return true;
      if (songOrId.song_id && item.id === songOrId.song_id) return true;
      if (songOrId.youtube_id && item.youtube_id === songOrId.youtube_id) return true;
      if (songOrId.title && item.title === songOrId.title && songOrId.artist && item.artist === songOrId.artist) return true;
      return false;
    });

    if (match?.blob) return match.blob;
  }

  return null;
}

/**
 * Check if a song is available offline.
 */
export async function isSongOffline(songOrId) {
  const blob = await getOfflineAudio(songOrId);
  return !!blob;
}

/**
 * Get all offline song metadata.
 */
export async function getAllOfflineSongs() {
  const db = await getDB();
  return db.getAll('metadata');
}

/**
 * Remove a song from offline storage.
 */
export async function removeOfflineAudio(songOrId) {
  if (!songOrId) return;
  const db = await getDB();

  const id = typeof songOrId === 'string' ? songOrId : (songOrId.id || songOrId.songId || songOrId.youtube_id);
  if (!id) return;

  const idStr = String(id);
  await db.delete('audio', idStr);
  await db.delete('metadata', idStr);
  await db.delete('covers', idStr);

  // Also check if stored under any other key
  if (typeof songOrId === 'object') {
    const all = await db.getAll('metadata');
    for (const item of all) {
      if (
        (songOrId.youtube_id && item.youtube_id === songOrId.youtube_id) ||
        (songOrId.id && item.id === songOrId.id)
      ) {
        await db.delete('audio', item.songId);
        await db.delete('metadata', item.songId);
        await db.delete('covers', item.songId);
      }
    }
  }
}

/**
 * Get total offline storage usage in bytes.
 */
export async function getOfflineStorageSize() {
  const db = await getDB();
  const records = await db.getAll('audio');
  return records.reduce((total, r) => total + (r.size || 0), 0);
}

/**
 * Save cover art blob for offline use.
 */
export async function saveCoverOffline(songId, coverBlob) {
  const db = await getDB();
  await db.put('covers', {
    songId: String(songId),
    blob: coverBlob,
    savedAt: new Date().toISOString(),
  });
}

/**
 * Get offline cover art.
 */
export async function getOfflineCover(songId) {
  if (!songId) return null;
  const db = await getDB();
  const record = await db.get('covers', String(songId));
  return record?.blob || null;
}

/**
 * Download a song BOTH to the server (/media/windows/Music) AND to local device storage.
 * Guarantees offline availability on phone, and server availability on Windows.
 */
export async function downloadSongEverywhere(song) {
  let serverSong = { ...song };

  // 1. Ensure the song is downloaded on the server
  if (!serverSong.id || !serverSong.is_downloaded) {
    if (serverSong.youtube_url) {
      const res = await api.downloadSong(
        serverSong.youtube_url,
        serverSong.title,
        serverSong.artist
      );
      if (res && res.song) {
        serverSong = { ...serverSong, ...res.song, is_downloaded: true };
      }
    }
  }

  const primaryId = serverSong.id || serverSong.youtube_id;
  if (!primaryId) {
    throw new Error('Cannot download song without an ID or YouTube URL');
  }

  // 2. Fetch audio file stream from server
  const streamUrl = serverSong.id
    ? api.getStreamUrl(serverSong.id)
    : api.getYoutubeStreamUrl(serverSong.youtube_url);

  const audioRes = await fetch(streamUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download audio data: HTTP ${audioRes.status}`);
  }
  const audioBlob = await audioRes.blob();

  // 3. Cache cover art if available
  const coverUrl = serverSong.cover_art_url || serverSong.thumbnail;
  if (coverUrl) {
    try {
      const coverRes = await fetch(coverUrl);
      if (coverRes.ok) {
        const coverBlob = await coverRes.blob();
        await saveCoverOffline(primaryId, coverBlob);
      }
    } catch (e) {
      console.warn('Could not cache cover art offline:', e);
    }
  }

  // 4. Save to device IndexedDB
  await saveAudioOffline(primaryId, audioBlob, {
    ...serverSong,
    id: serverSong.id || primaryId,
    youtube_id: song.youtube_id || serverSong.youtube_id,
    youtube_url: song.youtube_url || serverSong.youtube_url,
  });

  return { ...serverSong, isOffline: true, id: serverSong.id || primaryId };
}

// Keep backward compatibility alias
export const downloadAndCacheSong = async (songId, streamUrl, coverUrl, metadata) => {
  return downloadSongEverywhere({ id: songId, ...metadata });
};
