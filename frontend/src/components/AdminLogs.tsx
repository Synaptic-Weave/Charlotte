import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Play, Pause, ChevronRight, ChevronDown } from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  service?: string;
  payload?: any;
}

export const AdminLogs: React.FC<{ token: string }> = ({ token }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [liveTail, setLiveTail] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const terminalRef = useRef<HTMLDivElement>(null);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  useEffect(() => {
    const eventSource = new EventSource(`/api/admin/logs?token=${encodeURIComponent(token)}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const newLog: LogEntry = {
          id: data.id || generateId(),
          timestamp: data.timestamp || new Date().toISOString(),
          level: data.level || 'INFO',
          message: data.message || '',
          service: data.service,
          payload: data.payload,
        };

        setLogs(prev => {
          const updated = [...prev, newLog];
          if (updated.length > 1000) return updated.slice(updated.length - 1000);
          return updated;
        });
      } catch (e) {
        console.error('Failed to parse log entry:', e);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, [token]);

  useEffect(() => {
    if (liveTail && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, liveTail]);

  const filteredLogs = logs.filter(log => filterLevel === 'ALL' || log.level === filterLevel);

  const toggleExpand = (id: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'var(--danger)';
      case 'WARN': return 'var(--warning)';
      case 'INFO': return 'var(--accent)';
      default: return 'var(--text-secondary)';
    }
  };

  const syntaxHighlight = (json: any) => {
    if (!json) return '';
    const str = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
    return str.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'json-value';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      } else {
        cls = 'json-number';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  };

  return (
    <div className="admin-smoked-glass-wrapper" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', minHeight: '600px' }}>
      
      {/* Header / Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Terminal size={24} color="var(--accent)" />
          <div>
            <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-heading)', margin: 0, color: 'var(--text-primary)' }}>
              Real-Time Log Stream
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              Live system and component logs
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <select 
            value={filterLevel} 
            onChange={(e) => setFilterLevel(e.target.value)}
            className="modern-input"
            style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', borderRadius: 'var(--border-radius-md)' }}
          >
            <option value="ALL">All Levels</option>
            <option value="INFO">Info</option>
            <option value="WARN">Warning</option>
            <option value="ERROR">Error</option>
          </select>
          
          <button 
            onClick={() => setLiveTail(!liveTail)}
            className="modern-button"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem', 
              background: liveTail ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              borderColor: liveTail ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)'
            }}
          >
            {liveTail ? <Pause size={16} /> : <Play size={16} />}
            {liveTail ? 'Pause Tail' : 'Live Tail'}
          </button>
        </div>
      </div>

      {/* Split Pane Layout (Filters left, Terminal right) */}
      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        
        {/* Left Pane - System Overview or Quick Filters */}
        <div style={{ width: '250px', borderRight: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.2)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            System Components
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="pulse-dot" style={{ width: '8px', height: '8px' }}></div>
              Admin Services
            </div>
            <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="pulse-dot" style={{ width: '8px', height: '8px', background: 'var(--accent)' }}></div>
              Call Routing
            </div>
            <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="pulse-dot" style={{ width: '8px', height: '8px', background: 'var(--warning)' }}></div>
              Webhooks
            </div>
          </div>
        </div>

        {/* Right Pane - Main Terminal */}
        <div 
          ref={terminalRef}
          style={{ 
            flexGrow: 1, 
            background: '#0d1117', 
            overflowY: 'auto', 
            padding: '1rem',
            fontFamily: '"Fira Code", "JetBrains Mono", monospace',
            fontSize: '0.85rem',
            display: 'flex',
            flexDirection: 'column'
          }}
          onScroll={() => {
            if (terminalRef.current) {
              const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
              if (scrollHeight - scrollTop - clientHeight > 50) {
                setLiveTail(false);
              }
            }
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
              Waiting for incoming logs...
            </div>
          ) : (
            filteredLogs.map((log) => {
              const hasPayload = !!log.payload && Object.keys(log.payload).length > 0;
              const isExpanded = expandedLogs.has(log.id);

              return (
                <div key={log.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div 
                    onClick={() => hasPayload && toggleExpand(log.id)}
                    style={{ 
                      display: 'flex', 
                      gap: '1rem', 
                      padding: '0.5rem', 
                      cursor: hasPayload ? 'pointer' : 'default',
                      color: 'var(--text-secondary)',
                      alignItems: 'flex-start'
                    }}
                    className="log-row-hover"
                  >
                    <div style={{ width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
                      {hasPayload ? (
                        isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                      ) : null}
                    </div>
                    <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap', marginTop: '2px' }}>
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                    </span>
                    <span style={{ color: getLevelColor(log.level), fontWeight: 'bold', width: '50px', marginTop: '2px' }}>
                      {log.level}
                    </span>
                    {log.service && (
                      <span style={{ color: 'var(--accent)', opacity: 0.8, marginTop: '2px' }}>
                        [{log.service}]
                      </span>
                    )}
                    <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all', flexGrow: 1, marginTop: '2px' }}>
                      {log.message}
                    </span>
                  </div>
                  
                  {isExpanded && hasPayload && (
                    <div style={{ padding: '0.5rem 1rem 1rem 3.5rem' }}>
                      <pre 
                        style={{ 
                          margin: 0, 
                          padding: '1rem', 
                          background: 'rgba(0, 0, 0, 0.4)', 
                          borderRadius: 'var(--border-radius-sm)',
                          overflowX: 'auto',
                          fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                          fontSize: '0.85rem',
                          color: 'var(--text-primary)',
                          border: '1px solid rgba(255, 255, 255, 0.05)'
                        }}
                        dangerouslySetInnerHTML={{ __html: syntaxHighlight(log.payload) }}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <style>{`
        .log-row-hover:hover {
          background: rgba(255, 255, 255, 0.05) !important;
        }
        .json-key { color: #82aaff; }
        .json-string { color: #c3e88d; }
        .json-number { color: #f78c6c; }
        .json-boolean { color: #ff9cac; }
        .json-null { color: #ff9cac; }
        .json-value { color: #eeffff; }
      `}</style>
    </div>
  );
};
