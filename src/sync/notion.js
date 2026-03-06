const { Client } = require('@notionhq/client');
const { query } = require('../db/pool');

let notion;

function getNotion() {
  if (!notion) {
    notion = new Client({ auth: process.env.NOTION_API_KEY });
  }
  return notion;
}

async function syncProjectsToNotion() {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    return;
  }

  try {
    const n = getNotion();
    const dbId = process.env.NOTION_DATABASE_ID;

    // Get projects updated since last sync
    const projects = await query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_tasks
       FROM projects p
       WHERE p.synced_at IS NULL OR p.updated_at > p.synced_at`
    );

    for (const project of projects.rows) {
      const progress = project.total_tasks > 0
        ? Math.round((project.done_tasks / project.total_tasks) * 100)
        : 0;

      const properties = {
        'Name': { title: [{ text: { content: project.name } }] },
        'Status': { select: { name: project.status || 'active' } },
        'Progress': { number: progress },
      };

      if (project.start_date) {
        properties['Start Date'] = { date: { start: project.start_date } };
      }
      if (project.end_date) {
        properties['End Date'] = { date: { start: project.end_date } };
      }

      if (project.notion_page_id) {
        // Update existing page
        await n.pages.update({
          page_id: project.notion_page_id,
          properties,
        });
      } else {
        // Create new page
        const page = await n.pages.create({
          parent: { database_id: dbId },
          properties,
        });

        await query(
          `UPDATE projects SET notion_page_id = $1 WHERE id = $2`,
          [page.id, project.id]
        );
      }

      await query(`UPDATE projects SET synced_at = NOW() WHERE id = $1`, [project.id]);
    }

    if (projects.rows.length > 0) {
      console.log(`[SYNC] Synced ${projects.rows.length} projects to Notion`);
    }
  } catch (err) {
    console.error('[SYNC] Notion sync failed:', err.message);
  }
}

function startSyncLoop(intervalMs) {
  syncProjectsToNotion();
  setInterval(syncProjectsToNotion, intervalMs);
}

module.exports = { syncProjectsToNotion, startSyncLoop };
