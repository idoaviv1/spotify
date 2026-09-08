/**
 * Native Share utility for Homeify.
 * Uses Web Share API with clipboard copy fallback.
 */
import { TAILSCALE_DEFAULT_URL } from '../api/client';

export async function shareSong(song) {
  if (!song) return false;

  const baseWebUrl =
    typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http')
      ? window.location.origin
      : TAILSCALE_DEFAULT_URL;

  const shareTitle = `${song.title} - ${song.artist}`;
  const shareText = `🎵 שומע עכשיו ב-Homeify: "${song.title}" מאת ${song.artist}`;
  const shareUrl = `${baseWebUrl}/#play=${encodeURIComponent(song.id || song.youtube_id || '')}`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false; // User cancelled
    }
  }

  // Fallback to clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      return 'copied';
    } catch {
      // Fallback prompt
      window.prompt('העתק קישור לשיתוף:', `${shareText} ${shareUrl}`);
      return 'copied';
    }
  }

  return false;
}
