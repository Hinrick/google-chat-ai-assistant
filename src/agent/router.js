const { analyzeIntent } = require('./intent');
const { handleProjectCommand } = require('../tools/projects');
const { handleTaskCommand } = require('../tools/tasks');
const { handleScheduleCommand } = require('../tools/schedule');

const HELP_TEXT = `我可以幫你：
• **建立專案** — "新專案：新品拍攝，3/15-4/30"
• **查看進度** — "目前進度" 或 "專案狀態"
• **新增任務** — "新增任務：拍攝樣品照，負責人：小美，截止：3/20"
• **完成任務** — "完成：拍攝樣品照"
• **模擬延遲** — "如果延遲兩週會怎樣？"
• **查看待辦** — "我的待辦"`;

async function routeMessage({ text, userName, userId, spaceId, threadId }) {
  const trimmed = text.replace(/@\S+\s*/, '').trim();

  if (!trimmed || trimmed === '幫助' || trimmed === 'help') {
    return HELP_TEXT;
  }

  const intent = await analyzeIntent(trimmed);

  switch (intent.action) {
    case 'create_project':
      return handleProjectCommand('create', intent.params, { userName, userId, spaceId });

    case 'project_status':
      return handleProjectCommand('status', intent.params, { userName, userId, spaceId });

    case 'create_task':
      return handleTaskCommand('create', intent.params, { userName, userId, spaceId });

    case 'complete_task':
      return handleTaskCommand('complete', intent.params, { userName, userId, spaceId });

    case 'my_tasks':
      return handleTaskCommand('list', intent.params, { userName, userId, spaceId });

    case 'simulate_delay':
      return handleScheduleCommand('simulate', intent.params, { userName, userId, spaceId });

    case 'unknown':
    default:
      return `我不太確定你的意思。輸入「幫助」查看我能做什麼。`;
  }
}

module.exports = { routeMessage };
