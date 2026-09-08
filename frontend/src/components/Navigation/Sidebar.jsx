import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IconHome,
  IconSearch,
  IconLibrary,
  IconSettings,
  IconPlus,
  IconMusic,
  IconShield,
  IconLogout,
  IconUser,
} from '../common/Icons';
import api from '../../api/client';
import useAuthStore from '../../stores/authStore';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);

  const [playlists, setPlaylists] = useState([]);
  const [serverOnline, setServerOnline] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let active = true;
    loadPlaylists(() => active);
    checkHealth(() => active);
    const interval = setInterval(() => checkHealth(() => active), 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  async function checkHealth(isActiveRef) {
    try {
      await api.healthCheck();
      if (isActiveRef && !isActiveRef()) return;
      setServerOnline(true);
    } catch {
      if (isActiveRef && !isActiveRef()) return;
      setServerOnline(false);
    }
  }

  async function loadPlaylists(isActiveRef) {
    try {
      const data = await api.getPlaylists();
      if (isActiveRef && !isActiveRef()) return;
      setPlaylists(data?.playlists || (Array.isArray(data) ? data : []));
    } catch (e) {
      console.warn('Sidebar failed to load playlists:', e);
    }
  }

  async function handleCreatePlaylist() {
    const name = window.prompt('Enter playlist name:');
    if (!name || !name.trim()) return;
    setIsCreating(true);
    try {
      const res = await api.createPlaylist(name.trim(), 'Created via Homeify Web');
      await loadPlaylists();
      const playlistId = res?.playlist?.id || res?.id;
      if (playlistId) {
        navigate(`/playlist/${playlistId}`);
      }
    } catch (e) {
      alert('Failed to create playlist: ' + e.message);
    } finally {
      setIsCreating(false);
    }
  }

  const navItems = [
    { path: '/', label: 'Home', icon: IconHome },
    { path: '/search', label: 'Search', icon: IconSearch },
    { path: '/library', label: 'Your Library', icon: IconLibrary },
    ...(isAdmin ? [{ path: '/admin', label: 'ניהול מערכת', icon: IconShield }] : []),
    { path: '/settings', label: 'Settings', icon: IconSettings },
  ];

  const handleLogout = () => {
    if (window.confirm('האם ברצונך להתנתק מחשבונך?')) {
      logout();
    }
  };

  return (
    <aside className="desktop-sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand" onClick={() => navigate('/')} role="button" tabIndex={0}>
        <div className="sidebar-brand-icon">
          <span className="brand-bar bar-1"></span>
          <span className="brand-bar bar-2"></span>
          <span className="brand-bar bar-3"></span>
          <span className="brand-bar bar-4"></span>
        </div>
        <div className="sidebar-brand-text">
          <span className="brand-title">Homeify</span>
          <span className="brand-badge">WEB</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <button
              key={item.path}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Playlists Section */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">PLAYLISTS</span>
          <button
            className="sidebar-add-btn"
            onClick={handleCreatePlaylist}
            disabled={isCreating}
            title="Create Playlist"
          >
            <IconPlus size={18} />
          </button>
        </div>

        <div className="sidebar-playlists-list">
          {playlists.length === 0 ? (
            <div className="sidebar-empty">No playlists yet</div>
          ) : (
            playlists.map((pl) => {
              const isActive = location.pathname === `/playlist/${pl.id}`;
              return (
                <button
                  key={pl.id}
                  className={`sidebar-playlist-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(`/playlist/${pl.id}`)}
                >
                  <IconMusic size={16} className="playlist-icon" />
                  <span className="playlist-name">{pl.name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* User Profile & Logout Section */}
      {user && (
        <div className="sidebar-user-card">
          <div
            className="sidebar-user-info"
            onClick={() => navigate('/settings')}
            role="button"
            tabIndex={0}
            title="הגדרות חשבון"
          >
            <div className="sidebar-user-avatar">
              {user.display_name ? user.display_name.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-text">
              <span className="sidebar-user-name">{user.display_name || user.username}</span>
              <span className={`sidebar-user-role-badge ${isAdmin ? 'role-admin' : 'role-user'}`}>
                {isAdmin ? '👑 מנהל' : '👤 משתמש'}
              </span>
            </div>
          </div>
          <button
            className="btn-icon sidebar-logout-btn"
            onClick={handleLogout}
            title="התנתקות מהחשבון"
          >
            <IconLogout size={17} />
          </button>
        </div>
      )}

      {/* Server Status Footer */}
      <div
        className="sidebar-footer"
        onClick={() => navigate('/settings')}
        role="button"
        tabIndex={0}
        title="Server connection details"
      >
        <div className={`status-indicator ${serverOnline ? 'online' : 'offline'}`} />
        <div className="status-info">
          <span className="status-label">
            {serverOnline ? 'Connected' : 'Offline'}
          </span>
          <span className="status-sub">Tailscale 8686</span>
        </div>
      </div>
    </aside>
  );
}
