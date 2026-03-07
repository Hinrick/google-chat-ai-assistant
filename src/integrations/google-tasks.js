const { google } = require('googleapis');
const { getDWDClient, getDefaultUser } = require('./google-auth');

const SCOPES = ['https://www.googleapis.com/auth/tasks'];

async function getTasksClient(userEmail) {
  const email = userEmail || getDefaultUser();
  const auth = getDWDClient(email, SCOPES);
  return google.tasks({ version: 'v1', auth });
}

// Get or create a task list named "PM Assistant"
async function getTaskListId(tasksClient) {
  try {
    const res = await tasksClient.tasklists.list({ maxResults: 100 });
    const lists = res.data.items || [];
    const existing = lists.find(l => l.title === 'PM Assistant');
    if (existing) return existing.id;

    const created = await tasksClient.tasklists.insert({
      requestBody: { title: 'PM Assistant' },
    });
    return created.data.id;
  } catch (err) {
    console.error('[GTASKS] Failed to get/create task list:', err.message);
    return null;
  }
}

async function createGoogleTask({ title, notes, due, userEmail }) {
  try {
    const client = await getTasksClient(userEmail);
    const listId = await getTaskListId(client);
    if (!listId) return null;

    const taskBody = { title };
    if (notes) taskBody.notes = notes;
    // Google Tasks API expects due as RFC 3339 date (midnight UTC)
    if (due) taskBody.due = `${due}T00:00:00.000Z`;

    const res = await client.tasks.insert({
      tasklist: listId,
      requestBody: taskBody,
    });

    console.log(`[GTASKS] Created task "${title}" for ${userEmail || 'default'}`);
    return res.data.id;
  } catch (err) {
    console.error(`[GTASKS] Failed to create task "${title}":`, err.message);
    return null;
  }
}

async function completeGoogleTask({ googleTaskId, userEmail }) {
  if (!googleTaskId) return;
  try {
    const client = await getTasksClient(userEmail);
    const listId = await getTaskListId(client);
    if (!listId) return;

    await client.tasks.patch({
      tasklist: listId,
      task: googleTaskId,
      requestBody: { status: 'completed' },
    });

    console.log(`[GTASKS] Completed task ${googleTaskId} for ${userEmail || 'default'}`);
  } catch (err) {
    console.error(`[GTASKS] Failed to complete task:`, err.message);
  }
}

module.exports = { createGoogleTask, completeGoogleTask };
