import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, PlusCircle, MessageSquare, Settings, LogOut, 
  Phone, Award, Calendar, Volume2, UserCheck, Play
} from 'lucide-react';
import { TranscriptBox } from './TranscriptBox';
import type { TranscriptMessage } from './TranscriptBox';
import { NumberWizard } from './NumberWizard';

interface TenantData {
  id: string;
  name: string;
  destinationNumber: string;
  destinationVerified: boolean;
}

interface DashboardProps {
  token: string;
  tenant: TenantData;
  onUpdateTenant: (updatedTenant: any) => void;
  onSignOut: () => void;
}

interface CallLog {
  id: string;
  caller: string;
  phone: string;
  time: string;
  duration: string;
  status: 'active' | 'completed';
  messages: TranscriptMessage[];
}

export const Dashboard: React.FC<DashboardProps> = ({ token, tenant, onUpdateTenant, onSignOut }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'provision' | 'live' | 'settings'>('overview');
  const [currentTheme, setCurrentTheme] = useState<string>('');
  
  // Tenant local configurations
  const [tenantName, setTenantName] = useState(tenant.name);
  const [forwardingNumber, setForwardingNumber] = useState(tenant.destinationNumber);
  const [tone, setTone] = useState('warm');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync form inputs with prop changes
  useEffect(() => {
    setTenantName(tenant.name);
    setForwardingNumber(tenant.destinationNumber);
  }, [tenant]);

  // Provisioned lines (starts with a mock or empty, updated dynamically)
  const [provisionedLines, setProvisionedLines] = useState<any[]>([
    { id: '1', phoneNumber: '+15125550199', friendlyName: 'Charlotte Main Hotline' }
  ]);

  // Call Logs & Live Streaming States
  const [callLogs, setCallLogs] = useState<CallLog[]>([
    {
      id: 'log-1',
      caller: 'Michael Brown',
      phone: '+1 (512) 555-0199',
      time: 'Today, 11:34 AM',
      duration: '2m 15s',
      status: 'completed',
      messages: [
        { id: 'm1-1', speaker: 'charlotte', text: "Hi there! Thank you for calling Brown Consulting. I'm Charlotte, your virtual receptionist. How can I help you support your business today?", timestamp: "11:34:02 AM" },
        { id: 'm1-2', speaker: 'caller', text: "Hi Charlotte, I wanted to check your operating hours and if you have any consultation slots open this afternoon.", timestamp: "11:34:15 AM" },
        { id: 'm1-3', speaker: 'charlotte', text: "We are open from Monday to Friday, 9:00 AM to 5:00 PM CST. I can see a couple of slots available for a cloud architecture consultation at 2:00 PM and 3:30 PM today. Would you like me to book one of those for you?", timestamp: "11:34:38 AM" },
        { id: 'm1-4', speaker: 'caller', text: "Yes, please book the 2:00 PM slot under Michael!", timestamp: "11:34:55 AM" },
        { id: 'm1-5', speaker: 'charlotte', text: "Perfect, Michael! I have provisionally reserved the 2:00 PM slot for you. A confirmation link has been sent to your mobile. I'm always here if you need anything else!", timestamp: "11:35:10 AM" }
      ]
    },
    {
      id: 'log-2',
      caller: 'Robert Vance',
      phone: '+1 (212) 555-0811',
      time: 'Yesterday, 4:45 PM',
      duration: '3m 40s',
      status: 'completed',
      messages: [
        { id: 'm2-1', speaker: 'charlotte', text: "Thank you for calling Vance Refrigeration! I'm Charlotte, your AI helper. How can I direct your call?", timestamp: "4:45:10 PM" },
        { id: 'm2-2', speaker: 'caller', text: "Yes, I need to speak to Bob Vance regarding an commercial refrigeration order.", timestamp: "4:45:25 PM" },
        { id: 'm2-3', speaker: 'charlotte', text: "I'd be happy to check if Bob Vance is available for a transfer, or I can take a callback message for him. What is your invoice number?", timestamp: "4:45:48 PM" },
        { id: 'm2-4', speaker: 'caller', text: "Invoice #98224. Please tell him it is urgent.", timestamp: "4:46:05 PM" },
        { id: 'm2-5', speaker: 'charlotte', text: "Understood. Bob is currently out of office, so I have filed a high-priority callback ticket for Invoice #98224. I will also forward this message directly to his dashboard. Have a wonderful day!", timestamp: "4:46:30 PM" }
      ]
    }
  ]);

  // Selected Call Log for Transcript Drawer
  const [selectedCallId, setSelectedCallId] = useState<string>('log-1');
  const [activeLiveCall, setActiveLiveCall] = useState<CallLog | null>(null);

  // Load saved theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('charlotte-showcase-theme') || '';
    applyTheme(savedTheme);
  }, []);

  // Load provisioned phone numbers
  useEffect(() => {
    const fetchProvisionedNumbers = async () => {
      try {
        const response = await fetch('/api/tenants/numbers', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.numbers && data.numbers.length > 0) {
            setProvisionedLines(data.numbers);
          } else {
            setProvisionedLines([
              { id: '1', phoneNumber: '+15125550199', friendlyName: 'Charlotte Main Hotline' }
            ]);
          }
        }
      } catch (error) {
        console.error('Error fetching provisioned lines:', error);
      }
    };
    fetchProvisionedNumbers();
  }, [token]);

  const applyTheme = (themeValue: string) => {
    setCurrentTheme(themeValue);
    if (themeValue) {
      document.documentElement.setAttribute('data-theme', themeValue);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('charlotte-showcase-theme', themeValue);
  };

  // Live Simulation Dialog Scripts
  const simulationScript = [
    { speaker: 'charlotte' as const, text: "Welcome to Charlotte Virtual Solutions! I'm your virtual office receptionist. May I ask what services you are inquiring about today?" },
    { speaker: 'caller' as const, text: "Hi, I'm calling about setting up some custom SMS automation rules for my real estate portal." },
    { speaker: 'charlotte' as const, text: "SMS automation is one of our specialties! We can trigger automated follow-ups immediately when a hot lead fills out an inquiry. Are you using a specific CRM?" },
    { speaker: 'caller' as const, text: "Yes, we use Salesforce. We want to dispatch text notifications to our agents automatically." },
    { speaker: 'charlotte' as const, text: "Excellent, Salesforce integrates smoothly with our webhook triggers. I'm initiating a transfer of this call to our primary automation architect, or I can schedule a demo slot. Which do you prefer?" },
    { speaker: 'caller' as const, text: "Please transfer me over to the architect!" },
    { speaker: 'charlotte' as const, text: "Perfect! Initiating live transfer to your configured fallback line... Please hold a moment while I connect you." }
  ];

  // Simulated live voice-to-text call logic
  const handleSimulateCall = () => {
    setActiveTab('live');
    
    // Create new temporary live call log
    const newCallId = `live-${Date.now()}`;
    const liveCallTemplate: CallLog = {
      id: newCallId,
      caller: 'Michael (Simulated)',
      phone: provisionedLines[0]?.phoneNumber || '+1 (512) 555-0199',
      time: 'Just now',
      duration: 'Streaming',
      status: 'active',
      messages: []
    };

    // Add to logs and set as selected
    setCallLogs(prev => [liveCallTemplate, ...prev]);
    setSelectedCallId(newCallId);
    setActiveLiveCall(liveCallTemplate);

    let scriptIdx = 0;
    
    const interval = setInterval(() => {
      if (scriptIdx < simulationScript.length) {
        const scriptMsg = simulationScript[scriptIdx];
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const newMsg: TranscriptMessage = {
          id: `msg-${Date.now()}-${scriptIdx}`,
          speaker: scriptMsg.speaker,
          text: scriptMsg.text,
          timestamp: timeStr
        };

        setCallLogs(prevLogs => {
          return prevLogs.map(log => {
            if (log.id === newCallId) {
              return {
                ...log,
                messages: [...log.messages, newMsg]
              };
            }
            return log;
          });
        });

        scriptIdx++;
      } else {
        // Complete the call log
        clearInterval(interval);
        setCallLogs(prevLogs => {
          return prevLogs.map(log => {
            if (log.id === newCallId) {
              return {
                ...log,
                status: 'completed',
                duration: '1m 45s',
                time: 'Just now'
              };
            }
            return log;
          });
        });
        setActiveLiveCall(null);
      }
    }, 2800);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const response = await fetch('/api/auth/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: tenantName,
          destinationNumber: forwardingNumber
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update tenant settings.');
      }

      const data = await response.json();
      onUpdateTenant(data.tenant);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving configurations:', err);
      setSaveError(err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  // Get current displayed log
  const activeLog = callLogs.find(log => log.id === selectedCallId) || callLogs[0];

  return (
    <div className="app-container">
      
      {/* SIDEBAR NAVIGATION PANEL */}
      <nav className="sidebar-nav">
        {/* LOGO */}
        <div className="logo-container">
          <div className="logo-icon">C</div>
          <div className="logo-text">Charlotte.ai</div>
        </div>

        {/* LINKS */}
        <ul className="nav-links">
          <li id="nav-overview" className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <LayoutDashboard />
            <span>Overview Dashboard</span>
          </li>
          <li id="nav-provision" className={`nav-item ${activeTab === 'provision' ? 'active' : ''}`} onClick={() => setActiveTab('provision')}>
            <PlusCircle />
            <span>Provision Hotline</span>
          </li>
          <li id="nav-live" className={`nav-item ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
            <MessageSquare />
            <span>Live Terminal</span>
          </li>
          <li id="nav-settings" className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <Settings />
            <span>Agent Settings</span>
          </li>
        </ul>

        {/* PREMIUM THEME SWAPPER INSIDE SIDEBAR */}
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--card-border)' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Aesthetic Themes
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {[
              { id: '', label: 'Midnight Blue', color: 'hsl(172, 77%, 42%)' },
              { id: 'terracotta', label: 'Warm Terracotta', color: 'hsl(14, 75%, 55%)' },
              { id: 'spruce', label: 'Nordic Spruce', color: 'hsl(158, 65%, 42%)' },
              { id: 'amethyst', label: 'Royal Amethyst', color: 'hsl(272, 75%, 62%)' },
              { id: 'obsidian', label: 'Obsidian Rose', color: 'hsl(343, 78%, 55%)' },
              { id: 'light', label: 'Warm Ivory', color: 'hsl(172, 80%, 35%)' }
            ].map(themeItem => (
              <button 
                key={themeItem.id}
                className={`theme-pill ${currentTheme === themeItem.id ? 'active' : ''}`}
                onClick={() => applyTheme(themeItem.id)}
              >
                <span className="theme-dot" style={{ backgroundColor: themeItem.color }}></span>
                {themeItem.label}
              </button>
            ))}
          </div>
        </div>

        {/* SIDEBAR FOOTER (USER PROFLE & SIGN OUT) */}
        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {tenantName.substring(0, 2).toUpperCase()}
            </div>
            <div className="user-details" style={{ flexGrow: 1 }}>
              <span className="user-name" id="sidebar-user-name">{tenantName}</span>
              <span className="user-role">Administrator</span>
            </div>
            <button 
              id="sidebar-signout-btn"
              onClick={onSignOut} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN MAIN PANEL WRAPPER */}
      <main className="main-content">
        
        {/* HEADER BAR */}
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--card-border)'
        }}>
          <div>
            <h1 id="main-header-title" style={{ fontSize: '1.75rem', fontFamily: 'var(--font-heading)' }}>
              {activeTab === 'overview' && 'Tenant Desk Overview'}
              {activeTab === 'provision' && 'Provisioning Portal'}
              {activeTab === 'live' && 'Active Virtual Terminal'}
              {activeTab === 'settings' && 'AI Agent Settings'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Isolated Workspace Environment: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tenantName}</span>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="status-badge" id="webhook-badge">
              <span className="pulse-dot"></span> Webhook Online
            </span>
          </div>
        </header>

        {/* TAB CONTENTS */}

        {/* 1. OVERVIEW VIEW */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'modalScaleUp 0.3s ease' }}>
            
            {/* METRICS CARD GRID */}
            <section className="metric-grid">
              {/* Metric 1 */}
              <div className="glass-card metric-card interactive" id="metric-answer-rate">
                <div className="metric-info">
                  <span className="metric-label">Answer Rate</span>
                  <span className="metric-value">98.4%</span>
                  <span className="metric-trend trend-up">↑ 1.2% this week</span>
                </div>
                <div className="metric-icon-wrapper">
                  <Award size={22} />
                </div>
              </div>
              {/* Metric 2 */}
              <div className="glass-card metric-card interactive" id="metric-avg-duration">
                <div className="metric-info">
                  <span className="metric-label">Avg Duration</span>
                  <span className="metric-value">2m 14s</span>
                  <span className="metric-trend text-secondary" style={{ fontSize: '0.8rem' }}>Target: &lt; 3m 00s</span>
                </div>
                <div className="metric-icon-wrapper">
                  <Calendar size={22} />
                </div>
              </div>
              {/* Metric 3 */}
              <div className="glass-card metric-card interactive" id="metric-inbound-calls">
                <div className="metric-info">
                  <span className="metric-label">Inbound Calls</span>
                  <span className="metric-value">{callLogs.length + 120}</span>
                  <span className="metric-trend trend-up">↑ 12% vs last month</span>
                </div>
                <div className="metric-icon-wrapper">
                  <Phone size={22} />
                </div>
              </div>
            </section>

            {/* DASHBOARD SPLIT GRID */}
            <div className="dashboard-grid">
              
              {/* LEFT COLUMN: CALL LOGS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-heading)' }}>Interactive Inbound Call Logs</h2>
                  <button 
                    id="dashboard-simulate-call-btn"
                    className="gradient-btn" 
                    onClick={handleSimulateCall}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  >
                    <Play size={14} />
                    Simulate Inbound Call
                  </button>
                </div>

                <div className="glass-card" style={{ padding: '1rem' }}>
                  <div className="table-container">
                    <table className="custom-table" id="call-logs-table">
                      <thead>
                        <tr>
                          <th>Caller</th>
                          <th>Time & Date</th>
                          <th>Duration</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {callLogs.map((log) => {
                          const isSelected = selectedCallId === log.id;
                          return (
                            <tr 
                              key={log.id} 
                              onClick={() => setSelectedCallId(log.id)}
                              style={{ 
                                cursor: 'pointer',
                                background: isSelected ? 'var(--table-hover-bg)' : 'transparent',
                                borderLeft: isSelected ? '3px solid var(--accent-teal)' : 'none'
                              }}
                            >
                              <td style={{ fontWeight: 600 }}>{log.caller}</td>
                              <td>{log.time}</td>
                              <td>{log.duration}</td>
                              <td>
                                {log.status === 'active' ? (
                                  <span className="badge-active">
                                    <span className="pulse-dot"></span> Active
                                  </span>
                                ) : (
                                  <span className="badge-completed">Completed</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: INTEGRATED TRANSCRIPT BOX */}
              <div>
                <TranscriptBox 
                  sessionPhone={activeLog?.phone || '+1 (512) 555-0199'}
                  status={activeLog?.status || 'idle'}
                  messages={activeLog?.messages || []}
                  tenantName={tenantName}
                />
              </div>

            </div>

          </div>
        )}

        {/* 2. PROVISION HOTLINE WIZARD VIEW */}
        {activeTab === 'provision' && (
          <div style={{ display: 'flex', justifyContent: 'center', animation: 'modalScaleUp 0.3s ease' }}>
            <NumberWizard 
              token={token} 
              onProvisionSuccess={(newNumber) => {
                // Register newly bought line, filtering out default mock line if it exists
                setProvisionedLines(prev => {
                  const filtered = prev.filter(line => line.id !== '1');
                  return [...filtered, newNumber];
                });
                // Switch back to overview
                setActiveTab('overview');
              }}
              onCancel={() => setActiveTab('overview')}
            />
          </div>
        )}

        {/* 3. ACTIVE TERMINAL (PLAYGROUND) */}
        {activeTab === 'live' && (
          <div className="dashboard-grid" style={{ animation: 'modalScaleUp 0.3s ease' }}>
            
            {/* TERMINAL CONTROLS */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Volume2 size={24} style={{ color: 'var(--accent-teal)' }} />
                <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-heading)', margin: 0 }}>Interactive Voice Terminal</h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Test your virtual receptionist instantly by triggering mock speech streaming dialogues. This simulates Twilio Webhook signals.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                <button 
                  id="live-terminal-simulate-btn"
                  className="gradient-btn" 
                  disabled={!!activeLiveCall}
                  onClick={handleSimulateCall}
                  style={{ padding: '0.9rem' }}
                >
                  <Play size={16} />
                  {activeLiveCall ? 'Stream in Progress...' : 'Start Speech Dialogue Stream'}
                </button>
                
                <div style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: 'var(--border-radius-md)',
                  padding: '1rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)'
                }}>
                  <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Active Desk Hotlines:</strong>
                  <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {provisionedLines.map(line => (
                      <li key={line.id} style={{ fontFamily: 'monospace' }}>
                        {line.friendlyName}: {line.phoneNumber}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* LIVE CHAT BOX DRAWER */}
            <div>
              <TranscriptBox 
                sessionPhone={activeLog?.phone || '+1 (512) 555-0199'}
                status={activeLog?.status || 'idle'}
                messages={activeLog?.messages || []}
                tenantName={tenantName}
              />
            </div>

          </div>
        )}

        {/* 4. SETTINGS VIEW */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: '640px', margin: '0 auto', width: '100%', animation: 'modalScaleUp 0.3s ease' }}>
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <Settings size={22} style={{ color: 'var(--accent-teal)' }} />
                <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-heading)', margin: 0 }}>Agent Configuration</h2>
              </div>

              <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {saveError && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgb(239, 68, 68)',
                    color: 'rgb(248, 113, 113)',
                    padding: '0.75rem',
                    borderRadius: 'var(--border-radius-md)',
                    fontSize: '0.85rem'
                  }}>
                    {saveError}
                  </div>
                )}

                {saveSuccess && (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgb(16, 185, 129)',
                    color: 'rgb(52, 211, 153)',
                    padding: '0.75rem',
                    borderRadius: 'var(--border-radius-md)',
                    fontSize: '0.85rem'
                  }}>
                    Tenant settings saved and synchronized successfully!
                  </div>
                )}

                {/* TENANT NAME */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="settings-tenant-name">Company Name</label>
                  <input 
                    id="settings-tenant-name" 
                    type="text" 
                    className="input-field" 
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                  />
                </div>

                {/* FALLBACK FORWARDING TELEPHONE */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="settings-forwarding-number">Fallback Forwarding Target</label>
                  <input 
                    id="settings-forwarding-number" 
                    type="tel" 
                    className="input-field" 
                    value={forwardingNumber}
                    onChange={(e) => setForwardingNumber(e.target.value)}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Telephone number dialed when Charlotte initiates a physical call transfer.
                  </p>
                </div>

                {/* AGENT VOICE TONE SELECTOR */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Virtual Receptionist Tone</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[
                      { id: 'professional', label: 'Professional & Crispy' },
                      { id: 'warm', label: 'Warm & Friendly (Default)' },
                      { id: 'casual', label: 'Casual & Bubbly' }
                    ].map(toneItem => (
                      <button
                        key={toneItem.id}
                        type="button"
                        className={`secondary-btn ${tone === toneItem.id ? 'active' : ''}`}
                        onClick={() => setTone(toneItem.id)}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      >
                        {tone === toneItem.id && <UserCheck size={14} style={{ color: 'var(--accent-teal)' }} />}
                        {toneItem.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* WEBHOOK URL */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="settings-webhook">Twilio Webhook Target URL</label>
                  <input 
                    id="settings-webhook" 
                    type="text" 
                    className="input-field" 
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                    readOnly
                    value={`https://localhost:8080/api/webhook/twilio/inbound-call`}
                  />
                </div>

                {/* ACTIONS */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                  <button type="button" className="secondary-btn" onClick={() => { setTenantName(tenant.name); setForwardingNumber(tenant.destinationNumber); }}>Reset</button>
                  <button 
                    type="submit" 
                    className="gradient-btn" 
                    id="settings-save-btn"
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Configurations'}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};
