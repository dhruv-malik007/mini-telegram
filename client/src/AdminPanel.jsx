import { useState, useEffect } from 'react';
import { getAdminUsers, deleteUser, deleteConversationAsAdmin, setUserAdmin } from './api';
import './AdminPanel.css';

export default function AdminPanel({ currentUser, onClose, onUsersChange }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConvUserId, setDeleteConvUserId] = useState('');
  const [deleteConvOtherId, setDeleteConvOtherId] = useState('');

  const loadUsers = () => {
    getAdminUsers()
      .then(setUsers)
      .catch((e) => {
        setError(e.message || 'Failed to load');
        setUsers([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleDeleteUser = async (id) => {
    setError('');
    if (id === currentUser.id) {
      setError('You cannot delete your own account.');
      return;
    }
    if (!window.confirm('Permanently delete this user and all their messages? This cannot be undone.')) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      onUsersChange?.();
    } catch (e) {
      setError(e.message || 'Failed to delete user');
    }
  };

  const handleMakeAdmin = async (id) => {
    setError('');
    try {
      await setUserAdmin(id);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, is_admin: true } : u)));
      onUsersChange?.();
    } catch (e) {
      setError(e.message || 'Failed to promote');
    }
  };

  const handleDeleteConversation = async () => {
    setError('');
    const a = parseInt(deleteConvUserId, 10);
    const b = parseInt(deleteConvOtherId, 10);
    if (!a || !b || a === b) {
      setError('Select two different users.');
      return;
    }
    if (!window.confirm('Delete all messages between these two users? This cannot be undone.')) return;
    try {
      await deleteConversationAsAdmin(a, b);
      setError('');
      setDeleteConvUserId('');
      setDeleteConvOtherId('');
    } catch (e) {
      setError(e.message || 'Failed');
    }
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="admin-dashboard-loading">Loading dashboard…</div>
      </div>
    );
  }

  const adminCount = users.filter((u) => u.is_admin).length;

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard-header">
        <div className="admin-dashboard-title">
          <h1>Admin dashboard</h1>
          <p className="admin-dashboard-subtitle">Manage users and conversations. You can delete any user (except yourself) and any conversation.</p>
        </div>
        <button type="button" className="admin-dashboard-close" onClick={onClose}>Close</button>
      </header>

      {error && (
        <div className="admin-dashboard-error">
          {error}
          <button type="button" className="admin-dashboard-error-dismiss" onClick={() => setError('')}>×</button>
        </div>
      )}

      <div className="admin-dashboard-stats">
        <div className="admin-stat-card">
          <span className="admin-stat-value">{users.length}</span>
          <span className="admin-stat-label">Total users</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-value">{adminCount}</span>
          <span className="admin-stat-label">Admins</span>
        </div>
      </div>

      <section className="admin-dashboard-section">
        <h2>User management</h2>
        <p className="admin-section-desc">Delete any user or promote them to admin. Your own account cannot be deleted here.</p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Role</th>
                <th className="admin-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.id === currentUser.id ? 'admin-table-row-you' : ''}>
                  <td>
                    <span className="admin-table-name">{u.display_name || u.username}</span>
                    {u.id === currentUser.id && <span className="admin-table-you"> (you)</span>}
                  </td>
                  <td>@{u.username}</td>
                  <td>
                    {u.is_admin ? <span className="admin-badge">Admin</span> : <span className="admin-role-regular">User</span>}
                  </td>
                  <td className="admin-table-actions">
                    {!u.is_admin && (
                      <button type="button" className="admin-btn admin-btn-promote" onClick={() => handleMakeAdmin(u.id)}>Make admin</button>
                    )}
                    {u.id !== currentUser.id ? (
                      <button type="button" className="admin-btn admin-btn-danger" onClick={() => handleDeleteUser(u.id)}>Delete user</button>
                    ) : (
                      <span className="admin-table-no-action">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-dashboard-section">
        <h2>Delete conversation</h2>
        <p className="admin-section-desc">Remove all messages between two users. Both users will see an empty chat.</p>
        <div className="admin-delete-conv">
          <select value={deleteConvUserId} onChange={(e) => setDeleteConvUserId(e.target.value)}>
            <option value="">Select user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.display_name || u.username} (@{u.username})</option>
            ))}
          </select>
          <span className="admin-delete-conv-between">and</span>
          <select value={deleteConvOtherId} onChange={(e) => setDeleteConvOtherId(e.target.value)}>
            <option value="">Select user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.display_name || u.username} (@{u.username})</option>
            ))}
          </select>
          <button type="button" className="admin-btn admin-btn-danger" onClick={handleDeleteConversation}>Delete conversation</button>
        </div>
      </section>
    </div>
  );
}
