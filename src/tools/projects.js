const { query } = require('../db/pool');
const { findTemplate, applyTemplate } = require('./sop');

async function handleProjectCommand(action, params, context) {
  switch (action) {
    case 'create': {
      const { name, start_date, end_date, members } = params;
      if (!name) return '請提供專案名稱。例如："新專案：新品拍攝，3/15-4/30"';

      const result = await query(
        `INSERT INTO projects (name, start_date, end_date, created_by, space_id, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id`,
        [name, start_date, end_date, context.userId, context.spaceId]
      );

      const projectId = result.rows[0].id;

      // Add members
      if (members && members.length > 0) {
        for (const member of members) {
          await query(
            `INSERT INTO project_members (project_id, member_name) VALUES ($1, $2)`,
            [projectId, member]
          );
        }
      }

      let response = `專案「${name}」已建立！\n`;
      if (start_date) response += `開始：${start_date}\n`;
      if (end_date) response += `結束：${end_date}\n`;
      if (members?.length) response += `成員：${members.join('、')}\n`;

      // Auto-apply SOP template if one matches
      if (start_date && end_date) {
        const template = await findTemplate(name);
        if (template) {
          const tasks = await applyTemplate(projectId, template.id, start_date, end_date);
          if (tasks.length > 0) {
            response += `\n📋 已自動套用 SOP「${template.name}」，建立 ${tasks.length} 個任務：\n`;
            for (const t of tasks) {
              response += `• ${t.name} — ${t.assignee || '未指派'} (${t.deadline})\n`;
            }
          }
        }
      }

      return response;
    }

    case 'status': {
      const { project_name } = params;

      let result;
      if (project_name) {
        result = await query(
          `SELECT p.*,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_tasks,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status != 'done' AND deadline < CURRENT_DATE) as overdue_tasks
           FROM projects p WHERE p.name ILIKE $1`,
          [`%${project_name}%`]
        );
      } else {
        result = await query(
          `SELECT p.*,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_tasks,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status != 'done' AND deadline < CURRENT_DATE) as overdue_tasks
           FROM projects p WHERE p.space_id = $1
           ORDER BY p.created_at DESC LIMIT 5`,
          [context.spaceId]
        );
      }

      if (result.rows.length === 0) return '找不到專案。';

      return result.rows.map((p) => {
        const total = parseInt(p.total_tasks);
        const done = parseInt(p.done_tasks);
        const overdue = parseInt(p.overdue_tasks);
        const progress = total > 0 ? Math.round((done / total) * 100) : 0;
        const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));

        let status = `📋 **${p.name}** [${p.status}]\n`;
        status += `   ${bar} ${progress}% (${done}/${total})\n`;
        status += `   ${p.start_date || '?'} → ${p.end_date || '?'}`;
        if (overdue > 0) status += `\n   🚨 逾期任務：${overdue} 個`;
        return status;
      }).join('\n\n');
    }

    default:
      return '不支援的專案操作。';
  }
}

module.exports = { handleProjectCommand };
