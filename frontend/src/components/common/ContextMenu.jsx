import { useEffect, useRef, useState } from 'react';
import usePlayerStore from '../../stores/playerStore';
import api from '../../api/client';
import { downloadSongEverywhere } from '../../utils/storage';
import { shareSong } from '../../utils/share';
import {
  IconPlay,
  IconQueue,
  IconPlus,
  IconDownload,
  IconCopy,
  IconCheck,
  IconHeart,
} from './Icons';

export default function ContextMenu() {
  const {
    contextMenu,
    closeContextMenu,
    playSong,
    addToQueue,
    isFavorite,
    toggleFavorite,
  } = usePlayerStore();

  const [playlists, setPlaylists] = useState([]);
  const [showPlaylistsSubmenu, setShowPlaylistsSubmenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);

  const { isOpen, x, y, song } = contextMenu;

  useEffect(() => {
    if (!isOpen) return;

    // Fetch playlists once for the sub-menu
    api.getPlaylists().then((res) => {
      setPlaylists(res.playlists || (Array.isArray(res) ? res : []));
    }).catch(() => {});

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeContextMenu();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeContextMenu]);

  if (!isOpen || !song) return null;

  // Keep menu within viewport bounds
  const menuWidth = 220;
  const menuHeight = 260;
  const left = Math.min(x, window.innerWidth - menuWidth - 10);
  const top = Math.min(y, window.innerHeight - menuHeight - 10);

  const handlePlayNext = () => {
    const { queue, queueIndex } = usePlayerStore.getState();
    const newQueue = [...queue];
    newQueue.splice(queueIndex + 1, 0, song);
    usePlayerStore.setState({ queue: newQueue });
    closeContextMenu();
  };

  const handleAddToPlaylist = async (playlistId) => {
    try {
      if (song.id) {
        await api.addSongToPlaylist(playlistId, song.id);
      }
    } catch (e) {
      console.error('Failed to add song to playlist:', e);
    }
    closeContextMenu();
  };

  const handleDownload = async () => {
    try {
      await downloadSongEverywhere(song);
    } catch (e) {
      console.error('Failed to download:', e);
    }
    closeContextMenu();
  };

  const handleShare = async () => {
    const res = await shareSong(song);
    if (res === 'copied') {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        closeContextMenu();
      }, 1200);
    } else {
      closeContextMenu();
    }
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        background: 'rgba(24, 24, 34, 0.96)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--shadow-lg)',
        borderRadius: 'var(--radius-md)',
        padding: '6px 0',
        minWidth: menuWidth,
        animation: 'contextMenuPop 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Song Info Header */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--glass-border)', marginBottom: 4 }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {song.title}
        </div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>{song.artist}</div>
      </div>

      {/* Play Now */}
      <button className="context-menu-item" onClick={() => { playSong(song); closeContextMenu(); }}>
        <IconPlay size={16} /> Play Now
      </button>

      {/* Save / Remove Favorite */}
      {(() => {
        const isFav = isFavorite(song.id || song.songId || song.youtube_id);
        return (
          <button
            className="context-menu-item"
            onClick={() => {
              toggleFavorite(song);
              closeContextMenu();
            }}
          >
            <IconHeart size={16} filled={isFav} style={{ color: isFav ? 'var(--accent)' : 'inherit' }} />
            {isFav ? 'Remove from Favorites' : 'Save to Favorites'}
          </button>
        );
      })()}

      {/* Play Next */}
      <button className="context-menu-item" onClick={handlePlayNext}>
        <IconQueue size={16} /> Play Next
      </button>

      {/* Add to Queue */}
      <button className="context-menu-item" onClick={() => { addToQueue(song); closeContextMenu(); }}>
        <IconPlus size={16} /> Add to Queue
      </button>

      {/* Add to Playlist Submenu Trigger */}
      <div
        className="context-menu-item"
        style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onMouseEnter={() => setShowPlaylistsSubmenu(true)}
        onMouseLeave={() => setShowPlaylistsSubmenu(false)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconPlus size={16} /> Add to Playlist
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>›</span>

        {showPlaylistsSubmenu && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: -6,
              background: 'rgba(24, 24, 34, 0.98)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              minWidth: 160,
              maxHeight: 200,
              overflowY: 'auto',
              padding: '6px 0',
              zIndex: 10000,
            }}
          >
            {playlists.length === 0 ? (
              <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>No playlists</div>
            ) : (
              playlists.map((pl) => (
                <button
                  key={pl.id}
                  className="context-menu-item"
                  onClick={() => handleAddToPlaylist(pl.id)}
                  style={{ fontSize: '0.75rem', padding: '8px 12px' }}
                >
                  {pl.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--glass-border)', margin: '4px 0' }} />

      {/* Download */}
      <button className="context-menu-item" onClick={handleDownload}>
        <IconDownload size={16} /> Save / Download
      </button>

      {/* Share / Copy Link */}
      <button className="context-menu-item" onClick={handleShare}>
        {copied ? <IconCheck size={16} style={{ color: 'var(--accent)' }} /> : <IconCopy size={16} />}
        {copied ? 'Link Copied!' : 'Share Song'}
      </button>
    </div>
  );
}
