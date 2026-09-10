import { create } from "zustand";
import { downloadSongEverywhere } from "../utils/storage";
import { triggerHaptic } from "../utils/haptics";

export const useDownloadStore = create((set, get) => ({
  // Active downloads map: { [songKey]: { key, song, progress, stage, bytesReceived, totalBytes, error, startedAt } }
  activeDownloads: {},

  // Get active downloads as a reactive array
  getActiveDownloadsList: () => {
    return Object.values(get().activeDownloads);
  },

  // Check if a specific song is currently downloading
  isDownloading: (keyOrSong) => {
    if (!keyOrSong) return false;
    const key = typeof keyOrSong === "string" 
      ? keyOrSong 
      : (keyOrSong.id || keyOrSong.songId || keyOrSong.youtube_id);
    const item = get().activeDownloads[key];
    return Boolean(item && item.stage !== "error" && item.stage !== "completed");
  },

  // Get current progress percentage for a song (0 - 100)
  getProgress: (keyOrSong) => {
    if (!keyOrSong) return 0;
    const key = typeof keyOrSong === "string" 
      ? keyOrSong 
      : (keyOrSong.id || keyOrSong.songId || keyOrSong.youtube_id);
    const item = get().activeDownloads[key];
    return item ? (item.progress || 0) : 0;
  },

  // Get full state of a downloading song
  getDownloadItem: (keyOrSong) => {
    if (!keyOrSong) return null;
    const key = typeof keyOrSong === "string" 
      ? keyOrSong 
      : (keyOrSong.id || keyOrSong.songId || keyOrSong.youtube_id);
    return get().activeDownloads[key] || null;
  },

  // Start downloading a song with live progress
  startDownload: async (song) => {
    if (!song) return null;
    const key = song.id || song.songId || song.youtube_id;
    if (!key) {
      console.warn("Cannot download song without an ID or YouTube ID:", song);
      return null;
    }

    const current = get().activeDownloads[key];
    if (current && (current.stage === "downloading" || current.stage === "preparing" || current.stage === "saving")) {
      return null; // already in progress
    }

    triggerHaptic("light");

    // Initialize download record
    set((state) => ({
      activeDownloads: {
        ...state.activeDownloads,
        [key]: {
          key,
          song,
          progress: 5,
          stage: "preparing",
          bytesReceived: 0,
          totalBytes: 0,
          error: null,
          startedAt: Date.now(),
        },
      },
    }));

    try {
      const result = await downloadSongEverywhere(song, (prog) => {
        set((state) => {
          const existing = state.activeDownloads[key];
          if (!existing) return state;
          return {
            activeDownloads: {
              ...state.activeDownloads,
              [key]: {
                ...existing,
                progress: prog.percent,
                stage: prog.stage,
                bytesReceived: prog.bytesReceived || existing.bytesReceived,
                totalBytes: prog.totalBytes || existing.totalBytes,
              },
            },
          };
        });
      });

      // Mark completed
      triggerHaptic("success");
      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [key]: {
            ...state.activeDownloads[key],
            progress: 100,
            stage: "completed",
          },
        },
      }));

      // Broadcast update event so Offline views immediately re-read IndexedDB
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("homeify:offline-updated", { detail: { song: result } }));
      }

      // Automatically clean up completed item after 4 seconds to give user visual feedback
      setTimeout(() => {
        set((state) => {
          const updated = { ...state.activeDownloads };
          delete updated[key];
          return { activeDownloads: updated };
        });
      }, 4000);

      return result;
    } catch (err) {
      console.error("Download failed for song:", song.title, err);
      triggerHaptic("error");
      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [key]: {
            ...state.activeDownloads[key],
            stage: "error",
            error: err.message || "Failed to download",
          },
        },
      }));

      // Clean up error after 6 seconds
      setTimeout(() => {
        set((state) => {
          const updated = { ...state.activeDownloads };
          delete updated[key];
          return { activeDownloads: updated };
        });
      }, 6000);

      throw err;
    }
  },

  // Clear or dismiss an active download record
  dismissDownload: (key) => {
    set((state) => {
      const updated = { ...state.activeDownloads };
      delete updated[key];
      return { activeDownloads: updated };
    });
  },
}));

export default useDownloadStore;
