const { routeMessage } = require('../agent/router');

function extractEvent(event) {
  // Workspace Add-on format: nested under event.chat
  if (event.chat) {
    const chat = event.chat;
    const payload = chat.messagePayload || {};
    return {
      message: payload.message,
      user: chat.user,
      space: payload.space || payload.message?.space,
    };
  }
  // Legacy/direct format
  return { message: event.message, user: event.user, space: event.space };
}

function formatResponse(text) {
  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: {
          message: { text },
        },
      },
    },
  };
}

async function handleChatEvent(event) {
  const { message, user, space } = extractEvent(event);

  // No message means it's an add/remove event
  if (!message) {
    console.log(`[EVENT] Non-message event received`);
    return formatResponse('你好！我是專案管理 AI 助手。輸入「幫助」查看我能做什麼。');
  }

  const userText = message.argumentText?.trim() || message.text || '';
  const userName = user?.displayName || message.sender?.displayName || 'Unknown';
  const userId = user?.name || message.sender?.name;
  const spaceId = space?.name || '';

  console.log(`[MSG] ${userName}: ${userText}`);

  const response = await routeMessage({
    text: userText,
    userName,
    userId,
    spaceId,
    threadId: message.thread?.name,
  });

  return formatResponse(response);
}

module.exports = { handleChatEvent };
