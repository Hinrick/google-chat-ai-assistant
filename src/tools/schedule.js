const { query } = require('../db/pool');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

async function handleScheduleCommand(action, params, context) {
  switch (action) {
    case 'simulate': {
      const { project_name, delay_days, reason } = params;

      // Find the project
      let projectQuery;
      if (project_name) {
        projectQuery = await query(
          `SELECT * FROM projects WHERE name ILIKE $1 AND status = 'active' LIMIT 1`,
          [`%${project_name}%`]
        );
      } else {
        projectQuery = await query(
          `SELECT * FROM projects WHERE space_id = $1 AND status = 'active'
           ORDER BY created_at DESC LIMIT 1`,
          [context.spaceId]
        );
      }

      if (projectQuery.rows.length === 0) return '找不到專案來模擬延遲。';

      const project = projectQuery.rows[0];

      // Get all pending tasks
      const tasks = await query(
        `SELECT * FROM tasks WHERE project_id = $1 AND status != 'done'
         ORDER BY deadline ASC NULLS LAST`,
        [project.id]
      );

      // Use Claude to analyze impact
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `你是專案管理助手。根據以下專案和任務資料，分析延遲的影響。用繁體中文回答，簡潔明瞭。`,
        messages: [{
          role: 'user',
          content: `專案：${project.name}
原定結束日：${project.end_date}
延遲天數：${delay_days || '未指定'}
延遲原因：${reason || '未指定'}
待完成任務：${JSON.stringify(tasks.rows.map((t) => ({ name: t.name, deadline: t.deadline, assignee: t.assignee })))}

請分析：
1. 延遲後的新預計結束日
2. 哪些任務會受影響
3. 建議的應對措施`,
        }],
      });

      return `⏰ **延遲模擬 — ${project.name}**\n\n${response.content[0].text}`;
    }

    default:
      return '不支援的排程操作。';
  }
}

module.exports = { handleScheduleCommand };
