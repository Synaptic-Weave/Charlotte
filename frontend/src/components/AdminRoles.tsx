import React, { useState, useEffect } from 'react';
import { Users, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

interface Role {
  id: string;
  name: string;
  displayName: string;
}

interface User {
  id: string;
  email: string;
  tenant: { id: string, name: string } | null;
  roles: Role[];
}

export const AdminRoles: React.FC<{ token: string }> = ({ token }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const rolesRes = await fetch('/api/admin/roles', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!rolesRes.ok) throw new Error('Failed to fetch roles');
      const rolesData = await rolesRes.json();
      setRoles(rolesData);

      const usersRes = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!usersRes.ok) throw new Error('Failed to fetch users');
      const usersData = await usersRes.json();
      setUsers(usersData);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleAssignRole = async (userId: string, roleId: string) => {
    try {
      setError(null);
      setSuccess(null);
      const res = await fetch(`/api/admin/users/${userId}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ roleId })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to assign role');
      }

      setSuccess('Role assigned successfully.');
      fetchData(); // Refresh list to reflect changes
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="pulse-dot" style={{ width: '20px', height: '20px', margin: '0 auto 1rem' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading Admin Data...</p>
      </div>
    );
  }

  return (
    <div className="admin-smoked-glass-wrapper">
      <div className="glass-card" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.5rem',
        background: 'hsla(0, 0%, 5%, 0.75)', /* Smoked glass darker feel */
        backdropFilter: 'blur(20px)',
        border: '1px solid hsla(0, 0%, 100%, 0.1)'
      }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <ShieldAlert size={28} style={{ color: 'var(--danger)' }} />
          <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-heading)', margin: 0, color: 'var(--text-primary)' }}>
            Super Admin Controls
          </h2>
        </div>
        
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Manage global user access and assign platform-wide roles like SuperAdmin and TenantAdmin.
        </p>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgb(239, 68, 68)',
            color: 'rgb(248, 113, 113)',
            padding: '0.75rem',
            borderRadius: 'var(--border-radius-md)',
            fontSize: '0.85rem'
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgb(16, 185, 129)',
            color: 'rgb(52, 211, 153)',
            padding: '0.75rem',
            borderRadius: 'var(--border-radius-md)',
            fontSize: '0.85rem'
          }}>
            {success}
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--card-border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem 0.5rem', fontWeight: 600 }}>User Email</th>
                <th style={{ padding: '1rem 0.5rem', fontWeight: 600 }}>Tenant</th>
                <th style={{ padding: '1rem 0.5rem', fontWeight: 600 }}>Current Roles</th>
                <th style={{ padding: '1rem 0.5rem', fontWeight: 600 }}>Assign Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid hsla(0,0%,100%,0.05)' }}>
                  <td style={{ padding: '1rem 0.5rem', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={16} />
                      {user.email}
                    </div>
                  </td>
                  <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>
                    {user.tenant ? user.tenant.name : 'N/A'}
                  </td>
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {user.roles.length > 0 ? user.roles.map(r => (
                        <span key={r.id} style={{
                          background: r.name === 'SuperAdmin' ? 'hsla(0, 84%, 60%, 0.15)' : 'var(--input-bg)',
                          color: r.name === 'SuperAdmin' ? 'var(--danger)' : 'var(--accent-teal)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          {r.name === 'SuperAdmin' ? <ShieldCheck size={12}/> : <Shield size={12}/>}
                          {r.displayName}
                        </span>
                      )) : <span style={{ color: 'var(--neutral-gray)' }}>No Roles</span>}
                    </div>
                  </td>
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {roles.map(role => {
                        const hasRole = user.roles.some(r => r.id === role.id);
                        if (hasRole) return null;
                        
                        return (
                          <button
                            key={role.id}
                            onClick={() => handleAssignRole(user.id, role.id)}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--accent-teal)',
                              color: 'var(--accent-teal)',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-teal)'; e.currentTarget.style.color = '#fff'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent-teal)'; }}
                          >
                            + {role.displayName}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
