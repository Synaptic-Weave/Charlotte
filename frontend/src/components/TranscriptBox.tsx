import React, { useEffect, useRef } from 'react';
import { Phone, MessageSquare, ShieldAlert } from 'lucide-react';

export interface TranscriptMessage {
  id: string;
  speaker: 'charlotte' | 'caller';
  text: string;
  timestamp?: string;
}

interface TranscriptBoxProps {
  sessionPhone: string;
  status: 'active' | 'completed' | 'idle';
  messages: TranscriptMessage[];
  tenantName: string;
}

export const TranscriptBox: React.FC<TranscriptBoxProps> = ({
  sessionPhone,
  status,
  messages,
  tenantName,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when messages are appended
  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.25rem' }}>
      
      {/* HEADER INFO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 id="transcript-header-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Phone size={18} style={{ color: 'var(--accent-teal)' }} />
            {status === 'idle' ? 'Call Transcript Drawer' : `Session: ${sessionPhone}`}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
            {status === 'idle' 
              ? 'Select a call to view historical conversation logs.' 
              : `Tenant: ${tenantName} • Active Virtual Desk`
            }
          </p>
        </div>

        {status === 'active' && (
          <span className="badge-active" id="transcript-badge-active">
            <span className="pulse-dot"></span> Streaming Live
          </span>
        )}
        {status === 'completed' && (
          <span className="badge-completed" id="transcript-badge-completed">
            Completed
          </span>
        )}
        {status === 'idle' && (
          <span className="status-badge" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)', borderColor: 'var(--card-border)' }}>
            Standby
          </span>
        )}
      </div>

      {/* MESSAGES PORT */}
      <div 
        ref={boxRef}
        className="transcript-box" 
        style={{ 
          flexGrow: 1, 
          minHeight: '280px', 
          maxHeight: '420px', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: '1.25rem'
        }}
      >
        {messages.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-secondary)',
            gap: '1rem',
            padding: '2rem 1rem',
            textAlign: 'center'
          }}>
            <MessageSquare size={36} style={{ opacity: 0.3, color: 'var(--accent-teal)' }} />
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>No Live Transcript Selected</p>
              <p style={{ fontSize: '0.8rem', maxWidth: '240px', marginTop: '0.25rem' }}>
                Select a completed log or hit the "Simulate Inbound Call" trigger to start a speech stream.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isCharlotte = msg.speaker === 'charlotte';
            return (
              <div 
                key={msg.id} 
                className={`speech-bubble ${isCharlotte ? 'charlotte' : 'caller'}`}
                style={{
                  alignSelf: isCharlotte ? 'flex-start' : 'flex-end',
                  animation: 'modalScaleUp 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)'
                }}
              >
                <span className="speaker-label">
                  {isCharlotte ? 'Charlotte (Virtual AI)' : 'Michael (Caller)'}
                </span>
                <div>{msg.text}</div>
                {msg.timestamp && (
                  <span style={{
                    display: 'block',
                    fontSize: '0.7rem',
                    textAlign: isCharlotte ? 'left' : 'right',
                    marginTop: '0.35rem',
                    opacity: 0.6,
                    color: isCharlotte ? 'var(--text-secondary)' : 'rgba(255, 255, 255, 0.8)'
                  }}>
                    {msg.timestamp}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* FOOTER TIPS */}
      {status === 'active' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'hsla(172, 77%, 42%, 0.05)',
          padding: '0.65rem 1rem',
          borderRadius: 'var(--border-radius-md)',
          border: '1px solid hsla(172, 77%, 42%, 0.1)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)'
        }}>
          <ShieldAlert size={14} style={{ color: 'var(--accent-teal)' }} />
          <span>Agent is fully capable of transfers, scheduling, and Q&A dynamically.</span>
        </div>
      )}
    </div>
  );
};
