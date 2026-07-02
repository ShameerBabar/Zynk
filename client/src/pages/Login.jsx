import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../components/Common/Toast';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import './Login.css';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('zynk_remember') === 'true');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';
  const googleBtnRef = useRef(null);

  // Pre-fill username if Remember Me was previously checked
  useEffect(() => {
    if (localStorage.getItem('zynk_remember') === 'true') {
      const saved = localStorage.getItem('zynk_saved_identifier');
      if (saved) setIdentifier(saved);
    }
  }, []);

  const handleGoogleLoginSuccess = async (response) => {
    setLoading(true);
    setError('');
    try {
      await loginWithGoogle(response.credential);
      showToast('Logged in with Google successfully', 'success');
      navigate(from);
    } catch (err) {
      setError(err.message || 'Google login failed');
      showToast(err.message || 'Google login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleNativeGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      GoogleAuth.initialize();
      const result = await GoogleAuth.signIn();
      if (result.authentication && result.authentication.idToken) {
        await loginWithGoogle(result.authentication.idToken);
        showToast('Logged in with Google successfully', 'success');
        navigate(from);
      } else {
        throw new Error('No token received');
      }
    } catch (err) {
      console.error('Native Google Auth Error:', err);
      setError(err.message || 'Google login failed');
      showToast(err.message || 'Google login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    // Check if we are running in Capacitor Native environment
    const isCapacitorNative = !!window.Capacitor?.isNativePlatform?.();
    setIsNative(isCapacitorNative);

    if (isCapacitorNative) {
      // Don't initialize web Google Sign-In on Android
      return;
    }

    let retryCount = 0;
    const initGoogle = () => {
      console.log("VITE_GOOGLE_CLIENT_ID from env:", import.meta.env.VITE_GOOGLE_CLIENT_ID);
      if (window.google?.accounts?.id) {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "1032338029517-57p2q55v3r3q8v4j3j1e1h8j5e1h8j5e.apps.googleusercontent.com";
        console.log("Using Google Client ID for initialization:", clientId);
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleLoginSuccess
        });

        window.google.accounts.id.renderButton(
          googleBtnRef.current,
          { theme: "filled_blue", size: "large", width: "100%", text: "continue_with" }
        );
      } else {
        retryCount++;
        if (retryCount < 50) {
          setTimeout(initGoogle, 100);
        } else {
          console.warn("Google Sign-In script failed to load after 5 seconds.");
        }
      }
    };
    initGoogle();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(identifier, password, rememberMe);
      // Save remember me preference and identifier for next visit
      if (rememberMe) {
        localStorage.setItem('zynk_remember', 'true');
        localStorage.setItem('zynk_saved_identifier', identifier);
      } else {
        localStorage.removeItem('zynk_remember');
        localStorage.removeItem('zynk_saved_identifier');
      }
      showToast('Logged in successfully', 'success');
      navigate(from);
    } catch (err) {
      setError(err.message || 'Failed to login');
      showToast(err.message || 'Failed to login', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container flex-center">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-container">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="var(--accent-primary)">
              <path d="M12 2C6.48 2 2 6.03 2 11c0 2.84 1.5 5.37 3.82 7.03-.23 1.63-1.04 3.12-1.08 3.2-.08.17-.03.38.11.49.14.12.35.13.51.04 2.15-1.2 3.73-2.02 4.67-2.31C10.63 19.8 11.3 20 12 20c5.52 20 10-4.03 10-9s-4.48-9-10-9z"/>
            </svg>
          </div>
          <h1>Welcome to Zynk App</h1>
          <p>Stay connected with your friends and family</p>
        </div>

        {error && <div className="auth-error shake">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Username</label>
            <div className="input-with-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <input 
                type="text" 
                value={identifier} 
                onChange={(e) => setIdentifier(e.target.value)} 
                placeholder="Enter username" 
              />
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="input-with-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="Enter password" 
              />
              <button 
                type="button" 
                className="toggle-password" 
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                )}
              </button>
            </div>
          </div>

          <div className="form-options">
            <label className="remember-me" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              />
              Remember me
            </label>
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? <div className="spinner"></div> : 'Log In'}
          </button>
        </form>

        {!isNative && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-secondary)' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
              <span style={{ padding: '0 10px', fontSize: '13px' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
            </div>

            <div ref={googleBtnRef} style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: '20px' }}></div>
          </>
        )}

        {isNative && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-secondary)' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
              <span style={{ padding: '0 10px', fontSize: '13px' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
            </div>

            <button 
              type="button" 
              className="auth-btn" 
              onClick={handleNativeGoogleLogin}
              style={{ backgroundColor: '#fff', color: '#757575', border: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}
              disabled={loading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </>
        )}

        <div className="auth-footer">
          Don't have an account? <Link to="/register">Register here</Link>
        </div>
      </div>
    </div>
  );
}
