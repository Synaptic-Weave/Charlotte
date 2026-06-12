import React, { useState, useEffect } from 'react';

interface Calendar {
  id: string;
  summary: string;
}

export const Integrations: React.FC<{ token: string }> = ({ token }) => {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if returning from OAuth
    const query = new URLSearchParams(window.location.search);
    if (query.get('code')) {
      fetch('/api/integrations/google/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: query.get('code'), state: query.get('state') })
      }).then(() => {
        // Clear url params
        window.history.replaceState({}, document.title, window.location.pathname);
        fetchCalendars();
      });
    } else {
      fetchCalendars();
    }
  }, []);

  const fetchCalendars = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/google/calendars', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCalendars(data.calendars);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/integrations/google/auth', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectCalendar = async (calendarId: string) => {
    await fetch('/api/integrations/google/calendars', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ calendarId })
    });
    alert('Calendar saved!');
  };

  return (
    <div className="glass-card" style={{ padding: '2rem' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: '1rem' }}>Google Calendar Integration</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: '1.6' }}>Connect your Google Workspace to allow the AI to check availability and book appointments directly on your calendar.</p>
      
      {!calendars.length ? (
        <button
          onClick={handleConnect}
          className="gradient-btn"
        >
          Connect Google Calendar
        </button>
      ) : (
        <div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Select a Calendar</h3>
          {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading...</p> : (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {calendars.map(cal => (
                <li key={cal.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', padding: '1rem', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--card-border)' }}>
                  <span style={{ fontWeight: 500 }}>{cal.summary}</span>
                  <button
                    onClick={() => handleSelectCalendar(cal.id)}
                    className="secondary-btn"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
