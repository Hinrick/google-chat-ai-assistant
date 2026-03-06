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

async function sendMessage(spaceId, text) {
  try {
    const chat = await getChatClient();
    const res = await chat.spaces.messages.create({
      parent: spaceId,
      requestBody: { text },
    });
    console.log(`[SEND] → ${spaceId}: ${text.substring(0, 50)}...`);
    return res.data;
  } catch (err) {
    console.error(`[SEND] Failed to send to ${spaceId}:`, err.message);
    return null;
  }
}

async function sendMessageToThread(spaceId, threadId, text) {
  try {
    const chat = await getChatClient();
    const res = await chat.spaces.messages.create({
      parent: spaceId,
      requestBody: {
        text,
        thread: { name: threadId },
      },
      messageReplyOption: 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD',
    });
    return res.data;
  } catch (err) {
    console.error(`[SEND] Failed to send thread message:`, err.message);
    return null;
  }
}

module.exports = { sendMessage, sendMessageToThread };
