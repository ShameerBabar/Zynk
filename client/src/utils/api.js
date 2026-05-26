import { API_BASE } from './constants';

const getToken = () => localStorage.getItem('zynk_token');

export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set content type if not FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  let data;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error || response.statusText || 'API Request Failed';
    throw new Error(message);
  }

  return data;
}

export const get = (url) => apiRequest(url, { method: 'GET' });
export const post = (url, body) => apiRequest(url, { method: 'POST', body: JSON.stringify(body) });
export const put = (url, body) => apiRequest(url, { method: 'PUT', body: JSON.stringify(body) });
export const del = (url) => apiRequest(url, { method: 'DELETE' });

export const uploadFile = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest('/files/upload', { method: 'POST', body: formData });
};

export const uploadAvatar = (file) => {
  const formData = new FormData();
  formData.append('avatar', file);
  return apiRequest('/files/avatar', { method: 'POST', body: formData });
};

export const syncContacts = () => get('/contacts/sync');
export const addDeviceContact = (contact_name, phone_number) => post('/contacts', { contact_name, phone_number });
export const deleteDeviceContact = (id) => del(`/contacts/${id}`);
