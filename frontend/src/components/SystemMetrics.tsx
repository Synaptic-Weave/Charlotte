import React from 'react';
import './SystemMetrics.css';

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

const MiniChart = ({ colorClass = 'glow-path-primary', pathD = '' }) => (
  <div className="chart-container">
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <path className={colorClass} d={pathD} />
    </svg>
  </div>
);

const KPICard = ({ title, value, trend, isPositive, pathD, colorClass }) => (
  <div className="glass-card">
    <div className="kpi-title">{title}</div>
    <div className="kpi-value animate-value">
      {value}
      <span className={`kpi-trend ${isPositive ? 'positive' : 'negative'}`}>
        {isPositive ? '↑' : '↓'} {trend}
      </span>
    </div>
    <MiniChart colorClass={colorClass} pathD={pathD} />
  </div>
);

const CallVolumeAreaChart = () => {
  // Sample 7-day data points
  // SVG coordinates: 0,200 (bottom-left) to 800,0 (top-right)
  const areaPath = "M0,180 L100,150 L200,160 L300,120 L400,90 L500,100 L600,60 L700,40 L800,50 L800,200 L0,200 Z";
  const linePath = "M0,180 L100,150 L200,160 L300,120 L400,90 L500,100 L600,60 L700,40 L800,50";
  
  const points = [
    { cx: 0, cy: 180 },
    { cx: 100, cy: 150 },
    { cx: 200, cy: 160 },
    { cx: 300, cy: 120 },
    { cx: 400, cy: 90 },
    { cx: 500, cy: 100 },
    { cx: 600, cy: 60 },
    { cx: 700, cy: 40 },
    { cx: 800, cy: 50 }
  ];

  return (
    <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
      <div className="kpi-title">7-Day Call Volume</div>
      <div className="kpi-value animate-value">124.5k <span className="kpi-trend positive">↑ 12%</span></div>
      
      <div className="large-chart-container">
        <svg viewBox="0 0 800 200" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {/* Grid Lines */}
          <line x1="0" y1="50" x2="800" y2="50" className="grid-line" />
          <line x1="0" y1="100" x2="800" y2="100" className="grid-line" />
          <line x1="0" y1="150" x2="800" y2="150" className="grid-line" />
          
          {/* Area Fill */}
          <path className="area-fill-primary" d={areaPath} />
          
          {/* Glowing Line */}
          <path className="glow-path-primary" d={linePath} />
          
          {/* Data Points */}
          {points.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r="4" className="data-point" />
          ))}
        </svg>
      </div>
    </div>
  );
};

export const SystemMetrics = () => {
  return (
    <div className="system-metrics-container">
      <SVGDefs />
      
      <header>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>System Metrics Overview</h1>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Real-time platform performance and volume analytics</p>
      </header>

      <div className="kpi-grid">
        <KPICard 
          title="Active Calls" 
          value="1,284" 
          trend="5.2%" 
          isPositive={true} 
          pathD="M0,25 L20,20 L40,22 L60,15 L80,18 L100,5"
          colorClass="glow-path-success"
        />
        <KPICard 
          title="Avg Resolution Time" 
          value="4m 12s" 
          trend="2.1%" 
          isPositive={true} 
          pathD="M0,5 L20,10 L40,8 L60,15 L80,22 L100,25"
          colorClass="glow-path-primary"
        />
        <KPICard 
          title="Error Rate" 
          value="0.04%" 
          trend="0.01%" 
          isPositive={false} 
          pathD="M0,25 L20,28 L40,25 L60,15 L80,5 L100,10"
          colorClass="glow-path-warning"
        />
        <KPICard 
          title="Cost Savings" 
          value="$12.4k" 
          trend="8.4%" 
          isPositive={true} 
          pathD="M0,30 L20,25 L40,20 L60,15 L80,10 L100,5"
          colorClass="glow-path-success"
        />
        
        <CallVolumeAreaChart />
      </div>
    </div>
  );
};

export default SystemMetrics;
