import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import api from '../api/client';
import { formatDuration } from '../utils/format';
import {
  IconShield,
  IconUser,
  IconPlus,
  IconEdit,
  IconDelete,
  IconLock,
  IconEye,
  IconEyeOff,
  IconClose,
  IconMusic,
  IconHistory,
  IconRefresh,
} from '../components/common/Icons';

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ total_users: 0, total_playlists: 0, total_songs: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success'|'error', text: '' }

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [playlistModalUser, setPlaylistModalUser] = useState(null);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [isPlaylistsLoading, setIsPlaylistsLoading] = useState(false);
  const [historyModalUser, setHistoryModalUser] = useState(null);
  const [userHistory, setUserHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Form States for Create User
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createRole, setCreateRole] = useState('user');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Form States for Edit User
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('user');
  const [editIsActive, setEditIsActive] = useState(true);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Form States for Admin Creating Playlist for User
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [isCreatingPl, setIsCreatingPl] = useState(false);

  // Guard: strictly redirect if not admin
  useEffect(() => {
    if (!isAdmin) {
      navigate('/', { replace: true });
    }
  }, [isAdmin, navigate]);

  const loadUsersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.adminGetUsers();
      setUsers(data?.users || []);
      setStats({
        total_users: data?.total_users || 0,
        total_playlists: data?.total_playlists || 0,
        total_songs: data?.total_songs || 0,
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'טעינת משתמשים נכשלה: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsersData();
    }
  }, [isAdmin, loadUsersData]);

  const showToast = (text, type = 'success') => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // ─── Handle Create User ───
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!createUsername.trim() || !createPassword) {
      alert('נא למלא שם משתמש וסיסמה');
      return;
    }

    setIsCreatingUser(true);
    try {
      const res = await api.adminCreateUser({
        username: createUsername.trim(),
        password: createPassword,
        display_name: createDisplayName.trim(),
        role: createRole,
      });
      showToast(`משתמש ${res.user.username} נוצר בהצלחה!`);
      setIsCreateModalOpen(false);
      setCreateUsername('');
      setCreatePassword('');
      setCreateDisplayName('');
      setCreateRole('user');
      await loadUsersData();
    } catch (err) {
      alert('שגיאה ביצירת משתמש: ' + err.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  // ─── Handle Edit User ───
  const openEditModal = (u) => {
    setEditingUser(u);
    setEditUsername(u.username);
    setEditDisplayName(u.display_name || '');
    setEditPassword('');
    setEditRole(u.role || 'user');
    setEditIsActive(u.is_active !== false);
    setShowEditPassword(false);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSavingUser(true);
    try {
      const payload = {
        username: editUsername.trim(),
        display_name: editDisplayName.trim(),
        role: editRole,
        is_active: editIsActive,
      };
      if (editPassword) {
        payload.password = editPassword;
      }

      await api.adminUpdateUser(editingUser.id, payload);
      showToast(`הפרטים של ${editUsername} עודכנו בהצלחה!`);
      setEditingUser(null);
      await loadUsersData();
    } catch (err) {
      alert('שגיאה בעדכון משתמש: ' + err.message);
    } finally {
      setIsSavingUser(false);
    }
  };

  // ─── Handle Delete User ───
  const handleDeleteUser = async (u) => {
    if (u.id === user?.id) {
      alert('לא ניתן למחוק את חשבון המנהל שבו אתה מחובר כרגע!');
      return;
    }

    const confirmDel = window.confirm(
      `האם אתה בטוח שברצונך למחוק לצמיתות את המשתמש ${u.username}? כל הפלייליסטים והנתונים שלו יימחקו!`
    );
    if (!confirmDel) return;

    try {
      await api.adminDeleteUser(u.id);
      showToast(`המשתמש ${u.username} נמחק בהצלחה`);
      await loadUsersData();
    } catch (err) {
      alert('שגיאה במחיקת משתמש: ' + err.message);
    }
  };

  // ─── Handle Playlists Management ───
  const openPlaylistsModal = async (u) => {
    setPlaylistModalUser(u);
    setIsPlaylistsLoading(true);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    try {
      const data = await api.adminGetUserPlaylists(u.id);
      setUserPlaylists(data?.playlists || []);
    } catch (err) {
      alert('שגיאה בשליפת פלייליסטים: ' + err.message);
    } finally {
      setIsPlaylistsLoading(false);
    }
  };

  const handleCreatePlaylistForUser = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim() || !playlistModalUser) return;

    setIsCreatingPl(true);
    try {
      await api.adminCreateUserPlaylist(playlistModalUser.id, {
        name: newPlaylistName.trim(),
        description: newPlaylistDesc.trim(),
      });
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      const data = await api.adminGetUserPlaylists(playlistModalUser.id);
      setUserPlaylists(data?.playlists || []);
      showToast('פלייליסט נוצר בהצלחה!');
      loadUsersData();
    } catch (err) {
      alert('שגיאה ביצירת פלייליסט: ' + err.message);
    } finally {
      setIsCreatingPl(false);
    }
  };

  const handleDeletePlaylist = async (playlistId, playlistName) => {
    const confirmDel = window.confirm(`למחוק את הפלייליסט "${playlistName}"?`);
    if (!confirmDel) return;

    try {
      await api.adminDeletePlaylist(playlistId);
      setUserPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
      showToast('הפלייליסט נמחק');
      loadUsersData();
    } catch (err) {
      alert('שגיאה במחיקת פלייליסט: ' + err.message);
    }
  };

  const handleRemoveSongFromPlaylist = async (playlistId, songId) => {
    try {
      await api.adminRemoveSongFromPlaylist(playlistId, songId);
      setUserPlaylists((prev) =>
        prev.map((p) => {
          if (p.id !== playlistId) return p;
          return {
            ...p,
            songs: (p.songs || []).filter((s) => s.id !== songId),
            song_count: Math.max(0, (p.song_count || 1) - 1),
          };
        })
      );
      showToast('השיר הוסר מהפלייליסט');
    } catch (err) {
      alert('שגיאה בהסרת שיר: ' + err.message);
    }
  };

  // ─── Handle History Inspection ───
  const openHistoryModal = async (u) => {
    setHistoryModalUser(u);
    setIsHistoryLoading(true);
    try {
      const data = await api.adminGetUserDetails(u.id);
      setUserHistory(data?.user?.recent_history || []);
    } catch (err) {
      alert('שגיאה בשליפת היסטוריה: ' + err.message);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // Filter users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.username?.toLowerCase().includes(q) ||
      (u.display_name && u.display_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page admin-page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="text-display" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IconShield size={28} style={{ color: 'var(--accent)' }} />
              מסך ניהול מערכת (Admin Dashboard)
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              ניהול משתמשים מלא, הרשאות, פלייליסטים והגדרות אבטחה
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary" onClick={loadUsersData} title="רענן נתונים">
              <IconRefresh size={16} />
              <span>רענן</span>
            </button>
            <button
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => setIsCreateModalOpen(true)}
            >
              <IconPlus size={18} />
              <span>צור משתמש חדש</span>
            </button>
          </div>
        </div>
      </div>

      {/* Status Alert Toast */}
      {statusMessage && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: 20,
            borderRadius: 'var(--radius-md)',
            background: statusMessage.type === 'error' ? 'rgba(231, 76, 60, 0.2)' : 'rgba(29, 185, 84, 0.2)',
            border: `1px solid ${statusMessage.type === 'error' ? 'rgba(231, 76, 60, 0.4)' : 'rgba(29, 185, 84, 0.4)'}`,
            color: statusMessage.type === 'error' ? '#e74c3c' : 'var(--accent)',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Metrics Bar */}
      <div className="admin-metrics-grid">
        <div className="admin-metric-card glass-card">
          <div className="metric-icon" style={{ color: 'var(--accent)' }}>
            <IconUser size={26} />
          </div>
          <div className="metric-data">
            <span className="metric-value">{stats.total_users}</span>
            <span className="metric-title">משתמשים רשומים</span>
          </div>
        </div>

        <div className="admin-metric-card glass-card">
          <div className="metric-icon" style={{ color: '#f59e0b' }}>
            <IconShield size={26} />
          </div>
          <div className="metric-data">
            <span className="metric-value">{users.filter((u) => u.role === 'admin').length}</span>
            <span className="metric-title">מנהלי מערכת</span>
          </div>
        </div>

        <div className="admin-metric-card glass-card">
          <div className="metric-icon" style={{ color: '#38bdf8' }}>
            <IconMusic size={26} />
          </div>
          <div className="metric-data">
            <span className="metric-value">{stats.total_playlists}</span>
            <span className="metric-title">פלייליסטים במערכת</span>
          </div>
        </div>

        <div className="admin-metric-card glass-card">
          <div className="metric-icon" style={{ color: '#a855f7' }}>
            <IconHistory size={26} />
          </div>
          <div className="metric-data">
            <span className="metric-value">{stats.total_songs}</span>
            <span className="metric-title">שירים בספרייה</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="admin-filter-bar">
        <input
          type="text"
          className="form-input"
          placeholder="חיפוש משתמש לפי שם או כינוי..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          נמצאו {filteredUsers.length} משתמשים
        </span>
      </div>

      {/* Users Management Grid */}
      {isLoading ? (
        <div className="admin-users-loading">
          <div className="loading-spinner" style={{ width: 32, height: 32 }} />
          <p>טוען נתוני משתמשים...</p>
        </div>
      ) : (
        <div className="admin-users-grid">
          {filteredUsers.map((u) => {
            const isMe = u.id === user?.id;
            const isUserAdmin = u.role === 'admin';

            return (
              <div key={u.id} className="admin-user-card glass-card">
                {/* User Header */}
                <div className="user-card-header">
                  <div className="user-avatar-circle">
                    {u.display_name ? u.display_name.charAt(0).toUpperCase() : u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-titles">
                    <div className="user-card-displayname">
                      {u.display_name || u.username}
                      {isMe && <span className="badge-me">אתה</span>}
                    </div>
                    <div className="user-card-username">@{u.username}</div>
                  </div>

                  {/* Badges */}
                  <div className="user-badges">
                    <span className={`role-badge ${isUserAdmin ? 'badge-admin' : 'badge-user'}`}>
                      {isUserAdmin ? '👑 מנהל' : '👤 משתמש'}
                    </span>
                    <span className={`status-badge ${u.is_active ? 'active' : 'disabled'}`}>
                      {u.is_active ? 'פעיל' : 'מושבת'}
                    </span>
                  </div>
                </div>

                {/* User Stats */}
                <div className="user-card-stats">
                  <div className="stat-pill">
                    <span className="stat-count">{u.playlist_count || 0}</span>
                    <span className="stat-name">פלייליסטים</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-count">{u.play_count || 0}</span>
                    <span className="stat-name">השמעות</span>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="user-card-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEditModal(u)}
                    title="ערוך פרטי משתמש, סיסמה והרשאות"
                  >
                    <IconEdit size={15} />
                    <span>ערוך הכל</span>
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openPlaylistsModal(u)}
                    title="נהל פלייליסטים ושירים של משתמש זה"
                  >
                    <IconMusic size={15} />
                    <span>פלייליסטים</span>
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openHistoryModal(u)}
                    title="צפה בהיסטוריית השירים שהאזין להם"
                  >
                    <IconHistory size={15} />
                    <span>היסטוריה</span>
                  </button>

                  {!isMe && (
                    <button
                      className="btn-icon btn-danger-icon"
                      onClick={() => handleDeleteUser(u)}
                      title="מחק משתמש לצמיתות"
                    >
                      <IconDelete size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════ MODAL: CREATE USER ═══════════════ */}
      {isCreateModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconPlus size={20} />
                יצירת משתמש חדש
              </h3>
              <button className="btn-icon" onClick={() => setIsCreateModalOpen(false)}>
                <IconClose size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="modal-form">
              <div className="form-group">
                <label className="form-label">שם משתמש (באנגלית / ספרות)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="למשל: david"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">שם תצוגה (אופציונלי)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="למשל: דוד לוי"
                  value={createDisplayName}
                  onChange={(e) => setCreateDisplayName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">סיסמה ראשונית</label>
                <div className="input-with-icon">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="לפחות 4 תווים..."
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="btn-icon password-toggle-btn"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    tabIndex={-1}
                  >
                    {showCreatePassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">תפקיד במערכת</label>
                <select
                  className="form-input"
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                >
                  <option value="user">משתמש רגיל (ספרייה ופלייליסטים אישיים בלבד)</option>
                  <option value="admin">מנהל מערכת (Admin - גישה מלאה למסך הניהול)</option>
                </select>
              </div>

              <div className="modal-actions" style={{ marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateModalOpen(false)}>
                  ביטול
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreatingUser}>
                  {isCreatingUser ? 'יוצר משתמש...' : 'צור משתמש'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: EDIT USER ═══════════════ */}
      {editingUser && (
        <div className="modal-backdrop" onClick={() => setEditingUser(null)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconEdit size={20} />
                עריכת משתמש: {editingUser.username}
              </h3>
              <button className="btn-icon" onClick={() => setEditingUser(null)}>
                <IconClose size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="modal-form">
              <div className="form-group">
                <label className="form-label">שם משתמש</label>
                <input
                  type="text"
                  className="form-input"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">שם תצוגה</label>
                <input
                  type="text"
                  className="form-input"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">איפוס סיסמה ישיר (השאר ריק אם אין שינוי)</label>
                <div className="input-with-icon">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="הזן סיסמה חדשה..."
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-icon password-toggle-btn"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    tabIndex={-1}
                  >
                    {showEditPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">תפקיד</label>
                <select
                  className="form-input"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  disabled={editingUser.id === user?.id}
                >
                  <option value="user">משתמש רגיל</option>
                  <option value="admin">מנהל מערכת (Admin)</option>
                </select>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <input
                  type="checkbox"
                  id="userActiveCheck"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  disabled={editingUser.id === user?.id}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <label htmlFor="userActiveCheck" style={{ cursor: 'pointer', fontSize: '0.875rem' }}>
                  חשבון פעיל (בטל סימון להשבתת המשתמש מלהתחבר)
                </label>
              </div>

              <div className="modal-actions" style={{ marginTop: 24 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingUser(null)}>
                  ביטול
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingUser}>
                  {isSavingUser ? 'שומר שינויים...' : 'שמור שינויים'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: USER PLAYLISTS ═══════════════ */}
      {playlistModalUser && (
        <div className="modal-backdrop" onClick={() => setPlaylistModalUser(null)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconMusic size={20} />
                  פלייליסטים של {playlistModalUser.display_name || playlistModalUser.username}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  ניהול, עריכה ומחיקת פלייליסטים ושירים עבור משתמש זה
                </span>
              </div>
              <button className="btn-icon" onClick={() => setPlaylistModalUser(null)}>
                <IconClose size={20} />
              </button>
            </div>

            {/* Create Playlist Form for User */}
            <form onSubmit={handleCreatePlaylistForUser} style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder="שם פלייליסט חדש..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                style={{ flex: 1, minWidth: 160 }}
                required
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={isCreatingPl}>
                {isCreatingPl ? 'יוצר...' : 'הוסף פלייליסט'}
              </button>
            </form>

            {/* Playlists List */}
            {isPlaylistsLoading ? (
              <div style={{ textAlign: 'center', padding: 24 }}>טוען פלייליסטים...</div>
            ) : userPlaylists.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                למשתמש זה עדיין אין פלייליסטים
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {userPlaylists.map((pl) => (
                  <div
                    key={pl.id}
                    style={{
                      padding: 12,
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderRadius: 8,
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                          {pl.is_favorites ? '💚 ' : '📁 '}
                          {pl.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {pl.song_count} שירים
                        </div>
                      </div>

                      {!pl.is_favorites && (
                        <button
                          className="btn-icon btn-danger-icon"
                          onClick={() => handleDeletePlaylist(pl.id, pl.name)}
                          title="מחק פלייליסט זה"
                        >
                          <IconDelete size={16} />
                        </button>
                      )}
                    </div>

                    {/* Songs in this playlist */}
                    {pl.songs && pl.songs.length > 0 && (
                      <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6 }}>
                        {pl.songs.slice(0, 10).map((s) => (
                          <div
                            key={s.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '4px 0',
                              fontSize: '0.8125rem',
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                              🎵 {s.title} - <span style={{ color: 'var(--text-secondary)' }}>{s.artist}</span>
                            </span>
                            <button
                              className="btn-icon"
                              onClick={() => handleRemoveSongFromPlaylist(pl.id, s.id)}
                              title="הסר שיר מפלייליסט"
                              style={{ width: 22, height: 22 }}
                            >
                              <IconClose size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: USER HISTORY ═══════════════ */}
      {historyModalUser && (
        <div className="modal-backdrop" onClick={() => setHistoryModalUser(null)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconHistory size={20} />
                היסטוריית השמעות: {historyModalUser.display_name || historyModalUser.username}
              </h3>
              <button className="btn-icon" onClick={() => setHistoryModalUser(null)}>
                <IconClose size={20} />
              </button>
            </div>

            {isHistoryLoading ? (
              <div style={{ textAlign: 'center', padding: 24 }}>טוען היסטוריה...</div>
            ) : userHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                אין עדיין השמעות מוקלטות עבור משתמש זה
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                {userHistory.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{h.song?.title || 'Unknown Song'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{h.song?.artist}</div>
                    </div>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                      {h.played_at ? new Date(h.played_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
