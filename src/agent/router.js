const { analyzeIntent } = require('./intent');
const { handleProjectCommand } = require('../tools/projects');
const { handleTaskCommand } = require('../tools/tasks');
const { handleScheduleCommand } = require('../tools/schedule');
const { handleSopCommand } = require('../tools/sop');
const { handleReportCommand } = require('../tools/reports');
const { handleMemberCommand } = require('../tools/members');

const HELP_TEXT = `我可以幫你：

📁 **專案管理**
• "新專案：新品拍攝，3/15-4/30" — 建立專案
• "專案狀態" — 查看所有進行中專案

📋 **任務管理**
• "建立任務：產品拍攝，截止：3/20" — 從模板建立主任務+子任務
• "新增任務：拍攝樣品照，負責人：小美" — 建立單一任務
• "完成：拍攝樣品照" — 標記完成（自動通知下一關）
• "我的待辦" — 查看你的任務
• "任務詳情：產品拍攝" — 查看任務與子任務
• "任務模板" — 查看可用模板

👥 **團隊管理**
• "同步成員" — 從群組自動同步成員
• "更新成員：小美，角色：設計師，部門：設計部" — 設定角色資訊
• "團隊成員" — 查看所有成員
• "誰最忙" — 查看工作負載

📅 **SOP 模板**
• "SOP 模板" — 查看 SOP 模板
• "套用 SOP 到新品拍攝" — 套用模板到專案

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

    case 'create_main_task':
      return handleTaskCommand('create_main_task', intent.params, { userName, userId, spaceId });

    case 'complete_task':
      return handleTaskCommand('complete', intent.params, { userName, userId, spaceId });

    case 'my_tasks':
      return handleTaskCommand('list', intent.params, { userName, userId, spaceId });

    case 'task_detail':
      return handleTaskCommand('task_detail', intent.params, { userName, userId, spaceId });

    case 'task_templates':
      return handleTaskCommand('list_templates', intent.params, { userName, userId, spaceId });

    case 'simulate_delay':
      return handleScheduleCommand('simulate', intent.params, { userName, userId, spaceId });

    case 'list_templates':
      return handleSopCommand('list_templates', intent.params, { userName, userId, spaceId });

    case 'apply_template':
      return handleSopCommand('apply_template', intent.params, { userName, userId, spaceId });

    case 'closure_report':
      return handleReportCommand('closure_report', intent.params, { userName, userId, spaceId });

    case 'sync_members':
      return handleMemberCommand('sync_members', intent.params, { userName, userId, spaceId });

    case 'add_member':
      return handleMemberCommand('add_member', intent.params, { userName, userId, spaceId });

    case 'list_members':
      return handleMemberCommand('list_members', intent.params, { userName, userId, spaceId });

    case 'team_workload':
      return handleMemberCommand('team_workload', intent.params, { userName, userId, spaceId });

    case 'unknown':
    default:
      return `我不太確定你的意思。輸入「幫助」查看我能做什麼。`;
  }
}

module.exports = { routeMessage };
