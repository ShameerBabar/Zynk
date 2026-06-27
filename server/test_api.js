const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/messages/conversations',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer test_shameer_token_or_just_auth_override', 
    // Wait, the API requires a valid JWT token. 
    // Let me just fetch it by bypassing JWT, or I can just use my test_db.js which I already did!
  }
};
