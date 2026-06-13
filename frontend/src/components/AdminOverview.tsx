import React, { useState, useEffect } from 'react';
import { Activity, Server, Users, PhoneCall, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Stats {
  totalTenants: number;
  totalNumbers: number;
  latencyAverage: number;
}

interface LiveCall {
  id: string;
  callSid: string;
  status: string;
  callerNumber: string;
  tenant: { id: string; name: string } | null;
  createdAt: string;
}

// Custom hook for KPI counter animation
function useCountUp(endValue: number, duration: number = 1000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(easeOut * endValue));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [endValue, duration]);

  return count;
}

export const AdminOverview: React.FC<{ token: string }> = ({ token }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverviewData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsRes, callsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/calls/live', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!statsRes.ok) throw new Error('Failed to fetch stats');
      if (!callsRes.ok) throw new Error('Failed to fetch live calls');

      const statsData = await statsRes.json();
      const callsData = await callsRes.json();

      setStats(statsData);
      setLiveCalls(callsData);
    } catch (err: any) {
      setError(err.message || 'Error loading dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
    const interval = setInterval(fetchOverviewData, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [token]);

  // Animated values
  const totalTenantsAnimated = useCountUp(stats?.totalTenants || 0);
  const totalNumbersAnimated = useCountUp(stats?.totalNumbers || 0);
  const latencyAnimated = useCountUp(stats?.latencyAverage || 0);

  if (loading && !stats) {
    return (
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="pulse-dot" style={{ width: '20px', height: '20px', margin: '0 auto 1rem' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading Global Metrics...</p>
      </div>
    );
  }

  return (
    <div className="admin-smoked-glass-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-heading)', margin: 0, color: 'var(--text-primary)' }}>
            Global System Overview
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Real-time platform metrics and tenant activity monitoring.
          </p>
        </div>
        <div className="status-badge">
          <span className="pulse-dot"></span> System Operational
        </div>
      </div>

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

      {/* KPI COUNTERS */}
      <section className="metric-grid">
        <div className="glass-card metric-card interactive" style={{ background: 'hsla(0, 0%, 5%, 0.75)', border: '1px solid hsla(0, 0%, 100%, 0.1)' }}>
          <div className="metric-info">
            <span className="metric-label">Total Tenants</span>
            <span className="metric-value">{totalTenantsAnimated}</span>
            <span className="metric-trend trend-up">↑ 3% this week</span>
          </div>
          <div className="metric-icon-wrapper" style={{ background: 'hsla(239, 84%, 67%, 0.15)', color: 'var(--accent-indigo)', boxShadow: 'inset 0 0 10px hsla(239, 84%, 67%, 0.2)' }}>
            <Users size={22} />
          </div>
        </div>

        <div className="glass-card metric-card interactive" style={{ background: 'hsla(0, 0%, 5%, 0.75)', border: '1px solid hsla(0, 0%, 100%, 0.1)' }}>
          <div className="metric-info">
            <span className="metric-label">Provisioned Numbers</span>
            <span className="metric-value">{totalNumbersAnimated}</span>
            <span className="metric-trend trend-up">Active pool</span>
          </div>
          <div className="metric-icon-wrapper" style={{ background: 'hsla(172, 77%, 42%, 0.15)', color: 'var(--accent-teal)', boxShadow: 'inset 0 0 10px hsla(172, 77%, 42%, 0.2)' }}>
            <PhoneCall size={22} />
          </div>
        </div>

        <div className="glass-card metric-card interactive" style={{ background: 'hsla(0, 0%, 5%, 0.75)', border: '1px solid hsla(0, 0%, 100%, 0.1)' }}>
          <div className="metric-info">
            <span className="metric-label">Global AI Latency</span>
            <span className="metric-value">{latencyAnimated}ms</span>
            <span className="metric-trend trend-down">↓ Optimal performance</span>
          </div>
          <div className="metric-icon-wrapper" style={{ background: 'hsla(142, 72%, 40%, 0.15)', color: 'var(--success)', boxShadow: 'inset 0 0 10px hsla(142, 72%, 40%, 0.2)' }}>
            <Activity size={22} />
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        
        {/* SVG AREA CHART: Platform Traffic */}
        <div className="glass-card" style={{ background: 'hsla(0, 0%, 5%, 0.75)', border: '1px solid hsla(0, 0%, 100%, 0.1)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Global Call Volume (24h)</h3>
          <div style={{ width: '100%', height: '200px', position: 'relative' }}>
            {/* Synthetic SVG Area Chart */}
            <svg viewBox="0 0 400 200" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-teal)" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="var(--accent-teal)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path 
                d="M 0 150 C 50 120, 100 160, 150 100 C 200 40, 250 80, 300 60 C 350 40, 380 90, 400 70 L 400 200 L 0 200 Z" 
                fill="url(#areaGradient)" 
              />
              <path 
                d="M 0 150 C 50 120, 100 160, 150 100 C 200 40, 250 80, 300 60 C 350 40, 380 90, 400 70" 
                fill="none" 
                stroke="var(--accent-teal)" 
                strokeWidth="3" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            </svg>
            <div style={{ position: 'absolute', top: '10%', right: '10%', background: 'hsla(0,0%,0%,0.5)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Peak: 342 calls/hr
            </div>
          </div>
        </div>

        {/* RECENT SYSTEM ALERTS */}
        <div className="glass-card" style={{ background: 'hsla(0, 0%, 5%, 0.75)', border: '1px solid hsla(0, 0%, 100%, 0.1)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={18} style={{ color: 'var(--text-secondary)' }} />
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Recent System Alerts</h3>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <CheckCircle2 size={16} style={{ color: 'var(--success)', marginTop: '2px' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Database Backup Completed</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>2 hours ago</p>
              </div>
            </li>
            <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ color: 'var(--warning)', marginTop: '2px' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>High API Latency Detected (US-East)</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>5 hours ago • Resolved</p>
              </div>
            </li>
            <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <CheckCircle2 size={16} style={{ color: 'var(--success)', marginTop: '2px' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>New Node Deployed</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Yesterday</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* LIVE CALLS & TOP TENANTS */}
      <div className="glass-card" style={{ background: 'hsla(0, 0%, 5%, 0.75)', border: '1px solid hsla(0, 0%, 100%, 0.1)', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0' }}>Top Active Tenants (Live AI Calls)</h3>
        
        <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Call ID</th>
                <th>Tenant Name</th>
                <th>Caller</th>
                <th>Status</th>
                <th>Time Elapsed</th>
              </tr>
            </thead>
            <tbody>
              {liveCalls.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    No live calls active at the moment.
                  </td>
                </tr>
              ) : (
                liveCalls.map(call => (
                  <tr key={call.id}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {call.id.substring(0, 8)}...
                    </td>
                    <td style={{ fontWeight: 600 }}>{call.tenant?.name || 'Unknown'}</td>
                    <td>{call.callerNumber}</td>
                    <td>
                      <span className="badge-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--success)', fontSize: '0.8rem', background: 'hsla(142,72%,40%,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        <span className="pulse-dot" style={{ width: '6px', height: '6px' }}></span> {call.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {new Date(call.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
