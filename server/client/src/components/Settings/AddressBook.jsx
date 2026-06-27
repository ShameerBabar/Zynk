import React, { useState, useEffect } from 'react';
import { syncContacts, addDeviceContact, deleteDeviceContact } from '../../utils/api';
import { showToast } from '../Common/Toast';

export default function AddressBook({ onClose }) {
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const res = await syncContacts();
      setContacts(res.contacts || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const handleAdd = async () => {
    if (!name.trim() || !phone.trim()) return showToast('Name and phone are required', 'error');
    try {
      await addDeviceContact(name.trim(), phone.trim());
      showToast('Contact added', 'success');
      setName('');
      setPhone('');
      loadContacts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDeviceContact(id);
      loadContacts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="sidebar-panel slide-in-left">
      <div style={{ height: 'var(--header-height)', display: 'flex', alignItems: 'center', padding: '0 16px', background: 'var(--bg-active)' }}>
        <button onClick={onClose} style={{ marginRight: '16px', color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
        </button>
        <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '18px' }}>Device Address Book</span>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.4' }}>
          Simulate your phone's address book here. Add names and phone numbers to see them sync in your New Chat screen!
        </p>

        <div style={{ background: 'var(--bg-app)', padding: '15px', borderRadius: 'var(--radius-md)' }}>
          <input 
            placeholder="Contact Name (e.g. John)" 
            value={name} onChange={e => setName(e.target.value)} 
            style={{ width: '100%', marginBottom: '10px', padding: '8px', background: 'var(--bg-input)', border: 'none', color: 'var(--text-primary)', borderRadius: '4px', outline: 'none' }}
          />
          <input 
            placeholder="Phone Number (e.g. 555-1234)" 
            value={phone} onChange={e => setPhone(e.target.value)} 
            style={{ width: '100%', marginBottom: '10px', padding: '8px', background: 'var(--bg-input)', border: 'none', color: 'var(--text-primary)', borderRadius: '4px', outline: 'none' }}
          />
          <button 
            onClick={handleAdd}
            style={{ width: '100%', background: 'var(--accent-primary)', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Add Contact
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        {loading ? <div style={{ color: 'var(--text-secondary)' }}>Loading...</div> : contacts.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{c.contact_name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{c.phone_number} {c.is_on_zynk && <span style={{ color: 'var(--accent-primary)' }}>(On Zynk)</span>}</div>
            </div>
            <button onClick={() => handleDelete(c.id)} style={{ background: 'transparent', border: 'none', color: '#f26262', cursor: 'pointer', fontSize: '20px' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
