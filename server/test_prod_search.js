const fetch = require('node-fetch');

async function test() {
  const url = 'https://zynk-backend-k7bl.onrender.com';
  
  // 1. Register a user
  const userStr = 'usr' + Date.now().toString().slice(-7);
  let res = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: userStr,
      phone: '123' + Date.now().toString().slice(-7),
      password: 'password',
      display_name: 'Test User'
    })
  });
  const authData = await res.json();
  if (!authData.token) {
    console.log('Register failed', authData);
    return;
  }
  const token = authData.token;
  console.log('Registered', userStr);

  // 2. Fetch the debug route to see if it exists (which confirms Render deployed)
  res = await fetch(`${url}/api/search/debug`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.status === 404) {
    console.log('Backend on Render is STILL running OLD code! (404 on /debug)');
  } else {
    console.log('Backend on Render has updated! Status:', res.status);
    const text = await res.text();
    console.log('Response:', text);
  }
}

test();
