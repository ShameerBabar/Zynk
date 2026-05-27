import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { post } from '../utils/api';
import { API_BASE, getFileUrl } from '../utils/constants';
import { showToast } from '../components/Common/Toast';

export default function InvitePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [invitedUser, setInvitedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${API_BASE}/public/user/${username}`);
        const data = await res.json();
        if (res.ok) {
          setInvitedUser(data.user);
        } else {
          setError(data.error || 'User not found');
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError('Failed to load user profile');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [username]);

  const handleStartChat = async () => {
    if (!user) {
      navigate('/login', { state: { from: `/invite/${username}` } });
      return;
    }
    try {
      // Add contact
      try {
        await post(`/contacts/${invitedUser.id}`);
      } catch (err) {
        // ignore if already contact
      }

      // Get or create conversation record
      const data = await post(`/messages/conversations/private/${invitedUser.id}`);
      const conversation = data.conversation;

      // Navigate home and pass the conversation in state to select it automatically
      navigate('/', { state: { selectConversation: conversation } });
    } catch(err) {
      console.error('Failed to start chat:', err);
      showToast(err.message || 'Failed to start chat', 'error');
    }
  };

  if (loading || authLoading) return <div className="flex-center" style={{height: '100vh', color: 'white'}}>Loading...</div>;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-app)' }}>
      <div style={{ background: 'var(--bg-sidebar)', padding: '40px', borderRadius: '12px', boxShadow: 'var(--shadow-lg)', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        
        {error || !invitedUser ? (
          <div>
            <h2 style={{ color: 'var(--accent-danger)' }}>Oops!</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '10px' }}>{error || 'User profile not available'}</p>
            <button onClick={() => navigate('/')} style={{ marginTop: '20px', padding: '10px 20px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Go Home</button>
          </div>
        ) : (
          <div>
            <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '36px', fontWeight: 'bold', margin: '0 auto 20px', overflow: 'hidden' }}>
              {invitedUser.avatar_url ? (
                <img src={getFileUrl(invitedUser.avatar_url)} style={{width: '100%', height: '100%', objectFit: 'cover'}} alt="Avatar" />
              ) : (
                ((invitedUser.display_name?.[0] || invitedUser.username?.[0] || '?').toUpperCase())
              )}
            </div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '5px' }}>{invitedUser.display_name || invitedUser.username}</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>@{invitedUser.username}</p>
            <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '30px' }}>"{invitedUser.status_text || 'Hey there! I am using Zynk.'}"</p>

            <button 
              onClick={handleStartChat}
              style={{ width: '100%', padding: '12px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {user ? 'Start Chatting' : 'Login to Chat'}
            </button>
            
            {!user && (
              <p style={{ color: 'var(--text-secondary)', marginTop: '20px', fontSize: '14px' }}>
                New to Zynk? <a href="/register" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>Create an account</a>
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
