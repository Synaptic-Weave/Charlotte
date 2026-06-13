import React, { useState, useEffect } from 'react';
import './SystemMetrics.css';
import { Users, AlertTriangle } from 'lucide-react';

const SVGDefs = () => (
  <svg style={{ width: 0, height: 0, position: 'absolute' }} aria-hidden="true">
    <defs>
      <linearGradient id="gradientPrimary" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="rgba(59, 130, 246, 0.4)" />
        <stop offset="100%" stopColor="rgba(59, 130, 246, 0.0)" />
      </linearGradient>
      <linearGradient id="gradientSuccess" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="rgba(16, 185, 129, 0.4)" />
        <stop offset="100%" stopColor="rgba(16, 185, 129, 0.0)" />
      </linearGradient>
      <linearGradient id="gradientWarning" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="rgba(245, 158, 11, 0.4)" />
        <stop offset="100%" stopColor="rgba(245, 158, 11, 0.0)" />
      </linearGradient>
    </defs>
  </svg>
);

const MiniChart = ({ colorClass = 'glow-path-primary', pathD = '' }: { colorClass?: string, pathD?: string }) => (
  <div className="chart-container">
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <path className={colorClass} d={pathD} />
    </svg>
  </div>
);

const KPICard = ({ title, value, trend, isPositive, pathD, colorClass }: { title: string, value: string | number, trend: string, isPositive: boolean, pathD: string, colorClass: string }) => (
  <div className="glass-card">
    <div className="kpi-title">{title}</div>
    <div className="kpi-value animate-value">
      {value}
      {trend && (
        <span className={`kpi-trend ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? '↑' : '↓'} {trend}
        </span>
      )}
    </div>
    <MiniChart colorClass={colorClass} pathD={pathD} />
  </div>
);

const CallVolumeAreaChart = () => {
  const areaPath = "M0,180 L100,150 L200,160 L300,120 L400,90 L500,100 L600,60 L700,40 L800,50 L800,200 L0,200 Z";
  const linePath = "M0,180 L100,150 L200,160 L300,120 L400,90 L500,100 L600,60 L700,40 L800,50";
  
  const points = [
    { cx: 0, cy: 180 }, { cx: 100, cy: 150 }, { cx: 200, cy: 160 },
    { cx: 300, cy: 120 }, { cx: 400, cy: 90 }, { cx: 500, cy: 100 },
    { cx: 600, cy: 60 }, { cx: 700, cy: 40 }, { cx: 800, cy: 50 }
  ];

  return (
    <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
      <div className="kpi-title">7-Day Call Volume</div>
      <div className="kpi-value animate-value">124.5k <span className="kpi-trend positive">↑ 12%</span></div>
      <div className="large-chart-container">
        <svg viewBox="0 0 800 200" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <line x1="0" y1="50" x2="800" y2="50" className="grid-line" />
          <line x1="0" y1="100" x2="800" y2="100" className="grid-line" />
          <line x1="0" y1="150" x2="800" y2="150" className="grid-line" />
          <path className="area-fill-primary" d={areaPath} />
          <path className="glow-path-primary" d={linePath} />
          {points.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r="4" className="data-point" />
          ))}
        </svg>
      </div>
    </div>
  );
};

export const AdminOverview: React.FC<{ token: string }> = ({ token }) => {
  const [stats, setStats] = useState<any>(null);
  const [liveCalls, setLiveCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, callsRes] = await Promise.all([
          fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch('/api/admin/calls/live', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
        
        if (callsRes.ok) {
          const callsData = await callsRes.json();
          setLiveCalls(callsData || []);
        }
      } catch (err) {
        console.error('Error fetching admin data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [token]);

  // Aggregate active calls by tenant
  const tenantCounts = liveCalls.reduce((acc: any, call: any) => {
    const tName = call.tenant?.name || 'Unknown Tenant';
    acc[tName] = (acc[tName] || 0) + 1;
    return acc;
  }, {});

  const topTenants = Object.entries(tenantCounts)
    .sort(([, a]: any, [, b]: any) => b - a)
    .slice(0, 5);

  const activeCallCount = liveCalls.length;
  
  if (loading && !stats) {
    return <div className="system-metrics-container"><div className="pulse-dot"></div></div>;
  }

  return (
    <div className="system-metrics-container" style={{ animation: 'modalScaleUp 0.3s ease' }}>
      <SVGDefs />
      
      <div className="kpi-grid">
        <KPICard 
          title="Total Tenants" 
          value={stats?.totalTenants || 0} 
          trend="8.2%" 
          isPositive={true} 
          pathD="M0,25 L20,20 L40,22 L60,15 L80,18 L100,5"
          colorClass="glow-path-success"
        />
        <KPICard 
          title="Provisioned Numbers" 
          value={stats?.totalNumbers || 0} 
          trend="5.1%" 
          isPositive={true} 
          pathD="M0,5 L20,10 L40,8 L60,15 L80,22 L100,25"
          colorClass="glow-path-primary"
        />
        <KPICard 
          title="Live Active Calls" 
          value={activeCallCount} 
          trend="" 
          isPositive={true} 
          pathD="M0,25 L20,28 L40,25 L60,15 L80,5 L100,10"
          colorClass="glow-path-warning"
        />
        <KPICard 
          title="Avg Latency" 
          value={`${stats?.latencyAverage || 120}ms`} 
          trend="12ms" 
          isPositive={false} 
          pathD="M0,30 L20,25 L40,20 L60,15 L80,10 L100,5"
          colorClass="glow-path-success"
        />
        
        <CallVolumeAreaChart />

        {/* Top Active Tenants */}
        <div className="glass-card" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Users size={18} style={{ color: 'var(--accent-teal)' }} />
            <div className="kpi-title" style={{ margin: 0 }}>Top Active Tenants</div>
          </div>
          {topTenants.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {topTenants.map(([name, count]: any, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'var(--card-bg)', borderRadius: '4px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{name}</span>
                  <span style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>{count} calls</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>No active calls right now.</div>
          )}
        </div>

        {/* Recent System Alerts */}
        <div className="glass-card" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
            <div className="kpi-title" style={{ margin: 0 }}>Recent System Alerts</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem', background: 'var(--card-bg)', borderRadius: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--warning)', marginTop: '6px' }}></div>
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>High latency on Voice API</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>2 mins ago • us-east-1</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem', background: 'var(--card-bg)', borderRadius: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', marginTop: '6px' }}></div>
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>Cluster autoscaled successfully</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>14 mins ago • kubernetes</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminOverview;
