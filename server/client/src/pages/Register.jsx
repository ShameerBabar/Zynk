import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../components/Common/Toast';
import './Login.css';

export default function Register() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    phone: '',
    username: '',
    displayName: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const validateStep1 = () => {
    if (!formData.phone || formData.phone.length < 5) return 'Valid phone number required';
    return null;
  };

  const validateStep2 = () => {
    if (!formData.username || formData.username.length < 3) return 'Username must be at least 3 characters';
    if (!formData.displayName) return 'Display name is required';
    return null;
  };

  const validateStep3 = () => {
    if (!formData.password || formData.password.length < 6) return 'Password must be at least 6 characters';
    return null;
  };

  const nextStep = () => {
    let err = null;
    if (step === 1) err = validateStep1();
    if (step === 2) err = validateStep2();
    if (err) {
      setError(err);
      return;
    }
    setStep(step + 1);
  };

  const prevStep = () => setStep(step - 1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateStep3();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    try {
      await register({
        phone: formData.phone,
        username: formData.username,
        display_name: formData.displayName,
        password: formData.password
      });
      showToast('Account created successfully', 'success');
      navigate(from);
    } catch (err) {
      setError(err.message || 'Registration failed');
      showToast(err.message || 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container flex-center">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Create Account</h1>
          <p>Step {step} of 3</p>
          <div className="progress-dots">
            {[1, 2, 3].map(i => (
              <div key={i} className={`dot ${step >= i ? 'active' : ''}`}></div>
            ))}
          </div>
        </div>

        {error && <div className="auth-error shake">{error}</div>}

        <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); nextStep(); }} className="auth-form">
          {step === 1 && (
            <div className="step-content fadeIn">
              <div className="form-group">
                <label>Phone Number</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                  <input 
                    type="text" 
                    name="phone"
                    value={formData.phone} 
                    onChange={handleChange} 
                    placeholder="+1 234 567 8900" 
                    autoFocus
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="step-content fadeIn">
              <div className="form-group">
                <label>Username</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <input 
                    type="text" 
                    name="username"
                    value={formData.username} 
                    onChange={handleChange} 
                    placeholder="Choose a unique username" 
                    autoFocus
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <input 
                    type="text" 
                    name="displayName"
                    value={formData.displayName} 
                    onChange={handleChange} 
                    placeholder="How others see you" 
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="step-content fadeIn">
              <div className="form-group">
                <label>Password</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input 
                    type="password" 
                    name="password"
                    value={formData.password} 
                    onChange={handleChange} 
                    placeholder="Create a strong password" 
                    autoFocus
                  />
                </div>
                <div className="password-strength mt-2" style={{ marginTop: '10px' }}>
                  <div className="strength-bar" style={{ 
                    height: '4px', 
                    background: formData.password.length > 8 ? 'var(--online-color)' : formData.password.length > 5 ? 'var(--accent-warning)' : 'var(--bg-active)',
                    borderRadius: '2px',
                    transition: 'all 0.3s'
                  }}></div>
                </div>
              </div>
            </div>
          )}

          <div className="flex" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            {step > 1 && (
              <button type="button" className="auth-btn" style={{ background: 'var(--bg-active)', color: 'var(--text-primary)' }} onClick={prevStep}>
                Back
              </button>
            )}
            <button type="submit" className="auth-btn" style={{ flex: 1 }} disabled={loading}>
              {loading ? <div className="spinner"></div> : (step === 3 ? 'Create Account' : 'Next')}
            </button>
          </div>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Log in here</Link>
        </div>
      </div>
    </div>
  );
}
