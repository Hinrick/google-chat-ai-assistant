const { routeMessage } = require('../agent/router');

async function handleChatEvent(event) {
  const { type, message, user, space } = event;

  // Google Chat event types
  switch (type) {
    case 'ADDED_TO_SPACE':
      return { text: '你好！我是專案管理 AI 助手。輸入「幫助」查看我能做什麼。' };

    case 'MESSAGE': {
      const userText = message?.text || '';
      const userName = user?.displayName || 'Unknown';
      const spaceId = space?.name || '';

      console.log(`[MSG] ${userName}: ${userText}`);

      const response = await routeMessage({
        text: userText,
        userName,
        userId: user?.name,
        spaceId,
        threadId: message?.thread?.name,
      });

      return { text: response };
    }

    case 'REMOVED_FROM_SPACE':
      console.log(`[INFO] Removed from space: ${space?.name}`);
      return {};

    default:
      return {};
  }
}

module.exports = { handleChatEvent };
