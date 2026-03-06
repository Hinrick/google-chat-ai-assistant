require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  console.log('Seeding demo data...');

  // Clear existing data
  await pool.query('DELETE FROM tasks');
  await pool.query('DELETE FROM project_members');
  await pool.query('DELETE FROM projects');
  await pool.query('DELETE FROM sop_templates');

  // Reset sequences
  await pool.query("ALTER SEQUENCE projects_id_seq RESTART WITH 1");
  await pool.query("ALTER SEQUENCE tasks_id_seq RESTART WITH 1");
  await pool.query("ALTER SEQUENCE sop_templates_id_seq RESTART WITH 1");

  // ===== SOP Templates =====

  // Template 1: 新品拍攝 (New Product Photoshoot)
  await pool.query(`
    INSERT INTO sop_templates (name, description, steps) VALUES
    ('新品拍攝', '新產品拍攝完整流程 — 從樣品準備到上架', $1)
  `, [JSON.stringify([
    { order: 1, name: '樣品確認與準備', assignee: '產品部', percent: 0 },
    { order: 2, name: '拍攝場地預約', assignee: '行政部', percent: 5 },
    { order: 3, name: '拍攝道具準備', assignee: '設計部', percent: 10 },
    { order: 4, name: '產品拍攝', assignee: '攝影師', percent: 20 },
    { order: 5, name: '照片修圖', assignee: '設計部', percent: 35 },
    { order: 6, name: '產品文案撰寫', assignee: '行銷部', percent: 40 },
    { order: 7, name: '主管審核', assignee: '主管', percent: 55 },
    { order: 8, name: '上架素材準備', assignee: '電商部', percent: 65 },
    { order: 9, name: '百貨櫃位更新', assignee: '櫃位管理', percent: 80 },
    { order: 10, name: '正式上架', assignee: '電商部', percent: 95 },
  ])]);

  // Template 2: 產品開發 (Product Development)
  await pool.query(`
    INSERT INTO sop_templates (name, description, steps) VALUES
    ('產品開發', '新產品開發全流程 — 從概念到量產', $1)
  `, [JSON.stringify([
    { order: 1, name: '市場調研', assignee: '行銷部', percent: 0 },
    { order: 2, name: '概念設計', assignee: '設計部', percent: 10 },
    { order: 3, name: '打樣', assignee: '生產部', percent: 25 },
    { order: 4, name: '樣品測試', assignee: '品管部', percent: 35 },
    { order: 5, name: '設計修改', assignee: '設計部', percent: 45 },
    { order: 6, name: '成本評估', assignee: '財務部', percent: 55 },
    { order: 7, name: '主管核准', assignee: '主管', percent: 65 },
    { order: 8, name: '原料採購', assignee: '採購部', percent: 70 },
    { order: 9, name: '量產', assignee: '生產部', percent: 85 },
    { order: 10, name: '品質檢驗', assignee: '品管部', percent: 95 },
  ])]);

  // Template 3: 展覽活動 (Exhibition Event)
  await pool.query(`
    INSERT INTO sop_templates (name, description, steps) VALUES
    ('展覽活動', '展覽/活動籌備流程', $1)
  `, [JSON.stringify([
    { order: 1, name: '活動企劃書', assignee: '行銷部', percent: 0 },
    { order: 2, name: '場地確認', assignee: '行政部', percent: 10 },
    { order: 3, name: '展品挑選', assignee: '產品部', percent: 20 },
    { order: 4, name: '展場設計', assignee: '設計部', percent: 30 },
    { order: 5, name: '邀請函發送', assignee: '行銷部', percent: 40 },
    { order: 6, name: '展場佈置', assignee: '行政部', percent: 70 },
    { order: 7, name: '彩排', assignee: '全員', percent: 85 },
    { order: 8, name: '活動執行', assignee: '全員', percent: 95 },
  ])]);

  // ===== Demo Project 1: 春季新品拍攝 (in progress) =====
  const proj1 = await pool.query(`
    INSERT INTO projects (name, start_date, end_date, status, space_id)
    VALUES ('春季新品拍攝', '2026-02-15', '2026-04-15', 'active', NULL)
    RETURNING id
  `);
  const p1 = proj1.rows[0].id;

  await pool.query(`INSERT INTO project_members (project_id, member_name) VALUES ($1, '小美'), ($1, '阿明'), ($1, '小華'), ($1, '主管王')`, [p1]);

  // Tasks for project 1 (some done, some in progress, one overdue)
  const t1 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('樣品確認與準備', '小美', '2026-02-15', $1, 'done', '2026-02-15', 1) RETURNING id`, [p1]);
  const t2 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('拍攝場地預約', '行政部', '2026-02-18', $1, 'done', '2026-02-17', 2) RETURNING id`, [p1]);
  const t3 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('拍攝道具準備', '小華', '2026-02-22', $1, 'done', '2026-02-23', 3) RETURNING id`, [p1]);
  const t4 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('產品拍攝', '攝影師', '2026-03-02', $1, 'done', '2026-03-01', 4) RETURNING id`, [p1]);
  const t5 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('照片修圖', '小華', '2026-03-06', $1, 'todo', 5) RETURNING id`, [p1]);
  const t6 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('產品文案撰寫', '阿明', '2026-03-10', $1, 'todo', 6) RETURNING id`, [p1]);
  const t7 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('主管審核', '主管王', '2026-03-18', $1, 'todo', 7) RETURNING id`, [p1]);
  const t8 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('上架素材準備', '阿明', '2026-03-28', $1, 'todo', 8) RETURNING id`, [p1]);
  const t9 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('百貨櫃位更新', '小美', '2026-04-08', $1, 'todo', 9) RETURNING id`, [p1]);
  const t10 = await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('正式上架', '阿明', '2026-04-14', $1, 'todo', 10) RETURNING id`, [p1]);

  // Link task chain
  await pool.query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [t2.rows[0].id, t1.rows[0].id]);
  await pool.query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [t3.rows[0].id, t2.rows[0].id]);
  await pool.query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [t4.rows[0].id, t3.rows[0].id]);
  await pool.query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [t5.rows[0].id, t4.rows[0].id]);
  await pool.query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [t6.rows[0].id, t5.rows[0].id]);
  await pool.query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [t7.rows[0].id, t6.rows[0].id]);
  await pool.query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [t8.rows[0].id, t7.rows[0].id]);
  await pool.query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [t9.rows[0].id, t8.rows[0].id]);
  await pool.query(`UPDATE tasks SET next_task_id = $1 WHERE id = $2`, [t10.rows[0].id, t9.rows[0].id]);

  // ===== Demo Project 2: 夏季產品開發 (early stage) =====
  const proj2 = await pool.query(`
    INSERT INTO projects (name, start_date, end_date, status, space_id)
    VALUES ('夏季產品開發', '2026-03-01', '2026-06-30', 'active', NULL)
    RETURNING id
  `);
  const p2 = proj2.rows[0].id;

  await pool.query(`INSERT INTO project_members (project_id, member_name) VALUES ($1, '小美'), ($1, '設計師林'), ($1, '品管張')`, [p2]);

  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('市場調研', '阿明', '2026-03-01', $1, 'done', '2026-03-02', 1)`, [p2]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('概念設計', '設計師林', '2026-03-14', $1, 'todo', 2)`, [p2]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('打樣', '生產部', '2026-04-01', $1, 'todo', 3)`, [p2]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('樣品測試', '品管張', '2026-04-15', $1, 'todo', 4)`, [p2]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('設計修改', '設計師林', '2026-05-01', $1, 'todo', 5)`, [p2]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('成本評估', '財務部', '2026-05-15', $1, 'todo', 6)`, [p2]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('主管核准', '主管王', '2026-05-25', $1, 'todo', 7)`, [p2]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('原料採購', '採購部', '2026-06-01', $1, 'todo', 8)`, [p2]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('量產', '生產部', '2026-06-20', $1, 'todo', 9)`, [p2]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, sort_order) VALUES ('品質檢驗', '品管張', '2026-06-28', $1, 'todo', 10)`, [p2]);

  // ===== Demo Project 3: 週年慶展覽 (completed) =====
  const proj3 = await pool.query(`
    INSERT INTO projects (name, start_date, end_date, status, space_id)
    VALUES ('週年慶展覽', '2026-01-01', '2026-02-28', 'completed', NULL)
    RETURNING id
  `);
  const p3 = proj3.rows[0].id;

  await pool.query(`INSERT INTO project_members (project_id, member_name) VALUES ($1, '小美'), ($1, '阿明'), ($1, '小華')`, [p3]);

  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('活動企劃書', '阿明', '2026-01-01', $1, 'done', '2026-01-02', 1)`, [p3]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('場地確認', '行政部', '2026-01-07', $1, 'done', '2026-01-06', 2)`, [p3]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('展品挑選', '小美', '2026-01-14', $1, 'done', '2026-01-15', 3)`, [p3]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('展場設計', '小華', '2026-01-21', $1, 'done', '2026-01-25', 4)`, [p3]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('邀請函發送', '阿明', '2026-01-28', $1, 'done', '2026-01-27', 5)`, [p3]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('展場佈置', '行政部', '2026-02-14', $1, 'done', '2026-02-16', 6)`, [p3]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('彩排', '全員', '2026-02-21', $1, 'done', '2026-02-21', 7)`, [p3]);
  await pool.query(`INSERT INTO tasks (name, assignee, deadline, project_id, status, completed_at, sort_order) VALUES ('活動執行', '全員', '2026-02-27', $1, 'done', '2026-02-27', 8)`, [p3]);

  console.log('Demo data seeded:');
  console.log('  - 3 SOP templates (新品拍攝, 產品開發, 展覽活動)');
  console.log('  - 3 projects (春季新品拍攝, 夏季產品開發, 週年慶展覽)');
  console.log('  - 28 tasks with chain links and completion data');

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
