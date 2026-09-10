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

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    if (!blob) return resolve(null);
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Save an audio file to IndexedDB for offline playback.
 * Saves in app-private sandbox storage (does not pollute user Files / Downloads).
 */
export async function saveAudioOffline(songId, audioBlob, metadata = {}) {
  const db = await getDB();
  const idStr = String(songId);

  const metaRecord = {
    songId: idStr,
    id: metadata.id || idStr,
    youtube_id: metadata.youtube_id || null,
    youtube_url: metadata.youtube_url || null,
    title: metadata.title || 'Unknown',
    artist: metadata.artist || 'Unknown Artist',
    album: metadata.album || '',
    duration: metadata.duration || 0,
    cover_art_url: metadata.cover_art_url || metadata.thumbnail || null,
    cover_data_url: metadata.cover_data_url || null,
    thumbnail: metadata.thumbnail || null,
    size: audioBlob.size,
    isOffline: true,
    isPrimary: true,
    savedAt: new Date().toISOString(),
  };

  // Save primary audio blob
  await db.put('audio', {
    songId: idStr,
    ...metaRecord,
    blob: audioBlob,
  });

  // Save primary metadata
  await db.put('metadata', metaRecord);

  // If youtube_id is distinct from idStr, save an alias so lookups by youtube_id succeed in O(1)
  if (metadata.youtube_id && String(metadata.youtube_id) !== idStr) {
    const ytKey = String(metadata.youtube_id);
    await db.put('audio', {
      songId: ytKey,
      ...metaRecord,
      songId: ytKey,
      isPrimary: false,
      blob: audioBlob,
    });
    await db.put('metadata', {
      ...metaRecord,
      songId: ytKey,
      isPrimary: false,
    });
  }
}

/**
 * Get an audio blob from IndexedDB.
 * Memory-safe: Never loads all audio blobs into RAM.
 */
export async function getOfflineAudio(songOrId) {
  if (!songOrId) return null;
  const db = await getDB();

  // 1. If passed a string ID
  if (typeof songOrId === 'string') {
    const record = await db.get('audio', songOrId);
    if (record?.blob) return record.blob;

    // Check if alias exists in metadata
    const allMeta = await db.getAll('metadata');
    const match = allMeta.find(m => m.youtube_id === songOrId || m.id === songOrId || m.songId === songOrId);
    if (match) {
      const audioRec = await db.get('audio', match.songId);
      if (audioRec?.blob) return audioRec.blob;
    }
    return null;
  }

  // 2. If passed a song object
  if (typeof songOrId === 'object') {
    const keysToCheck = [
      songOrId.id,
      songOrId.songId,
      songOrId.song_id,
      songOrId.youtube_id,
      songOrId.youtube_url,
    ].filter(Boolean).map(String);

    for (const key of keysToCheck) {
      const record = await db.get('audio', key);
      if (record?.blob) return record.blob;
    }

    // Search lightweight metadata store (loads a few KB, not hundreds of MB of blobs!)
    const allMeta = await db.getAll('metadata');
    const match = allMeta.find((item) => {
      if (songOrId.id && item.id === songOrId.id) return true;
      if (songOrId.song_id && item.id === songOrId.song_id) return true;
      if (songOrId.youtube_id && item.youtube_id === songOrId.youtube_id) return true;
      if (songOrId.title && item.title === songOrId.title && songOrId.artist && item.artist === songOrId.artist) return true;
      return false;
    });

    if (match) {
      const audioRec = await db.get('audio', match.songId);
      if (audioRec?.blob) return audioRec.blob;
    }
  }

  return null;
}

/**
 * Check if a song is available offline.
 * Extremely lightweight and fast: queries only the metadata store.
 */
export async function isSongOffline(songOrId) {
  if (!songOrId) return false;
  try {
    const db = await getDB();
    if (typeof songOrId === 'string') {
      const meta = await db.get('metadata', songOrId);
      if (meta) return true;
      const allMeta = await db.getAll('metadata');
      return allMeta.some(m => m.youtube_id === songOrId || m.id === songOrId || m.songId === songOrId);
    }

    const keysToCheck = [
      songOrId.id,
      songOrId.songId,
      songOrId.song_id,
      songOrId.youtube_id,
      songOrId.youtube_url,
    ].filter(Boolean).map(String);

    for (const key of keysToCheck) {
      const meta = await db.get('metadata', key);
      if (meta) return true;
    }

    const allMeta = await db.getAll('metadata');
    return allMeta.some((item) => {
      if (songOrId.id && item.id === songOrId.id) return true;
      if (songOrId.song_id && item.id === songOrId.song_id) return true;
      if (songOrId.youtube_id && item.youtube_id === songOrId.youtube_id) return true;
      if (songOrId.title && item.title === songOrId.title && songOrId.artist && item.artist === songOrId.artist) return true;
      return false;
    });
  } catch (e) {
    console.warn('isSongOffline check failed:', e);
    return false;
  }
}

/**
 * Get all offline song metadata, deduplicated and sorted newest first.
 */
export async function getAllOfflineSongs() {
  const db = await getDB();
  const all = await db.getAll('metadata');
  const seen = new Set();
  const unique = [];

  for (const item of all) {
    // Only pick primary records or unique song identifiers
    const uniqueKey = item.id || (item.youtube_id ? `yt-${item.youtube_id}` : null) || `${item.title}-${item.artist}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      unique.push(item);
    }
  }

  return unique.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
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

  // Clean up any related aliases or records
  const allMeta = await db.getAll('metadata');
  const targets = new Set();

  if (typeof songOrId === 'object') {
    if (songOrId.youtube_id) targets.add(String(songOrId.youtube_id));
    if (songOrId.id) targets.add(String(songOrId.id));
    if (songOrId.songId) targets.add(String(songOrId.songId));
  }

  for (const item of allMeta) {
    if (
      targets.has(item.songId) ||
      targets.has(item.id) ||
      (item.youtube_id && targets.has(item.youtube_id))
    ) {
      await db.delete('audio', item.songId);
      await db.delete('metadata', item.songId);
      await db.delete('covers', item.songId);
    }
  }
}

/**
 * Get total offline storage usage in bytes.
 * Reads metadata file sizes to avoid loading huge audio blobs into RAM.
 */
export async function getOfflineStorageSize() {
  const db = await getDB();
  const records = await db.getAll('metadata');
  const seen = new Set();
  let total = 0;

  for (const r of records) {
    const key = r.id || r.songId || r.youtube_id;
    if (!seen.has(key)) {
      seen.add(key);
      total += (r.size || 0);
    }
  }

  return total;
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
 * Stores audio blob into the app-private IndexedDB sandbox (does not pollute phone's public file gallery).
 * Guarantees 100% offline availability on phone, and server availability on Windows.
 */
export async function downloadSongEverywhere(song, onProgress = null) {
  const report = (percent, stage, extra = {}) => {
    if (typeof onProgress === "function") {
      try {
        onProgress({
          percent: Math.min(100, Math.max(0, Math.round(percent))),
          stage,
          ...extra
        });
      } catch (e) {
        console.warn("Error in onProgress callback:", e);
      }
    }
  };

  report(5, "preparing");

  let serverSong = { ...song };

  const ytUrl = serverSong.youtube_url || (serverSong.youtube_id ? `https://www.youtube.com/watch?v=${serverSong.youtube_id}` : null);
  if (ytUrl && !serverSong.youtube_url) {
    serverSong.youtube_url = ytUrl;
  }

  // 1. Ensure the song is downloaded on the server
  if (!serverSong.id || !serverSong.is_downloaded) {
    report(15, "preparing");
    if (ytUrl) {
      const res = await api.downloadSong(
        ytUrl,
        serverSong.title,
        serverSong.artist
      );
      if (res && res.song) {
        serverSong = { ...serverSong, ...res.song, is_downloaded: true };
      }
    }
    report(25, "preparing");
  } else {
    report(25, "preparing");
  }

  const primaryId = serverSong.id || serverSong.youtube_id;
  if (!primaryId) {
    throw new Error("Cannot download song without an ID or YouTube URL");
  }

  // 2. Fetch audio file stream from server with progress streaming
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("homeify_token") : null;
  const streamUrl = serverSong.id
    ? api.getStreamUrl(serverSong.id)
    : (ytUrl ? api.getYoutubeStreamUrl(ytUrl) : null);

  if (!streamUrl) {
    throw new Error("No stream URL available to download song");
  }

  report(28, "downloading");

  const audioRes = await fetch(streamUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!audioRes.ok) {
    throw new Error(`Failed to download audio data: HTTP ${audioRes.status}`);
  }

  // Read response stream chunks to calculate real progress
  const contentLength = audioRes.headers.get("content-length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : (serverSong.file_size || 0);

  let audioBlob;
  if (audioRes.body && typeof audioRes.body.getReader === "function") {
    const reader = audioRes.body.getReader();
    const chunks = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedBytes += value.length;

      if (totalBytes > 0) {
        const streamPct = 28 + (receivedBytes / totalBytes) * 60; // 28% -> 88%
        report(streamPct, "downloading", { receivedBytes, totalBytes });
      } else {
        const estTotal = 4.5 * 1024 * 1024;
        const streamPct = Math.min(88, 28 + (receivedBytes / estTotal) * 60);
        report(streamPct, "downloading", { receivedBytes, totalBytes: totalBytes || estTotal });
      }
    }
    audioBlob = new Blob(chunks);
  } else {
    report(60, "downloading");
    audioBlob = await audioRes.blob();
    report(88, "downloading");
  }

  report(90, "saving");

  // 3. Cache cover art if available and generate Data URL for 100% offline view
  let coverDataUrl = null;
  const coverUrl = serverSong.cover_art_url || serverSong.thumbnail;
  if (coverUrl) {
    try {
      const coverRes = await fetch(coverUrl);
      if (coverRes.ok) {
        const coverBlob = await coverRes.blob();
        await saveCoverOffline(primaryId, coverBlob);
        coverDataUrl = await blobToDataUrl(coverBlob);
      }
    } catch (e) {
      console.warn("Could not cache cover art offline:", e);
    }
  }

  report(95, "saving");

  // 4. Save to device IndexedDB private sandbox
  await saveAudioOffline(primaryId, audioBlob, {
    ...serverSong,
    id: serverSong.id || primaryId,
    youtube_id: song.youtube_id || serverSong.youtube_id,
    youtube_url: song.youtube_url || serverSong.youtube_url,
    cover_data_url: coverDataUrl,
  });

  report(100, "completed");

  return {
    ...serverSong,
    isOffline: true,
    id: serverSong.id || primaryId,
    cover_data_url: coverDataUrl,
  };
}

// Keep backward compatibility alias
export const downloadAndCacheSong = async (songId, streamUrl, coverUrl, metadata) => {
  return downloadSongEverywhere({ id: songId, ...metadata });
};

