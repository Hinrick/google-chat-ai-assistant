const { query } = require('../db/pool');
const { sendMessage } = require('../chat/sender');
const { findMemberByRole, findMemberEmail, findMemberUserId } = require('./members');
const { createGoogleTask, completeGoogleTask } = require('../integrations/google-tasks');
const { createCalendarEvent, updateCalendarEventStatus } = require('../integrations/google-calendar');

async function handleTaskCommand(action, params, context) {
  switch (action) {
    case 'create': {
      const { name, assignee, deadline, project_name, template_name } = params;
      if (!name && !template_name) return '請提供任務名稱。';

      let projectId = null;
      if (project_name) {
        const proj = await query(
          `SELECT id FROM projects WHERE name ILIKE $1 AND status = 'active' LIMIT 1`,
          [`%${project_name}%`]
        );
        if (proj.rows.length > 0) projectId = proj.rows[0].id;
      }

      // If template_name is given, create main task + subtasks from template
      if (template_name) {
        return createFromTemplate(template_name, name || template_name, deadline, projectId, context);
      }

      const insertResult = await query(
        `INSERT INTO tasks (name, assignee, deadline, project_id, created_by, status)
         VALUES ($1, $2, $3, $4, $5, 'todo')
         RETURNING id`,
        [name, assignee, deadline, projectId, context.userId]
      );

      // Sync to Google Tasks & Calendar
      const assigneeEmail = assignee ? await findMemberEmail(context.spaceId, assignee) : null;
      syncToGoogle(insertResult.rows[0].id, name, assigneeEmail, deadline, deadline, context.spaceId);

      let response = `任務「${name}」已建立！\n`;
      if (assignee) response += `負責人：${assignee}\n`;
      if (deadline) response += `截止日：${deadline}\n`;

      return response;
    }

    case 'create_main_task': {
      const { name, template_name, deadline, project_name } = params;
      let projectId = null;
      if (project_name) {
        const proj = await query(
          `SELECT id FROM projects WHERE name ILIKE $1 AND status = 'active' LIMIT 1`,
          [`%${project_name}%`]
        );
        if (proj.rows.length > 0) projectId = proj.rows[0].id;
      }

      return createFromTemplate(template_name || name, name || template_name, deadline, projectId, context);
    }

    case 'complete': {
      const { task_name } = params;
      if (!task_name) return '請告訴我要完成哪個任務。';

      const result = await query(
        `UPDATE tasks SET status = 'done', completed_at = NOW()
         WHERE name ILIKE $1 AND status != 'done'
         RETURNING id, name, project_id, parent_task_id, next_task_id, deadline, assignee, google_task_id, google_event_id`,
        [`%${task_name}%`]
      );

      if (result.rows.length === 0) return `找不到任務「${task_name}」。`;

      const task = result.rows[0];

      // Sync completion to Google Tasks & Calendar
      if (task.google_task_id || task.google_event_id) {
        const assigneeEmail = task.assignee ? await findMemberEmail(context.spaceId, task.assignee) : null;
        completeGoogleTask({ googleTaskId: task.google_task_id, userEmail: assigneeEmail });
        updateCalendarEventStatus({ googleEventId: task.google_event_id, userEmail: assigneeEmail, title: task.name });
      }
      const wasLate = task.deadline && new Date() > new Date(task.deadline);
      let response = `✅ 任務「${task.name}」已完成！`;
      if (wasLate) response += ` (逾期完成)`;

      // Check parent task progress if this is a subtask
      if (task.parent_task_id) {
        const parentStats = await query(
          `SELECT
            (SELECT name FROM tasks WHERE id = $1) as parent_name,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'done') as done
           FROM tasks WHERE parent_task_id = $1`,
          [task.parent_task_id]
        );
        const ps = parentStats.rows[0];
        const progress = Math.round((ps.done / ps.total) * 100);
        response += `\n📋 主任務「${ps.parent_name}」進度：${progress}% (${ps.done}/${ps.total})`;

        if (parseInt(ps.done) === parseInt(ps.total)) {
          await query(`UPDATE tasks SET status = 'done', completed_at = NOW() WHERE id = $1`, [task.parent_task_id]);
          response += ` ✅ 主任務已自動完成！`;
        }
      }

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

          if (n.space_id) {
            // @mention the next assignee if possible
            const nextUserId = n.assignee ? await findMemberUserId(n.space_id, n.assignee) : null;
            const mention = nextUserId ? `<${nextUserId}>` : (n.assignee || '未指派');
            await sendMessage(n.space_id,
              `🔔 **任務接力通知**\n「${task.name}」已完成！\n\n下一個任務「${n.name}」現在可以開始了。\n負責人：${mention}\n截止日：${fmtDl}`
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
           FROM tasks WHERE project_id = $1 AND parent_task_id IS NULL`,
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
        `SELECT t.name, t.deadline, t.status, t.parent_task_id, p.name as project_name
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
          const sub = t.parent_task_id ? '  ↳ ' : '• ';
          return `${sub}${t.name}${dl}${proj}${overdue}`;
        }).join('\n');
    }

    case 'task_detail': {
      const { task_name } = params;
      if (!task_name) return '請指定任務名稱。';

      const result = await query(
        `SELECT t.*, p.name as project_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.name ILIKE $1
         LIMIT 1`,
        [`%${task_name}%`]
      );

      if (result.rows.length === 0) return `找不到任務「${task_name}」。`;
      const t = result.rows[0];

      let response = `📋 **${t.name}**\n`;
      response += `狀態：${t.status === 'done' ? '✅ 完成' : '⏳ 進行中'}\n`;
      if (t.assignee) response += `負責人：${t.assignee}\n`;
      if (t.deadline) response += `截止日：${t.deadline}\n`;
      if (t.project_name) response += `專案：${t.project_name}\n`;
      if (t.is_routine) response += `類型：🔄 例行任務 (${t.recurrence || ''})\n`;
      if (t.description) response += `說明：${t.description}\n`;

      // Show subtasks if any
      const subtasks = await query(
        `SELECT name, assignee, deadline, status FROM tasks
         WHERE parent_task_id = $1 ORDER BY sort_order, deadline`,
        [t.id]
      );

      if (subtasks.rows.length > 0) {
        const done = subtasks.rows.filter(s => s.status === 'done').length;
        response += `\n📝 **子任務 (${done}/${subtasks.rows.length})：**\n`;
        for (const s of subtasks.rows) {
          const icon = s.status === 'done' ? '✅' : '⬜';
          response += `${icon} ${s.name} — ${s.assignee || '未指派'}`;
          if (s.deadline) response += ` (${s.deadline})`;
          response += '\n';
        }
      }

      return response;
    }

    case 'list_templates': {
      const result = await query(
        `SELECT name, description, department, estimated_days,
                jsonb_array_length(subtasks) as step_count
         FROM task_templates ORDER BY name`
      );

      if (result.rows.length === 0) return '目前沒有任務模板。';

      let response = '📋 **任務模板列表：**\n\n';
      for (const t of result.rows) {
        response += `• **${t.name}** — ${t.description || ''}\n`;
        response += `  部門：${t.department || '-'} | ${t.step_count} 步驟 | 預計 ${t.estimated_days} 天\n`;
      }
      response += '\n輸入「建立任務：產品拍攝，截止：3/20」即可從模板建立';
      return response;
    }

    default:
      return '不支援的任務操作。';
  }
}

async function createFromTemplate(templateName, taskName, deadline, projectId, context) {
  const tpl = await query(
    `SELECT * FROM task_templates WHERE name ILIKE $1 LIMIT 1`,
    [`%${templateName}%`]
  );

  if (tpl.rows.length === 0) {
    return `找不到模板「${templateName}」。輸入「任務模板」查看可用模板。`;
  }

  const template = tpl.rows[0];
  const steps = template.subtasks;

  // Calculate deadline from template if not provided
  const endDate = deadline ? new Date(deadline) : new Date(Date.now() + template.estimated_days * 86400000);
  const startDate = new Date();
  const totalDays = Math.max(Math.floor((endDate - startDate) / 86400000), 1);

  // Create main task
  const mainResult = await query(
    `INSERT INTO tasks (name, deadline, project_id, created_by, status, description)
     VALUES ($1, $2, $3, $4, 'todo', $5)
     RETURNING id`,
    [taskName, endDate.toISOString().split('T')[0], projectId, context.userId, template.description]
  );
  const mainTaskId = mainResult.rows[0].id;

  // Create subtasks
  let prevSubId = null;
  const createdSubs = [];

  for (const step of steps) {
    const offsetDays = Math.round(totalDays * (step.percent / 100));
    const subDeadline = new Date(startDate);
    subDeadline.setDate(subDeadline.getDate() + offsetDays);
    const subDeadlineStr = subDeadline.toISOString().split('T')[0];

    // Auto-assign based on role if members are registered
    let assignee = await findMemberByRole(context.spaceId, step.role);
    if (!assignee) assignee = step.role; // fallback to role name

    const subResult = await query(
      `INSERT INTO tasks (name, assignee, deadline, project_id, parent_task_id, created_by, status, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, 'todo', $7)
       RETURNING id`,
      [step.name, assignee, subDeadlineStr, projectId, mainTaskId, context.userId, step.order || 0]
    );

    const subId = subResult.rows[0].id;

    // Chain: link previous subtask to this one
    if (prevSubId) {
      await query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [subId, prevSubId]);
    }

    // Sync subtask to Google Tasks & Calendar
    const prevStepEnd = createdSubs.length > 0 ? createdSubs[createdSubs.length - 1].deadline : startDate.toISOString().split('T')[0];
    const memberEmail = await findMemberEmail(context.spaceId, assignee);
    syncToGoogle(subId, `${taskName} - ${step.name}`, memberEmail, prevStepEnd, subDeadlineStr, context.spaceId);

    createdSubs.push({ name: step.name, assignee, deadline: subDeadlineStr });
    prevSubId = subId;
  }

  let response = `✅ 主任務「${taskName}」已建立（模板：${template.name}）\n`;
  response += `截止日：${endDate.toISOString().split('T')[0]}\n`;
  response += `共 ${createdSubs.length} 個子任務：\n\n`;

  for (const s of createdSubs) {
    response += `• ${s.name} — ${s.assignee} (${s.deadline})\n`;
  }

  response += `\n每完成一個子任務會自動通知下一位負責人。`;
  return response;
}

// Fire-and-forget sync to Google Tasks & Calendar
function syncToGoogle(taskDbId, title, userEmail, startDate, endDate, spaceId) {
  (async () => {
    try {
      const googleTaskId = await createGoogleTask({
        title,
        due: endDate,
        userEmail,
      });

      let googleEventId = null;
      if (startDate && endDate) {
        googleEventId = await createCalendarEvent({
          title,
          startDate,
          endDate,
          userEmail,
        });
      }

      // Store Google IDs for later sync (complete/delete)
      if (googleTaskId || googleEventId) {
        await query(
          `UPDATE tasks SET google_task_id = $1, google_event_id = $2 WHERE id = $3`,
          [googleTaskId, googleEventId, taskDbId]
        );
      }
    } catch (err) {
      console.error(`[SYNC] Google sync failed for task ${taskDbId}:`, err.message);
    }
  })();
}

module.exports = { handleTaskCommand };
