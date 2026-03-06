require('dotenv').config();

const express = require('express');
const { handleChatEvent } = require('./chat/handler');
const { initDb } = require('./db/pool');
const { startSyncLoop } = require('./sync/notion');
const { startReminderScheduler } = require('./tools/reminders');

const app = express();
app.use(express.json());

// Google Chat sends events here
app.post('/chat', async (req, res) => {
  try {
    const response = await handleChatEvent(req.body);
    res.json(response);
  } catch (err) {
    console.error('[CHAT] Error handling event:', err);
    res.json({
      hostAppDataAction: {
        chatDataAction: {
          createMessageAction: {
            message: { text: '抱歉，發生錯誤，請稍後再試。' },
          },
        },
      },
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  await initDb();
  console.log('[DB] Connected');

  startSyncLoop(5 * 60 * 1000);
  console.log('[SYNC] Notion sync started (every 5 min)');

  startReminderScheduler();

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`=== Google Chat AI Assistant v2.0 ===`);
    console.log(`Listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
