import React from 'react';
import './SystemMetrics.css';

export const SystemMetrics: React.FC = () => {
  return (
    <div className="system-metrics-container" style={{ display: 'grid', gap: '24px', padding: '24px' }}>
      
      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
        
        {/* KPI Card 1: Total Tenants */}
        <div className="glass-kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Total Tenants</span>
            <svg className="kpi-icon-glow" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div className="kpi-value">1,248</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--success)' }}>↑ 12% from last month</div>
        </div>

        {/* KPI Card 2: Active Calls */}
        <div className="glass-kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Active Calls</span>
            <svg className="kpi-icon-glow" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-indigo)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </div>
          <div className="kpi-value">42</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Current load: 15%</div>
        </div>

        {/* KPI Card 3: Avg Response Time */}
        <div className="glass-kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Avg Response Time</span>
            <svg className="kpi-icon-glow" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="kpi-value">1.2s</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--success)' }}>↓ 0.1s from last week</div>
        </div>
      </div>

      {/* 7-Day Call Volume Area Chart */}
      <div className="glass-kpi-card" style={{ marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 24px 0', color: 'var(--text-primary)', fontWeight: 500 }}>7-Day Call Volume</h3>
        <div style={{ width: '100%', height: '300px', position: 'relative' }}>
          <svg width="100%" height="100%" viewBox="0 0 800 300" preserveAspectRatio="none">
            <defs>
              <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-teal)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--accent-teal)" stopOpacity="0" />
              </linearGradient>
            </defs>
            
            {/* Grid Lines */}
            <g stroke="var(--card-border)" strokeWidth="1" strokeDasharray="4 4">
              <line x1="0" y1="50" x2="800" y2="50" />
              <line x1="0" y1="150" x2="800" y2="150" />
              <line x1="0" y1="250" x2="800" y2="250" />
            </g>

            {/* Area Fill */}
            <path 
              className="chart-gradient-fill"
              d="M0,250 L0,200 L133,180 L266,120 L400,160 L533,90 L666,140 L800,80 L800,250 Z" 
              fill="url(#area-gradient)"
            />

            {/* Line Path */}
            <path 
              className="chart-area-path"
              d="M0,200 L133,180 L266,120 L400,160 L533,90 L666,140 L800,80" 
              fill="none" 
              stroke="var(--accent-teal)" 
              strokeWidth="3"
            />

            {/* Data Points */}
            <g fill="var(--bg-secondary)" stroke="var(--accent-teal)" strokeWidth="2">
              <circle className="data-point" cx="0" cy="200" r="4" />
              <circle className="data-point" cx="133" cy="180" r="4" />
              <circle className="data-point" cx="266" cy="120" r="4" />
              <circle className="data-point" cx="400" cy="160" r="4" />
              <circle className="data-point" cx="533" cy="90" r="4" />
              <circle className="data-point" cx="666" cy="140" r="4" />
              <circle className="data-point" cx="800" cy="80" r="4" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};
