import React, { useState } from 'react';
import { Search, Check, FileText, CreditCard, ShieldCheck, AlertCircle } from 'lucide-react';

interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
}

interface NumberWizardProps {
  token: string;
  onProvisionSuccess: (newNumber: any) => void;
  onCancel: () => void;
}

export const NumberWizard: React.FC<NumberWizardProps> = ({ token, onProvisionSuccess, onCancel }) => {
  const [step, setStep] = useState(1); // Steps 1, 2, 3, 4 (Success)
  const [areaCode, setAreaCode] = useState('512');
  const [numbers, setNumbers] = useState<AvailableNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<AvailableNumber | null>(null);
  
  // Terms check
  const [termsAccepted, setTermsAccepted] = useState(false);

  // States
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle Search API
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSelectedNumber(null);

    if (!/^\d{3}$/.test(areaCode)) {
      setError('Area code must be a 3-digit number (e.g., 512, 212, 650).');
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/tenants/numbers/search?areaCode=${areaCode}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to search for available numbers.');
      }

      setNumbers(data.numbers || []);
    } catch (err: any) {
      setError(err.message || 'An error occurred during search.');
    } finally {
      setSearching(false);
    }
  };

  // Handle Provisioning API
  const handleProvision = async () => {
    if (!selectedNumber) return;
    setError(null);
    setPurchasing(true);

    try {
      const response = await fetch('/api/tenants/numbers/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          phoneNumber: selectedNumber.phoneNumber,
          friendlyName: `Charlotte Desk Line - ${selectedNumber.friendlyName}`,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to provision this phone number.');
      }

      // Proceed to Step 4 (Success Screen)
      setStep(4);
      setTimeout(() => {
        onProvisionSuccess(data.twilioPhoneNumber);
      }, 3500); // Let the success state shine for a few seconds first!

    } catch (err: any) {
      setError(err.message || 'An error occurred during purchase.');
      setPurchasing(false);
    }
  };

  return (
    <div className="wizard-container glass-card" style={{ padding: '2.5rem' }}>
      
      {/* HEADER */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
          Provision Charlotte AI Phone Line
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Secure a local business hotline with automated receptionists and compliance routing.
        </p>
      </div>

      {/* STEP TRACKER PROGRESS BULLETS */}
      <div className="wizard-steps" style={{ marginBottom: '3rem' }}>
        <div className={`wizard-step ${step >= 1 ? 'completed' : ''} ${step === 1 ? 'active' : ''}`} id="wizard-step-1">
          {step > 1 ? <Check size={16} /> : '1'}
        </div>
        <div className={`wizard-step ${step >= 2 ? 'completed' : ''} ${step === 2 ? 'active' : ''}`} id="wizard-step-2">
          {step > 2 ? <Check size={16} /> : '2'}
        </div>
        <div className={`wizard-step ${step >= 3 ? 'completed' : ''} ${step === 3 ? 'active' : ''}`} id="wizard-step-3">
          {step > 3 ? <Check size={16} /> : '3'}
        </div>
      </div>

      {/* ERROR FEEDBACK BAR */}
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

      {/* STEP 1: SEARCH & CHOOSE NUMBER */}
      {step === 1 && (
        <div style={{ animation: 'modalScaleUp 0.3s ease' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '2rem' }}>
            <div className="form-group" style={{ flexGrow: 1, marginBottom: 0 }}>
              <label className="form-label" htmlFor="wizard-area-code">Area Code</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>
                  <Search size={18} />
                </span>
                <input
                  id="wizard-area-code"
                  type="text"
                  maxLength={3}
                  className="input-field"
                  placeholder="512"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ''))}
                  style={{ paddingLeft: '2.75rem' }}
                />
              </div>
            </div>
            <button
              id="wizard-search-btn"
              type="submit"
              className="gradient-btn"
              style={{ height: '48px', padding: '0 1.5rem' }}
              disabled={searching}
            >
              {searching ? 'Searching...' : 'Search Numbers'}
            </button>
          </form>

          {/* SKELETON LOADER STATE */}
          {searching && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-card skeleton" style={{ height: '80px', borderRadius: 'var(--border-radius-md)', width: '100%' }}></div>
              ))}
            </div>
          )}

          {/* NUMBERS RESULTS GRID */}
          {!searching && numbers.length > 0 && (
            <div style={{ animation: 'modalScaleUp 0.25s ease' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Select an available phone number to proceed with provisioning:
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '1rem',
                maxHeight: '260px',
                overflowY: 'auto',
                padding: '0.25rem'
              }}>
                {numbers.map((num) => {
                  const isSelected = selectedNumber?.phoneNumber === num.phoneNumber;
                  return (
                    <div
                      key={num.phoneNumber}
                      onClick={() => setSelectedNumber(num)}
                      className="glass-card interactive"
                      style={{
                        padding: '1rem',
                        borderRadius: 'var(--border-radius-md)',
                        cursor: 'pointer',
                        borderColor: isSelected ? 'var(--accent-teal)' : 'var(--card-border)',
                        background: isSelected ? 'hsla(172, 77%, 42%, 0.1)' : 'var(--glass-gradient)',
                        boxShadow: isSelected ? 'var(--border-glow)' : 'none',
                        position: 'relative'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-primary)' }}>
                        {num.friendlyName}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {num.locality}, {num.region}
                      </div>
                      {isSelected && (
                        <span style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '0.75rem',
                          color: 'var(--accent-teal)',
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: '50%',
                          padding: '2px'
                        }}>
                          <Check size={16} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!searching && numbers.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              border: '1px dashed var(--card-border)',
              borderRadius: 'var(--border-radius-md)',
              color: 'var(--text-secondary)',
              fontSize: '0.9rem'
            }}>
              Input an area code and search for available telephone hotlines above.
            </div>
          )}

          {/* ACTIONS */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2.5rem' }}>
            <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
            <button
              id="wizard-step1-next"
              type="button"
              className="gradient-btn"
              disabled={!selectedNumber}
              onClick={() => setStep(2)}
            >
              Continue Compliance Review
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: COMPLIANCE & TERMS */}
      {step === 2 && (
        <div style={{ animation: 'modalScaleUp 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <FileText size={22} style={{ color: 'var(--accent-teal)' }} />
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Compliance Guidelines & Agreement</h3>
          </div>

          <div style={{
            background: 'var(--input-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--border-radius-md)',
            padding: '1.25rem',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            marginBottom: '2rem',
            maxHeight: '220px',
            overflowY: 'auto'
          }}>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>US/Canada local number telecommunications terms:</p>
            <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li>This phone number will be used solely for inbound business receptionist routing.</li>
              <li>Forwarding calls to external numbers conforms to the Telephone Consumer Protection Act (TCPA) and Twilio security policies.</li>
              <li>Tenant agrees that no spam, unsolicited outbound cold dialing, or unconsented text blasting will occur on this route.</li>
              <li>Row-Level Security (RLS) policies isolate all call sessions, recordings, and analytics data of this tenant.</li>
            </ul>
          </div>

          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            padding: '0.5rem'
          }}>
            <input
              id="wizard-compliance-checkbox"
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              style={{ marginTop: '0.2rem', accentColor: 'var(--accent-teal)' }}
            />
            <span>I agree to Charlotte's Terms of Service and compliance guidelines.</span>
          </label>

          {/* ACTIONS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '2.5rem' }}>
            <button type="button" className="secondary-btn" onClick={() => setStep(1)}>Back</button>
            <button
              id="wizard-step2-next"
              type="button"
              className="gradient-btn"
              disabled={!termsAccepted}
              onClick={() => setStep(3)}
            >
              Verify Number Details
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PURCHASE & PROVISION */}
      {step === 3 && (
        <div style={{ animation: 'modalScaleUp 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <CreditCard size={22} style={{ color: 'var(--accent-teal)' }} />
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Confirm Provision Details</h3>
          </div>

          <div style={{
            background: 'var(--glass-gradient)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            marginBottom: '2rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--card-border)', marginBottom: '1rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Selected Hotline:</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--text-primary)' }}>{selectedNumber?.friendlyName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--card-border)', marginBottom: '1rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Type:</span>
              <span style={{ fontWeight: 600 }}>Local Business (Voice)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--card-border)', marginBottom: '1rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Location:</span>
              <span style={{ fontWeight: 600 }}>{selectedNumber?.locality}, {selectedNumber?.region}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Pricing:</span>
              <span style={{ fontWeight: 700, color: 'var(--accent-teal)' }}>Included in Onboarding Plan</span>
            </div>
          </div>

          {/* ACTIONS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '2.5rem' }}>
            <button type="button" className="secondary-btn" onClick={() => setStep(2)} disabled={purchasing}>Back</button>
            <button
              id="wizard-provision-btn"
              type="button"
              className="gradient-btn"
              disabled={purchasing}
              onClick={handleProvision}
              style={{ minWidth: '180px' }}
            >
              {purchasing ? 'Provisioning...' : 'Provision Hotline'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS CONFIRMATION SHIMMER */}
      {step === 4 && (
        <div style={{
          textAlign: 'center',
          padding: '2rem 1rem',
          animation: 'modalScaleUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'hsla(142, 72%, 40%, 0.1)',
            border: '2px solid var(--success)',
            color: 'var(--success)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <ShieldCheck size={36} />
          </div>

          <h3 style={{ fontSize: '1.4rem', marginBottom: '0.75rem', fontFamily: 'var(--font-heading)' }}>
            Hotline Successfully Provisioned!
          </h3>
          
          <div style={{
            fontSize: '1.8rem',
            fontWeight: 800,
            background: 'var(--cta-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '0.02em',
            margin: '1rem 0'
          }}>
            {selectedNumber?.friendlyName}
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '380px', margin: '0 auto' }}>
            The Webhook has been isolated and assigned to your RLS tenant context.
            Redirecting you to the active workspace overview panel...
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem', alignItems: 'center' }}>
            <span className="pulse-dot"></span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Syncing Database Records</span>
          </div>
        </div>
      )}

    </div>
  );
};
