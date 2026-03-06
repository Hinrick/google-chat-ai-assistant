const { query } = require('../db/pool');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

async function handleReportCommand(action, params, context) {
  switch (action) {
    case 'closure_report': {
      const { project_name } = params;
      if (!project_name) return '請指定要產出結案報告的專案名稱。';

      const proj = await query(
        `SELECT * FROM projects WHERE name ILIKE $1 LIMIT 1`,
        [`%${project_name}%`]
      );
      if (proj.rows.length === 0) return `找不到專案「${project_name}」。`;

      const project = proj.rows[0];

      // Get all tasks with completion data
      const tasks = await query(
        `SELECT * FROM tasks WHERE project_id = $1 ORDER BY sort_order ASC, deadline ASC`,
        [project.id]
      );

      // Get members
      const members = await query(
        `SELECT * FROM project_members WHERE project_id = $1`,
        [project.id]
      );

      // Calculate stats
      const allTasks = tasks.rows;
      const doneTasks = allTasks.filter(t => t.status === 'done');
      const overdueTasks = allTasks.filter(t => t.deadline && t.completed_at && new Date(t.completed_at) > new Date(t.deadline));
      const pendingTasks = allTasks.filter(t => t.status !== 'done');

      const taskData = allTasks.map(t => ({
        name: t.name,
        assignee: t.assignee,
        deadline: t.deadline,
        status: t.status,
        completed_at: t.completed_at,
        was_late: t.deadline && t.completed_at && new Date(t.completed_at) > new Date(t.deadline),
      }));

      // Use Claude to generate the report
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: `你是專案管理助手。根據以下資料產出專案結案報告。用繁體中文，格式清晰。`,
        messages: [{
          role: 'user',
          content: `請產出專案結案報告：

專案名稱：${project.name}
計畫開始：${project.start_date}
計畫結束：${project.end_date}
實際狀態：${project.status}
成員：${members.rows.map(m => m.member_name).join('、') || '未記錄'}

任務統計：
- 總任務數：${allTasks.length}
- 已完成：${doneTasks.length}
- 未完成：${pendingTasks.length}
- 逾期完成：${overdueTasks.length}

任務明細：
${JSON.stringify(taskData, null, 2)}

請包含：
1. 專案摘要
2. 完成率與時程分析
3. 延遲項目與原因分析
4. 團隊績效
5. 改善建議`,
        }],
      });

      return `📄 **專案結案報告 — ${project.name}**\n\n${response.content[0].text}`;
    }

    default:
      return '不支援的報告操作。';
  }
}

module.exports = { handleReportCommand };
