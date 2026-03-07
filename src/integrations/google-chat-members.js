const { google } = require('googleapis');

let chatClient;

async function getChatClient() {
  if (!chatClient) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY,
      scopes: ['https://www.googleapis.com/auth/chat.bot'],
    });
    chatClient = google.chat({ version: 'v1', auth });
  }
  return chatClient;
}

// Fetch all human members from a Google Chat space
async function listSpaceMembers(spaceId) {
  try {
    const chat = await getChatClient();
    const members = [];
    let pageToken;

    do {
      const res = await chat.spaces.members.list({
        parent: spaceId,
        pageSize: 100,
        pageToken,
      });

      for (const m of res.data.memberships || []) {
        if (m.member && m.member.type === 'HUMAN') {
          members.push({
            userName: m.member.name,        // e.g. "users/123456"
            displayName: m.member.displayName,
            email: m.member.email || null,
          });
        }
      }

      pageToken = res.data.nextPageToken;
    } while (pageToken);

    return members;
  } catch (err) {
    console.error('[CHAT-MEMBERS] Failed to list space members:', err.message);
    return [];
  }
}

module.exports = { listSpaceMembers };
