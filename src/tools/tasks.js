const { query } = require('../db/pool');
const { sendMessage } = require('../chat/sender');

async function handleTaskCommand(action, params, context) {
  switch (action) {
    case 'create': {
      const { name, assignee, deadline, project_name } = params;
      if (!name) return '請提供任務名稱。';

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
         RETURNING id, name, project_id, next_task_id, deadline`,
        [`%${task_name}%`]
      );

      if (result.rows.length === 0) return `找不到任務「${task_name}」。`;

      const task = result.rows[0];
      const wasLate = task.deadline && new Date() > new Date(task.deadline);
      let response = `✅ 任務「${task.name}」已完成！`;
      if (wasLate) response += ` (逾期完成)`;

      // Chain notification: notify next person
      if (task.next_task_id) {
        const next = await query(
          `SELECT t.name, t.assignee, t.deadline, p.space_id
           FROM tasks t
           LEFT JOIN projects p ON t.project_id = p.id
           WHERE t.id = $1`,
          [task.next_task_id]
        );
        if (next.rows.length > 0) {
          const n = next.rows[0];
          const fmtDl = n.deadline ? new Date(n.deadline).toISOString().split('T')[0] : '無';
          response += `\n⏭️ 下一步：「${n.name}」— ${n.assignee || '未指派'} (截止：${fmtDl})`;

          // Proactively send notification to the space
          if (n.space_id) {
            await sendMessage(n.space_id,
              `🔔 **任務接力通知**\n「${task.name}」已完成！\n\n下一個任務「${n.name}」現在可以開始了。\n負責人：${n.assignee || '未指派'}\n截止日：${fmtDl}`
            );
          }
        }
      }

      // Check project completion
      if (task.project_id) {
        const stats = await query(
          `SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'done') as done
           FROM tasks WHERE project_id = $1`,
          [task.project_id]
        );
        const { total, done } = stats.rows[0];
        const progress = Math.round((done / total) * 100);
        response += `\n\n📊 專案進度：${progress}% (${done}/${total})`;

        if (done == total) {
          response += `\n🎉 **所有任務已完成！** 可以輸入「結案報告」產出報告。`;
          await query(`UPDATE projects SET status = 'completed' WHERE id = $1`, [task.project_id]);
        }
      }

      return response;
    }

    case 'list': {
      const result = await query(
        `SELECT t.name, t.deadline, t.status, p.name as project_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE (t.assignee ILIKE $1 OR t.created_by = $2) AND t.status != 'done'
         ORDER BY t.deadline ASC NULLS LAST`,
        [`%${context.userName}%`, context.userId]
      );

      if (result.rows.length === 0) return '你目前沒有待辦任務！🎉';

      const today = new Date().toISOString().split('T')[0];
      return `📝 **${context.userName} 的待辦：**\n` +
        result.rows.map((t) => {
          const dl = t.deadline ? ` (截止：${t.deadline})` : '';
          const proj = t.project_name ? ` [${t.project_name}]` : '';
          const overdue = t.deadline && t.deadline < today ? ' 🚨逾期' : '';
          return `• ${t.name}${dl}${proj}${overdue}`;
        }).join('\n');
    }

    default:
      return '不支援的任務操作。';
  }
}

module.exports = { handleTaskCommand };
