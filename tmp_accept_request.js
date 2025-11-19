(async ()=>{
  const fetch = require('node-fetch');
  const base = 'http://localhost:3333';
  try {
    // Login as a known group member (sample user created by seed)
    const loginResp = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mrseanlai@gmail.com', password: 'password123' })
    });
    const login = await loginResp.json();
    console.log('LOGIN_STATUS', loginResp.status);
    if (!loginResp.ok) { console.error('Login failed', login); return; }
    const token = login.token;
    console.log('GOT_TOKEN', !!token);

    // Get group conversations
    const convResp = await fetch(base + '/api/group-conversations', { headers: { 'Authorization': 'Bearer ' + token } });
    const conv = await convResp.json();
    console.log('CONV_STATUS', convResp.status, 'CONV', conv);
    if (!conv || conv.length === 0) { console.error('No group conversation found for this user'); return; }
    const groupId = conv[0].groupId;

    // List join requests
    const jrResp = await fetch(base + `/api/groups/${groupId}/join-requests`, { headers: { 'Authorization': 'Bearer ' + token } });
    const jrBody = await jrResp.json();
    console.log('JR_LIST_STATUS', jrResp.status, jrBody);
    if (!jrResp.ok) { return; }
    if (!jrBody.requests || jrBody.requests.length === 0) { console.log('No pending join requests'); return; }
    const reqId = jrBody.requests[0]._id;

    // Accept the request
    const acceptResp = await fetch(base + `/api/groups/${groupId}/join-request/${reqId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action: 'accept' })
    });
    const acceptBody = await acceptResp.json();
    console.log('ACCEPT_STATUS', acceptResp.status, acceptBody);
  } catch (err) {
    console.error('ERR', err);
  }
})();
