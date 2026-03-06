const { query } = require('../db/pool');

// Apply SOP template to a project — auto-generate milestone tasks
async function applyTemplate(projectId, templateId, startDate, endDate) {
  const tpl = await query(`SELECT * FROM sop_templates WHERE id = $1`, [templateId]);
  if (tpl.rows.length === 0) return [];

  const steps = tpl.rows[0].steps;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));

  const createdTasks = [];
  let prevTaskId = null;

  for (const step of steps) {
    // Calculate deadline based on percentage of total duration
    const offsetDays = Math.round(totalDays * (step.percent / 100));
    const deadline = new Date(start);
    deadline.setDate(deadline.getDate() + offsetDays);
    const deadlineStr = deadline.toISOString().split('T')[0];

    const result = await query(
      `INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order)
       VALUES ($1, $2, $3, $4, 'todo', $5)
       RETURNING id`,
      [step.name, step.assignee || null, deadlineStr, projectId, step.order || 0]
    );

    const taskId = result.rows[0].id;

    // Link previous task's next_task_id to this one
    if (prevTaskId) {
      await query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [taskId, prevTaskId]);
    }

    createdTasks.push({ id: taskId, name: step.name, deadline: deadlineStr, assignee: step.assignee });
    prevTaskId = taskId;
  }

  return createdTasks;
}

// Find matching template by project name keywords
async function findTemplate(projectName) {
  const result = await query(
    `SELECT * FROM sop_templates
     WHERE $1 ILIKE '%' || name || '%' OR name ILIKE '%' || $1 || '%'
     LIMIT 1`,
    [projectName]
  );

  if (result.rows.length > 0) return result.rows[0];

  // Fallback: get first template as default
  const fallback = await query(`SELECT * FROM sop_templates LIMIT 1`);
  return fallback.rows.length > 0 ? fallback.rows[0] : null;
}

async function handleSopCommand(action, params, context) {
  switch (action) {
    case 'list_templates': {
      const result = await query(`SELECT id, name, description, jsonb_array_length(steps) as step_count FROM sop_templates ORDER BY name`);
      if (result.rows.length === 0) return '目前沒有 SOP 模板。';

      return `📋 **SOP 模板列表：**\n` +
        result.rows.map(t => `• **${t.name}** — ${t.description || ''} (${t.step_count} 步驟)`).join('\n');
    }

    case 'apply_template': {
      const { project_name, template_name } = params;
      if (!project_name) return '請指定專案名稱。';

      const proj = await query(
        `SELECT * FROM projects WHERE name ILIKE $1 AND status = 'active' LIMIT 1`,
        [`%${project_name}%`]
      );
      if (proj.rows.length === 0) return `找不到專案「${project_name}」。`;

      const project = proj.rows[0];
      const template = template_name
        ? (await query(`SELECT * FROM sop_templates WHERE name ILIKE $1 LIMIT 1`, [`%${template_name}%`])).rows[0]
        : await findTemplate(project.name);

      if (!template) return '找不到適用的 SOP 模板。';
      if (!project.start_date || !project.end_date) return '專案需要設定開始和結束日期才能套用模板。';

      const tasks = await applyTemplate(project.id, template.id, project.start_date, project.end_date);

      let response = `✅ 已套用 SOP「${template.name}」到專案「${project.name}」\n`;
      response += `自動建立了 ${tasks.length} 個里程碑任務：\n\n`;
      for (const t of tasks) {
        response += `• ${t.name} — ${t.assignee || '未指派'} (截止：${t.deadline})\n`;
      }

      return response;
    }

    default:
      return '不支援的 SOP 操作。';
  }
}

module.exports = { applyTemplate, findTemplate, handleSopCommand };
