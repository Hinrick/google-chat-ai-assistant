const { google } = require('googleapis');

// Cache JWT clients per user email
const jwtClients = new Map();

function getDWDClient(userEmail, scopes) {
  const cacheKey = `${userEmail}:${scopes.join(',')}`;
  if (jwtClients.has(cacheKey)) return jwtClients.get(cacheKey);

  const key = require(process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes,
    subject: userEmail,
  });

  jwtClients.set(cacheKey, auth);
  return auth;
}

// Default impersonation user (workspace admin)
function getDefaultUser() {
  return process.env.GOOGLE_CHAT_IMPERSONATE_USER;
}

module.exports = { getDWDClient, getDefaultUser };
