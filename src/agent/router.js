const { analyzeIntent } = require('./intent');
const { handleProjectCommand } = require('../tools/projects');
const { handleTaskCommand } = require('../tools/tasks');
const { handleScheduleCommand } = require('../tools/schedule');
const { handleSopCommand } = require('../tools/sop');
const { handleReportCommand } = require('../tools/reports');

const HELP_TEXT = `我可以幫你：

📁 **專案管理**
• "新專案：新品拍攝，3/15-4/30" — 建立專案（自動套用 SOP）
• "專案狀態" — 查看所有進行中專案
• "新品拍攝進度" — 查看特定專案

📋 **任務管理**
• "新增任務：拍攝樣品照，負責人：小美，截止：3/20"
• "完成：拍攝樣品照" — 標記完成（自動通知下一關）
• "我的待辦" — 查看你的任務

📅 **SOP 模板**
• "SOP 模板" — 查看可用模板
• "套用 SOP 到新品拍攝" — 手動套用模板

⏰ **時程模擬**
• "如果延遲兩週會怎樣？" — 模擬延遲影響

📄 **報告**
• "結案報告：新品拍攝" — 產出專案結案報告`;

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

    case 'list_templates':
      return handleSopCommand('list_templates', intent.params, { userName, userId, spaceId });

    case 'apply_template':
      return handleSopCommand('apply_template', intent.params, { userName, userId, spaceId });

    case 'closure_report':
      return handleReportCommand('closure_report', intent.params, { userName, userId, spaceId });

    case 'unknown':
    default:
      return `我不太確定你的意思。輸入「幫助」查看我能做什麼。`;
  }
}

module.exports = { routeMessage };
