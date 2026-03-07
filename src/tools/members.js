const { query } = require('../db/pool');
const { listSpaceMembers } = require('../integrations/google-chat-members');

async function handleMemberCommand(action, params, context) {
  switch (action) {
    case 'sync_members': {
      const members = await listSpaceMembers(context.spaceId);
      if (members.length === 0) return '無法取得群組成員，請確認機器人有權限。';

      let added = 0;
      for (const m of members) {
        const result = await query(
          `INSERT INTO space_members (space_id, user_name, display_name, email)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (space_id, user_name)
           DO UPDATE SET display_name = $3,
                         email = COALESCE($4, space_members.email)
           RETURNING (xmax = 0) as is_new`,
          [context.spaceId, m.userName, m.displayName, m.email]
        );
        if (result.rows[0].is_new) added++;
      }

      return `已同步群組成員，共 ${members.length} 人（新增 ${added} 人）。\n輸入「團隊成員」查看，或用「更新成員：小美，角色：設計師，部門：設計部」設定角色。`;
    }

    case 'add_member': {
      const { name, role, department, email } = params;
      if (!name) return '請提供成員名稱。';

      // Check if this person is in the space
      const existing = await query(
        `SELECT display_name FROM space_members
         WHERE space_id = $1 AND display_name ILIKE $2`,
        [context.spaceId, `%${name}%`]
      );

      if (existing.rows.length === 0) {
        // Try syncing from space first
        const members = await listSpaceMembers(context.spaceId);
        const match = members.find(m =>
          m.displayName && m.displayName.toLowerCase().includes(name.toLowerCase())
        );

        if (!match) {
          return `找不到群組成員「${name}」。只能新增群組中的成員。\n輸入「同步成員」可重新同步群組成員列表。`;
        }

        // Insert the matched member first
        await query(
          `INSERT INTO space_members (space_id, user_name, display_name, email)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (space_id, user_name) DO UPDATE SET display_name = $3`,
          [context.spaceId, match.userName, match.displayName, match.email]
        );
      }

      // Update role/department/email for the matched member
      await query(
        `UPDATE space_members SET
           role = COALESCE($3, role),
           department = COALESCE($4, department),
           email = COALESCE($5, email)
         WHERE space_id = $1 AND display_name ILIKE $2`,
        [context.spaceId, `%${name}%`, role || null, department || null, email || null]
      );

      let response = `已更新成員「${name}」`;
      if (role) response += `，角色：${role}`;
      if (department) response += `，部門：${department}`;
      if (email) response += `，Email：${email}`;
      return response;
    }

    case 'list_members': {
      const result = await query(
        `SELECT display_name, role, department FROM space_members
         WHERE space_id = $1 ORDER BY department, display_name`,
        [context.spaceId]
      );

      if (result.rows.length === 0) return '目前沒有已記錄的成員。輸入「新增成員：小美，角色：設計師，部門：設計部」來新增。';

      const byDept = {};
      for (const m of result.rows) {
        const dept = m.department || '未分部門';
        if (!byDept[dept]) byDept[dept] = [];
        byDept[dept].push(m);
      }

      let response = '👥 **團隊成員：**\n';
      for (const [dept, members] of Object.entries(byDept)) {
        response += `\n**${dept}**\n`;
        for (const m of members) {
          response += `• ${m.display_name}`;
          if (m.role) response += ` — ${m.role}`;
          response += '\n';
        }
      }
      return response;
    }

    case 'team_workload': {
      const result = await query(
        `SELECT sm.display_name, sm.role, sm.department,
           COUNT(t.id) FILTER (WHERE t.status != 'done') as pending,
           COUNT(t.id) FILTER (WHERE t.status != 'done' AND t.deadline < CURRENT_DATE) as overdue
         FROM space_members sm
         LEFT JOIN tasks t ON t.assignee = sm.display_name AND t.status != 'done'
         WHERE sm.space_id = $1
         GROUP BY sm.display_name, sm.role, sm.department
         ORDER BY pending DESC`,
        [context.spaceId]
      );

      if (result.rows.length === 0) return '沒有成員資料。';

      let response = '📊 **團隊工作負載：**\n\n';
      for (const m of result.rows) {
        const bar = '█'.repeat(Math.min(m.pending, 10)) + '░'.repeat(Math.max(10 - m.pending, 0));
        response += `${m.display_name} (${m.role || m.department || '-'})\n`;
        response += `  ${bar} ${m.pending} 個待辦`;
        if (m.overdue > 0) response += ` 🚨${m.overdue} 逾期`;
        response += '\n';
      }
      return response;
    }

    default:
      return '不支援的成員操作。';
  }
}

// Get member by role for auto-assignment
async function findMemberByRole(spaceId, role) {
  const result = await query(
    `SELECT display_name FROM space_members
     WHERE space_id = $1 AND (role ILIKE $2 OR department ILIKE $2)
     LIMIT 1`,
    [spaceId, `%${role}%`]
  );
  return result.rows.length > 0 ? result.rows[0].display_name : null;
}

// Get member email by display name
async function findMemberEmail(spaceId, displayName) {
  if (!displayName) return null;
  const result = await query(
    `SELECT email FROM space_members
     WHERE space_id = $1 AND display_name ILIKE $2 AND email IS NOT NULL
     LIMIT 1`,
    [spaceId, `%${displayName}%`]
  );
  return result.rows.length > 0 ? result.rows[0].email : null;
}

// Get member's Google Chat user_name for @mentions (e.g. "users/123456")
async function findMemberUserId(spaceId, displayName) {
  if (!displayName) return null;
  const result = await query(
    `SELECT user_name FROM space_members
     WHERE space_id = $1 AND display_name ILIKE $2 AND user_name LIKE 'users/%'
     LIMIT 1`,
    [spaceId, `%${displayName}%`]
  );
  return result.rows.length > 0 ? result.rows[0].user_name : null;
}

module.exports = { handleMemberCommand, findMemberByRole, findMemberEmail, findMemberUserId };
