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

  // Provisioned lines (updated dynamically)
  const [provisionedLines, setProvisionedLines] = useState<any[]>([]);

  // Call Logs & Live Streaming States
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [stats, setStats] = useState({
    totalCalls: 0,
    avgDurationSeconds: 0,
    answerRate: 100.0,
  });

  // Selected Call Log for Transcript Drawer
  const [selectedCallId, setSelectedCallId] = useState<string>('');
  const [activeLiveCall, setActiveLiveCall] = useState<CallLog | null>(null);

  // Create a ref for the length of callLogs to avoid stale closures in WebSockets effect
  const callLogsLengthRef = React.useRef(0);
  useEffect(() => {
    callLogsLengthRef.current = callLogs.length;
  }, [callLogs]);

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
          if (data.numbers) {
            setProvisionedLines(data.numbers);
          }
        }
      } catch (error) {
        console.error('Error fetching provisioned lines:', error);
      }
    };
    fetchProvisionedNumbers();
  }, [token]);

  const fetchCallLogs = async (reset = false, customLimit?: number, customOffset?: number) => {
    try {
      setIsLoadingLogs(true);
      const fetchOffset = customOffset !== undefined ? customOffset : (reset ? 0 : offset);
      const fetchLimit = customLimit !== undefined ? customLimit : 15;

      const response = await fetch(`/api/tenants/calls?limit=${fetchLimit}&offset=${fetchOffset}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.calls) {
          setCallLogs(prev => {
            const merged = reset ? data.calls : [...prev, ...data.calls];
            // Remove duplicates by ID
            const unique = merged.reduce((acc: CallLog[], curr: CallLog) => {
              if (!acc.some(item => item.id === curr.id)) {
                acc.push(curr);
              }
              return acc;
            }, []);
            return unique;
          });

          setHasMore(data.hasMore);
          setOffset(fetchOffset + data.calls.length);

          if (data.calls.length > 0) {
            setSelectedCallId(prev => {
              const stillExists = (reset ? data.calls : [...callLogs, ...data.calls]).some((c: any) => c.id === prev);
              return stillExists ? prev : data.calls[0].id;
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching call logs:', error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/tenants/calls/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setStats({
          totalCalls: data.totalCalls ?? 0,
          avgDurationSeconds: data.avgDurationSeconds ?? 0,
          answerRate: data.answerRate ?? 100.0,
        });
      }
    } catch (error) {
      console.error('Error fetching call stats:', error);
    }
  };

  // Initial load
  useEffect(() => {
    fetchCallLogs(true);
    fetchStats();
  }, [token]);

  // Real-time WebSocket Updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWS = () => {
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/api/ws/updates?token=${token}`;
        console.log(`[Dashboard WebSocket] Connecting to ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[Dashboard WebSocket] Connected successfully.');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[Dashboard WebSocket] Message received:', data);
            if (data.event === 'calls_updated') {
              // Fetch from offset 0 up to current loaded count to refresh all displayed logs
              const currentCount = Math.max(15, callLogsLengthRef.current);
              fetchCallLogs(true, currentCount, 0);
              fetchStats();
            }
          } catch (err) {
            console.error('[Dashboard WebSocket] Parse error:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('[Dashboard WebSocket] Connection error:', error);
        };

        ws.onclose = (event) => {
          console.log(`[Dashboard WebSocket] Closed: Code=${event.code}`);
          reconnectTimeout = setTimeout(() => {
            console.log('[Dashboard WebSocket] Reconnecting...');
            connectWS();
          }, 3000);
        };
      } catch (err) {
        console.error('[Dashboard WebSocket] Setup error:', err);
      }
    };

    connectWS();

    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [token]);

  // Handle scroll-to-bottom for infinite scrolling
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 15) {
      if (hasMore && !isLoadingLogs) {
        fetchCallLogs(false);
      }
    }
  };

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

  // Simulated live voice-to-text call logic using real backend APIs
  const handleSimulateCall = async () => {
    setActiveTab('live');
    
    try {
      // 1. Create a CallSession in the PostgreSQL database
      const createRes = await fetch('/api/tenants/calls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          callerNumber: '+1 (512) 555-0199'
        })
      });

      if (!createRes.ok) {
        throw new Error('Failed to create simulated call session on backend.');
      }

      const createData = await createRes.json();
      const realCall = createData.call;
      const callId = realCall.id;

      // Update local state immediately so UI feels fast and responsive
      setCallLogs(prev => [realCall, ...prev]);
      setSelectedCallId(callId);
      setActiveLiveCall(realCall);

      let scriptIdx = 0;

      const interval = setInterval(async () => {
        if (scriptIdx < simulationScript.length) {
          const scriptMsg = simulationScript[scriptIdx];
          
          try {
            const msgRes = await fetch(`/api/tenants/calls/${callId}/messages`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                speaker: scriptMsg.speaker,
                text: scriptMsg.text
              })
            });

            if (msgRes.ok) {
              const msgData = await msgRes.json();
              // Trigger a local UI update from the backend's updated message list
              setCallLogs(prevLogs => {
                return prevLogs.map(log => {
                  if (log.id === callId) {
                    return {
                      ...log,
                      messages: msgData.messages
                    };
                  }
                  return log;
                });
              });
            }
          } catch (error) {
            console.error('Error sending simulated transcript message:', error);
          }

          scriptIdx++;
        } else {
          clearInterval(interval);
          
          try {
            // 3. Mark CallSession as completed
            const updateRes = await fetch(`/api/tenants/calls/${callId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                status: 'completed'
              })
            });

            if (updateRes.ok) {
              const updateData = await updateRes.json();
              setCallLogs(prevLogs => {
                return prevLogs.map(log => {
                  if (log.id === callId) {
                    return updateData.call;
                  }
                  return log;
                });
              });
            }
          } catch (error) {
            console.error('Error completing simulated call session:', error);
          } finally {
            setActiveLiveCall(null);
          }
        }
      }, 2800);

    } catch (error) {
      console.error('Error starting live simulation:', error);
    }
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
                  <span className="metric-value">{stats.answerRate.toFixed(1)}%</span>
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
                  <span className="metric-value">
                    {stats.avgDurationSeconds >= 60 
                      ? `${Math.floor(stats.avgDurationSeconds / 60)}m ${stats.avgDurationSeconds % 60}s`
                      : `${stats.avgDurationSeconds}s`}
                  </span>
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
                  <span className="metric-value">{stats.totalCalls}</span>
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
                  <div 
                    className="table-container"
                    onScroll={handleScroll}
                    style={{ maxHeight: '520px', overflowY: 'auto' }}
                  >
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
                        {isLoadingLogs && callLogs.length === 0 && (
                          <tr>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                              <span className="pulse-dot" style={{ display: 'inline-block', marginRight: '0.5rem' }}></span> Loading call sessions...
                            </td>
                          </tr>
                        )}
                        {!isLoadingLogs && callLogs.length === 0 && (
                          <tr>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                              No call sessions recorded.
                            </td>
                          </tr>
                        )}
                        {isLoadingLogs && callLogs.length > 0 && (
                          <tr>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              <span className="pulse-dot" style={{ display: 'inline-block', marginRight: '0.5rem' }}></span> Loading more records...
                            </td>
                          </tr>
                        )}
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
                    value={`${window.location.origin}/api/webhook/twilio/inbound-call`}
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
