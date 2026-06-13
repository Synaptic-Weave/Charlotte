import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, User, CheckCircle, AlertCircle } from 'lucide-react';

interface AdminRolesProps {
  token: string;
}

interface UserData {
  id: string;
  email: string;
  role: string;
  tenantName: string;
}

export const AdminRoles: React.FC<AdminRolesProps> = ({ token }) => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/roles', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users. Ensure you have SuperAdmin privileges.');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleRoleChange = async (email: string, newRole: string, userId: string) => {
    try {
      setUpdatingId(userId);
      setError(null);
      setSuccessMsg(null);

      const response = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email, roleType: newRole })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update role.');
      }

      setSuccessMsg(`Role for ${email} updated to ${newRole === 'super_admin' ? 'SuperAdmin' : 'TenantAdmin'}.`);
      
      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, role: newRole } : u
      ));

      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Error updating role.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="admin-smoked-glass" style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="pulse-dot" style={{ width: '16px', height: '16px' }}></div>
      </div>
    );
  }

  return (
    <div className="admin-smoked-glass">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Shield size={28} style={{ color: 'var(--accent-teal)' }} />
        <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-heading)', margin: 0, fontWeight: 600 }}>
          SuperAdmin System Access
        </h2>
      </div>
      
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '2rem' }}>
        Manage platform-wide user roles and administrative privileges.
      </p>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: 'rgb(248, 113, 113)',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: 'rgb(52, 211, 153)',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <CheckCircle size={18} />
          {successMsg}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Tenant</th>
              <th>Current Role</th>
              <th>Assign Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td data-label="User">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ 
                      width: '32px', height: '32px', 
                      borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <User size={16} />
                    </div>
                    <span style={{ fontWeight: 500 }}>{user.email}</span>
                  </div>
                </td>
                <td data-label="Tenant">{user.tenantName}</td>
                <td data-label="Current Role">
                  {user.role === 'super_admin' ? (
                    <span style={{ 
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', 
                      padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600
                    }}>
                      <ShieldAlert size={12} />
                      SuperAdmin
                    </span>
                  ) : (
                    <span style={{ 
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', 
                      padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600
                    }}>
                      <Shield size={12} />
                      TenantAdmin
                    </span>
                  )}
                </td>
                <td data-label="Assign Role">
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select 
                      className="admin-select"
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.email, e.target.value, user.id)}
                      disabled={updatingId === user.id}
                    >
                      <option value="tenant_admin">TenantAdmin</option>
                      <option value="super_admin">SuperAdmin</option>
                    </select>
                    {updatingId === user.id && (
                      <div className="pulse-dot" style={{ width: '8px', height: '8px' }}></div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.5)' }}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
