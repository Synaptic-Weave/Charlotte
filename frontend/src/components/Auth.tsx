import React, { useState } from 'react';
import { Mail, Lock, Building, Phone, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: (token: string, tenant: any) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [destinationNumber, setDestinationNumber] = useState('');
  
  // Error & loading states
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Simple client-side validation
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all required credential fields.');
      return;
    }

    if (!isLogin && (!tenantName.trim() || !destinationNumber.trim())) {
      setError('All onboarding fields (Company Name and Forwarding Number) are required.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
      const body = isLogin 
        ? { email, password } 
        : { email, password, tenantName, destinationNumber };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify your details.');
      }

      setSuccessMsg(isLogin ? 'Login successful!' : 'Onboarding registration completed successfully!');
      
      // Store credentials locally
      localStorage.setItem('charlotte_token', data.token);
      localStorage.setItem('charlotte_tenant', JSON.stringify(data.tenant));

      // Trigger callback with a tiny delay for success animation
      setTimeout(() => {
        onAuthSuccess(data.token, data.tenant);
      }, 800);

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '2rem',
      background: 'radial-gradient(circle at top right, hsla(172, 77%, 42%, 0.1), transparent 40%), radial-gradient(circle at bottom left, hsla(239, 84%, 67%, 0.08), transparent 40%)'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '480px', padding: '2.5rem' }}>
        
        {/* LOGO */}
        <div className="logo-container" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
          <div className="logo-icon">C</div>
          <div className="logo-text">Charlotte.ai</div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 id="auth-title" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
            {isLogin ? 'Welcome Back' : 'Create Your Tenant'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isLogin 
              ? 'Sign in to access your virtual receptionist dashboard.' 
              : 'Deploy a premium, RLS-isolated AI agent in minutes.'
            }
          </p>
        </div>

        {/* TABS */}
        <div style={{
          display: 'flex',
          background: 'var(--input-bg)',
          borderRadius: 'var(--border-radius-md)',
          padding: '0.25rem',
          marginBottom: '2rem',
          border: '1px solid var(--card-border)'
        }}>
          <button
            id="auth-tab-login"
            type="button"
            className={`secondary-btn ${isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(true); setError(null); }}
            style={{
              flex: 1,
              border: 'none',
              background: isLogin ? 'var(--bg-primary)' : 'transparent',
              boxShadow: isLogin ? 'var(--border-glow)' : 'none',
              borderRadius: 'var(--border-radius-sm)',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem'
            }}
          >
            Sign In
          </button>
          <button
            id="auth-tab-register"
            type="button"
            className={`secondary-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(false); setError(null); }}
            style={{
              flex: 1,
              border: 'none',
              background: !isLogin ? 'var(--bg-primary)' : 'transparent',
              boxShadow: !isLogin ? 'var(--border-glow)' : 'none',
              borderRadius: 'var(--border-radius-sm)',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem'
            }}
          >
            Onboard Signup
          </button>
        </div>

        {/* FEEDBACK BANNERS */}
        {error && (
          <div className="status-badge" style={{
            background: 'hsla(0, 84%, 60%, 0.1)',
            borderColor: 'hsla(0, 84%, 60%, 0.2)',
            color: 'var(--danger)',
            width: '100%',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--border-radius-md)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="status-badge" style={{
            background: 'hsla(142, 72%, 40%, 0.1)',
            borderColor: 'hsla(142, 72%, 40%, 0.2)',
            color: 'var(--success)',
            width: '100%',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--border-radius-md)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <CheckCircle size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* EMAIL */}
          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email Address</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>
                <Mail size={18} />
              </span>
              <input
                id="auth-email"
                type="email"
                className="input-field"
                placeholder="michael@brownconsulting.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '2.75rem' }}
                required
              />
            </div>
          </div>

          {/* PASSWORD */}
          <div className="form-group">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>
                <Lock size={18} />
              </span>
              <input
                id="auth-password"
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '2.75rem' }}
                required
              />
            </div>
          </div>

          {/* ONBOARDING REGISTRATION FIELDS */}
          {!isLogin && (
            <>
              {/* COMPANY NAME */}
              <div className="form-group">
                <label className="form-label" htmlFor="auth-tenant-name">Company Name (Tenant Name)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>
                    <Building size={18} />
                  </span>
                  <input
                    id="auth-tenant-name"
                    type="text"
                    className="input-field"
                    placeholder="Brown Consulting"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    style={{ paddingLeft: '2.75rem' }}
                    required={!isLogin}
                  />
                </div>
              </div>

              {/* FORWARDING TELEPHONE NUMBER */}
              <div className="form-group">
                <label className="form-label" htmlFor="auth-forwarding-number">Forwarding Destination Number</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>
                    <Phone size={18} />
                  </span>
                  <input
                    id="auth-forwarding-number"
                    type="tel"
                    className="input-field"
                    placeholder="e.g., +15125559999"
                    value={destinationNumber}
                    onChange={(e) => setDestinationNumber(e.target.value)}
                    style={{ paddingLeft: '2.75rem' }}
                    required={!isLogin}
                  />
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Forward fallback calls to this destination when a live transfer is initiated.
                </p>
              </div>
            </>
          )}

          {/* SUBMIT BUTTON */}
          <button
            id="auth-submit-btn"
            type="submit"
            className="gradient-btn"
            style={{ width: '100%', marginTop: '1rem', padding: '0.9rem' }}
            disabled={loading}
          >
            {loading ? (
              <span className="skeleton" style={{ width: '60px', height: '1rem', background: 'rgba(255,255,255,0.3)' }}></span>
            ) : (
              <>
                {isLogin ? 'Sign In to Dashboard' : 'Launch Onboarding Flow'}
                <ArrowRight size={18} style={{ marginLeft: '0.25rem' }} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
