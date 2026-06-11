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
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Google Calendar Integration</h2>
      <p className="text-slate-600 mb-4">Connect your Google Workspace to allow the AI to check availability and book appointments directly on your calendar.</p>
      
      {!calendars.length ? (
        <button
          onClick={handleConnect}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          Connect Google Calendar
        </button>
      ) : (
        <div>
          <h3 className="text-md font-medium text-slate-800 mb-2">Select a Calendar</h3>
          {loading ? <p>Loading...</p> : (
            <ul className="space-y-2">
              {calendars.map(cal => (
                <li key={cal.id} className="flex items-center justify-between bg-slate-50 p-3 rounded border border-slate-100">
                  <span className="text-slate-700 font-medium">{cal.summary}</span>
                  <button
                    onClick={() => handleSelectCalendar(cal.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
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
