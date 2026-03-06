const { query } = require('../db/pool');

async function handleTaskCommand(action, params, context) {
  switch (action) {
    case 'create': {
      const { name, assignee, deadline, project_name } = params;
      if (!name) return '請提供任務名稱。';

      // Find project if specified
      let projectId = null;
      if (project_name) {
        const proj = await query(
          `SELECT id FROM projects WHERE name ILIKE $1 AND status = 'active' LIMIT 1`,
          [`%${project_name}%`]
        );
        if (proj.rows.length > 0) projectId = proj.rows[0].id;
      }

      await query(
        `INSERT INTO tasks (name, assignee, deadline, project_id, created_by, status)
         VALUES ($1, $2, $3, $4, $5, 'todo')`,
        [name, assignee, deadline, projectId, context.userId]
      );

      let response = `任務「${name}」已建立！\n`;
      if (assignee) response += `負責人：${assignee}\n`;
      if (deadline) response += `截止日：${deadline}\n`;

      return response;
    }

    case 'complete': {
      const { task_name } = params;
      if (!task_name) return '請告訴我要完成哪個任務。';

      const result = await query(
        `UPDATE tasks SET status = 'done', completed_at = NOW()
         WHERE name ILIKE $1 AND status != 'done'
         RETURNING id, name, project_id, next_task_id`,
        [`%${task_name}%`]
      );

      if (result.rows.length === 0) return `找不到任務「${task_name}」。`;

      const task = result.rows[0];
      let response = `✅ 任務「${task.name}」已完成！`;

      // Notify next person in chain if exists
      if (task.next_task_id) {
        const next = await query(
          `SELECT name, assignee FROM tasks WHERE id = $1`,
          [task.next_task_id]
        );
        if (next.rows.length > 0) {
          const n = next.rows[0];
          response += `\n⏭️ 下一步：「${n.name}」— ${n.assignee || '未指派'}`;
          // TODO: Send Google Chat notification to next assignee
        }
      }

      return response;
    }

    case 'list': {
      const result = await query(
        `SELECT t.name, t.deadline, t.status, p.name as project_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.assignee ILIKE $1 AND t.status != 'done'
         ORDER BY t.deadline ASC NULLS LAST`,
        [`%${context.userName}%`]
      );

      if (result.rows.length === 0) return '你目前沒有待辦任務！🎉';

      return `📝 **${context.userName} 的待辦：**\n` +
        result.rows.map((t) => {
          const dl = t.deadline ? ` (截止：${t.deadline})` : '';
          const proj = t.project_name ? ` [${t.project_name}]` : '';
          return `• ${t.name}${dl}${proj}`;
        }).join('\n');
    }

    default:
      return '不支援的任務操作。';
  }
}

module.exports = { handleTaskCommand };
