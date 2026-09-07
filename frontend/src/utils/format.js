/**
 * Utility functions for formatting time and text.
 */

/**
 * Format seconds to mm:ss or h:mm:ss
 */
export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format bytes to human readable size
 */
export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

/**
 * Format a date to relative time string
 */
export function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString();
}

/**
 * Truncate text to max length
 */
export function truncate(text, maxLength = 40) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

/**
 * Parse LRC synced lyrics format into an array of { time, text }
 * Format: [mm:ss.xx] text
 */
export function parseLRC(lrcString) {
  if (!lrcString) return [];
  
  const lines = lrcString.split('\n');
  const result = [];

  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const ms = parseInt(match[3].padEnd(3, '0'));
      const time = minutes * 60 + seconds + ms / 1000;
      const text = match[4].trim();
      if (text) {
        result.push({ time, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}
