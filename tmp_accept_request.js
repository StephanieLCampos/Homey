/**
 * JOIN-REQUEST ACCEPTANCE SMOKE TEST (throwaway script)
 *
 * Drives the group join-request flow end to end over HTTP against a locally
 * running server: log in as a known group member, fetch that member's group
 * conversation, list the group's pending join requests, and accept the first
 * one. Each step's status code and body are printed.
 *
 * Unlike the diagnostic scripts in server/, this one exercises the real API
 * surface rather than the database, which is what made it useful for confirming
 * that authentication and routing were behaving as well as the data layer.
 *
 * Usage: with the server running on port 3333, run from the repository root
 *        `node tmp_accept_request.js`
 *
 * Connections:
 *   - server/index.js       - the endpoints exercised.
 *   - server/routes/auth.js - the login call.
 *   - package.json          - the repository root's only dependency,
 *                             node-fetch, exists solely for this script.
 *
 * Notes:
 *   - The `tmp_` prefix and the hard-coded sample credentials mark this as a
 *     throwaway from one debugging session; it performs a real, irreversible
 *     accept against whatever server it is pointed at.
 *   - Listed in the dead-file audit.
 */
(async ()=>{
  const fetch = require('node-fetch');
  const base = 'http://localhost:3333';
  try {
    // Login as a known group member (sample user created by seed)
    const loginResp = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // A seeded sample account - see initializeSampleData() in server/index.js.
      // Must be a member of a group for the rest of this script to do anything.
      body: JSON.stringify({ email: 'alex@example.com', password: 'password123' })
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
