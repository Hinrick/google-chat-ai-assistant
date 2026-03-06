const { query } = require('../db/pool');
const { sendMessage } = require('../chat/sender');

async function checkDeadlines() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Tasks due today
  const dueToday = await query(
    `SELECT t.*, p.name as project_name, p.space_id
     FROM tasks t
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.deadline = $1 AND t.status != 'done'`,
    [today]
  );

  for (const task of dueToday.rows) {
    if (task.space_id) {
      await sendMessage(task.space_id,
        `⚠️ **今日截止提醒**\n任務「${task.name}」今天到期！\n負責人：${task.assignee || '未指派'}\n專案：${task.project_name || '無'}`
      );
    }
  }

  // Tasks due tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const dueTomorrow = await query(
    `SELECT t.*, p.name as project_name, p.space_id
     FROM tasks t
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.deadline = $1 AND t.status != 'done'`,
    [tomorrowStr]
  );

  for (const task of dueTomorrow.rows) {
    if (task.space_id) {
      await sendMessage(task.space_id,
        `📅 **明日截止提醒**\n任務「${task.name}」明天到期！\n負責人：${task.assignee || '未指派'}\n專案：${task.project_name || '無'}`
      );
    }
  }

  // Overdue tasks
  const overdue = await query(
    `SELECT t.*, p.name as project_name, p.space_id
     FROM tasks t
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.deadline < $1 AND t.status != 'done'`,
    [today]
  );

  for (const task of overdue.rows) {
    if (task.space_id) {
      const daysLate = Math.floor((now - new Date(task.deadline)) / (1000 * 60 * 60 * 24));
      await sendMessage(task.space_id,
        `🚨 **逾期警告**\n任務「${task.name}」已逾期 ${daysLate} 天！\n負責人：${task.assignee || '未指派'}\n專案：${task.project_name || '無'}\n原定截止：${task.deadline}`
      );
    }
  }

  const total = dueToday.rows.length + dueTomorrow.rows.length + overdue.rows.length;
  if (total > 0) {
    console.log(`[REMIND] Sent ${total} reminders (today: ${dueToday.rows.length}, tomorrow: ${dueTomorrow.rows.length}, overdue: ${overdue.rows.length})`);
  }
}

// Daily summary for each active project
async function sendDailySummary() {
  const projects = await query(
    `SELECT p.*,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status != 'done' AND deadline < CURRENT_DATE) as overdue_tasks
     FROM projects p
     WHERE p.status = 'active' AND p.space_id IS NOT NULL`
  );

  for (const p of projects.rows) {
    const progress = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0;
    const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));

    let summary = `📊 **每日專案摘要 — ${p.name}**\n`;
    summary += `進度：${bar} ${progress}% (${p.done_tasks}/${p.total_tasks})\n`;
    summary += `截止日：${p.end_date || '未設定'}\n`;

    if (p.overdue_tasks > 0) {
      summary += `🚨 逾期任務：${p.overdue_tasks} 個\n`;
    }

    // Get upcoming tasks
    const upcoming = await query(
      `SELECT name, assignee, deadline FROM tasks
       WHERE project_id = $1 AND status != 'done'
       ORDER BY deadline ASC NULLS LAST LIMIT 3`,
      [p.id]
    );

    if (upcoming.rows.length > 0) {
      summary += `\n📋 接下來的任務：\n`;
      for (const t of upcoming.rows) {
        summary += `• ${t.name} — ${t.assignee || '未指派'} (${t.deadline || '無截止日'})\n`;
      }
    }

    await sendMessage(p.space_id, summary);
  }
}

function startReminderScheduler() {
  // Check deadlines every hour
  setInterval(checkDeadlines, 60 * 60 * 1000);

  // Send daily summary at 9 AM (check every minute around 9:00)
  setInterval(() => {
    const now = new Date();
    const hour = now.getUTCHours() + 8; // Taiwan is UTC+8
    const minute = now.getMinutes();
    if ((hour % 24) === 9 && minute === 0) {
      sendDailySummary();
    }
  }, 60 * 1000);

  // Run initial check
  checkDeadlines();
  console.log('[REMIND] Reminder scheduler started');
}

module.exports = { checkDeadlines, sendDailySummary, startReminderScheduler };
