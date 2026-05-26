import React, { useState, useEffect } from 'react';
import { syncContacts, get } from '../../utils/api';
import { showToast } from '../Common/Toast';
import { useAuth } from '../../context/AuthContext';
import { getFileUrl } from '../../utils/constants';

export default function NewChatPanel({ onClose, onSelectUser }) {
  const { user: currentUser } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await syncContacts();
        setContacts(res.contacts || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await get(`/users/search?q=${searchQuery}`);
        setSearchResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const onZynk = contacts.filter(c => c.is_on_zynk);
  const notOnZynk = contacts.filter(c => !c.is_on_zynk);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: 'var(--sidebar-width)', height: '100%',
      background: 'var(--bg-sidebar)', zIndex: 100, display: 'flex', flexDirection: 'column'
    }} className="slide-in-left">
      <div style={{ height: 'var(--header-height)', display: 'flex', alignItems: 'center', padding: '0 16px', background: 'var(--bg-active)' }}>
        <button onClick={onClose} style={{ marginRight: '16px', color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
        </button>
        <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '18px' }}>New Chat</span>
      </div>

      <div style={{ padding: '15px', overflowY: 'auto', flex: 1 }}>
        <div style={{ marginBottom: '20px' }}>
          <input 
            type="text" 
            placeholder="Search username or phone..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-primary)', outline: 'none' }}
          />
        </div>

        {searchQuery ? (
          <div>
            <div style={{ color: 'var(--accent-primary)', fontSize: '14px', marginBottom: '10px', paddingLeft: '10px', fontWeight: 'bold' }}>Global Search Results</div>
            {isSearching ? <div style={{ color: 'var(--text-secondary)', paddingLeft: '10px' }}>Searching...</div> : (
              searchResults.length > 0 ? searchResults.map(user => (
                <div 
                  key={user.id} 
                  onClick={() => { onSelectUser(user); onClose(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                    {user.avatar_url ? <img src={getFileUrl(user.avatar_url)} style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} /> : (user.display_name[0] || '?').toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '15px' }}>{user.display_name} <span style={{color: 'var(--text-secondary)', fontSize: '13px'}}>@{user.username}</span></div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{user.status_text || 'Hey there! I am using Zynk.'}</div>
                  </div>
                </div>
              )) : <div style={{ color: 'var(--text-secondary)', paddingLeft: '10px' }}>No users found.</div>
            )}
          </div>
        ) : (
          <>
            {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading contacts...</div>}
            
            {/* You Chat (Message yourself) */}
            {currentUser && (
              <div 
                onClick={() => { onSelectUser(currentUser); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', marginBottom: '15px' }}
                className="hover-bg"
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                  {currentUser.avatar_url ? <img src={getFileUrl(currentUser.avatar_url)} style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} /> : (currentUser.display_name?.[0] || 'Y').toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 'bold' }}>You <span style={{color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 'normal'}}>(Message yourself)</span></div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Send messages to yourself</div>
                </div>
              </div>
            )}
            
            {onZynk.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ color: 'var(--accent-primary)', fontSize: '14px', marginBottom: '10px', paddingLeft: '10px', fontWeight: 'bold' }}>Contacts on Zynk</div>
            {onZynk.map(c => (
              <div 
                key={c.id} 
                onClick={() => { onSelectUser(c.user); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                  {c.user?.avatar_url ? <img src={getFileUrl(c.user.avatar_url)} style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} /> : (c.contact_name[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '15px' }}>{c.contact_name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{c.user?.status_text || 'Hey there! I am using Zynk.'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {notOnZynk.length > 0 && (
          <div>
            <div style={{ color: 'var(--accent-primary)', fontSize: '14px', marginBottom: '10px', paddingLeft: '10px', fontWeight: 'bold' }}>Invite to Zynk</div>
            {notOnZynk.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                  {c.contact_name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '15px' }}>{c.contact_name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{c.phone_number}</div>
                </div>
                <button 
                  onClick={() => showToast(`Invitation SMS sent to ${c.phone_number} (Simulated)`, 'success')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  INVITE
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && contacts.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '20px' }}>
            No contacts found.<br/>Open Address Book to add some!
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
