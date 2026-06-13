import React, { useState, useEffect } from 'react';
import { Building2, Search, Edit2, Ban, Eye } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  status: 'Active' | 'Provisioning' | 'Suspended';
  createdAt: string;
  userCount: number;
}

export const AdminTenantsList: React.FC<{ token: string }> = ({ token }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/tenants', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to fetch tenants');
      }

      const data = await res.json();
      setTenants(data.tenants || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [token]);

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return { bg: 'hsla(142, 72%, 40%, 0.15)', border: 'hsla(142, 72%, 40%, 0.3)', text: 'var(--success)' };
      case 'Provisioning': return { bg: 'hsla(45, 100%, 50%, 0.15)', border: 'hsla(45, 100%, 50%, 0.3)', text: 'var(--warning, #fbbf24)' };
      case 'Suspended': return { bg: 'hsla(0, 84%, 60%, 0.15)', border: 'hsla(0, 84%, 60%, 0.3)', text: 'var(--danger)' };
      default: return { bg: 'hsla(0, 0%, 50%, 0.15)', border: 'hsla(0, 0%, 50%, 0.3)', text: 'var(--text-secondary)' };
    }
  };

  return (
    <div className="admin-smoked-glass-wrapper">
      <div className="glass-card" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.5rem',
        background: 'hsla(0, 0%, 5%, 0.75)', /* Smoked glass darker feel */
        backdropFilter: 'blur(20px)',
        border: '1px solid hsla(0, 0%, 100%, 0.1)',
        padding: '2rem'
      }}>
        <style>
        {`
          .admin-action-btn {
            background: transparent;
            border: 1px solid hsla(0, 0%, 100%, 0.1);
            color: var(--text-primary);
            padding: 0.5rem;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .admin-action-btn:hover {
            background: hsla(0, 0%, 100%, 0.05);
            border-color: hsla(0, 0%, 100%, 0.2);
          }
          .admin-action-btn.danger:hover {
            background: hsla(0, 84%, 60%, 0.15);
            border-color: hsla(0, 84%, 60%, 0.3);
            color: var(--danger);
          }
          .admin-tenant-row {
            transition: background 0.2s ease;
          }
          .admin-tenant-row:hover {
            background: hsla(0, 0%, 100%, 0.03);
          }
        `}
      </style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Building2 size={28} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-heading)', margin: 0, color: 'var(--text-primary)' }}>
              Cross-Tenant Management
            </h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0 }}>
            Monitor and manage all active workspaces across the platform.
          </p>
        </div>
        <div style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ 
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2.5rem',
              borderRadius: '8px',
              border: '1px solid hsla(0, 0%, 100%, 0.1)',
              background: 'hsla(0, 0%, 0%, 0.5)',
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{ 
          padding: '0.75rem', 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgb(239, 68, 68)', 
          color: 'rgb(248, 113, 113)', 
          borderRadius: 'var(--border-radius-md)', 
          fontSize: '0.85rem' 
        }}>
          {error}
        </div>
      )}
      
      <div style={{ 
        overflowX: 'auto',
        maxHeight: '500px',
        overflowY: 'auto',
        borderRadius: '8px',
        border: '1px solid hsla(0, 0%, 100%, 0.1)',
        background: 'hsla(0, 0%, 0%, 0.3)',
        marginTop: '0.5rem'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th style={{ padding: '1rem', borderBottom: '1px solid hsla(0, 0%, 100%, 0.1)', background: 'hsla(0, 0%, 8%, 0.95)', backdropFilter: 'blur(10px)', fontWeight: 600, color: 'var(--text-secondary)' }}>Tenant Name</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid hsla(0, 0%, 100%, 0.1)', background: 'hsla(0, 0%, 8%, 0.95)', backdropFilter: 'blur(10px)', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid hsla(0, 0%, 100%, 0.1)', background: 'hsla(0, 0%, 8%, 0.95)', backdropFilter: 'blur(10px)', fontWeight: 600, color: 'var(--text-secondary)' }}>Users</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid hsla(0, 0%, 100%, 0.1)', background: 'hsla(0, 0%, 8%, 0.95)', backdropFilter: 'blur(10px)', fontWeight: 600, color: 'var(--text-secondary)' }}>Created At</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid hsla(0, 0%, 100%, 0.1)', background: 'hsla(0, 0%, 8%, 0.95)', backdropFilter: 'blur(10px)', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <div className="pulse-dot" style={{ display: 'inline-block', marginRight: '0.5rem', width: '12px', height: '12px' }}></div>
                  Loading tenants data...
                </td>
              </tr>
            ) : filteredTenants.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No tenants found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredTenants.map(tenant => {
                const colors = getStatusColor(tenant.status);
                return (
                  <tr key={tenant.id} className="admin-tenant-row" style={{ borderBottom: '1px solid hsla(0, 0%, 100%, 0.05)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tenant.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: '0.25rem' }}>ID: {tenant.id}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '50px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: colors.bg,
                        border: `1px solid ${colors.border}`,
                        color: colors.text
                      }}>
                        {tenant.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-primary)' }}>{tenant.userCount}</td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button className="admin-action-btn" title="View Details" aria-label={`View details for ${tenant.name}`}>
                          <Eye size={16} />
                        </button>
                        <button className="admin-action-btn" title="Edit Tenant" aria-label={`Edit ${tenant.name}`}>
                          <Edit2 size={16} />
                        </button>
                        <button className="admin-action-btn danger" title="Suspend Tenant" aria-label={`Suspend ${tenant.name}`}>
                          <Ban size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
};
