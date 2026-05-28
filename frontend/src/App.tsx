import React, { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [tenant, setTenant] = useState<any | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Initialize and check active session
  useEffect(() => {
    const savedToken = localStorage.getItem('charlotte_token');
    const savedTenant = localStorage.getItem('charlotte_tenant');
    const savedTheme = localStorage.getItem('charlotte-showcase-theme') || '';

    // Re-apply saved theme immediately on boot
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    if (savedToken && savedTenant) {
      setToken(savedToken);
      try {
        setTenant(JSON.parse(savedTenant));
      } catch (e) {
        console.error('Error parsing stored tenant session:', e);
        // Clear broken session
        localStorage.removeItem('charlotte_token');
        localStorage.removeItem('charlotte_tenant');
      }
    }
    setCheckingSession(false);
  }, []);

  const handleAuthSuccess = (newToken: string, newTenant: any) => {
    setToken(newToken);
    setTenant(newTenant);
  };

  const handleUpdateTenant = (newTenant: any) => {
    setTenant(newTenant);
    localStorage.setItem('charlotte_tenant', JSON.stringify(newTenant));
  };

  const handleSignOut = () => {
    localStorage.removeItem('charlotte_token');
    localStorage.removeItem('charlotte_tenant');
    setToken(null);
    setTenant(null);
  };

  if (checkingSession) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        gap: '1rem'
      }}>
        <div className="pulse-dot" style={{ width: '16px', height: '16px' }}></div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '0.95rem' }}>
          Restoring Isolated RLS Workspace Context...
        </div>
      </div>
    );
  }

  return (
    <>
      {token && tenant ? (
        <Dashboard 
          token={token} 
          tenant={tenant} 
          onUpdateTenant={handleUpdateTenant} 
          onSignOut={handleSignOut} 
        />
      ) : (
        <Auth onAuthSuccess={handleAuthSuccess} />
      )}
    </>
  );
};

export default App;
