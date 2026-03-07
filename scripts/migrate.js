require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrations = [
  `CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'active',
    created_by TEXT,
    space_id TEXT,
    notion_page_id TEXT,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS project_members (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    member_name TEXT NOT NULL,
    member_user_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    assignee TEXT,
    assignee_user_id TEXT,
    deadline DATE,
    status TEXT DEFAULT 'todo',
    project_id INTEGER REFERENCES projects(id),
    next_task_id INTEGER REFERENCES tasks(id),
    sort_order INTEGER DEFAULT 0,
    created_by TEXT,
    completed_at TIMESTAMPTZ,
    notion_page_id TEXT,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS sop_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Add sort_order if missing (for existing DBs)
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'sort_order') THEN
      ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
  END $$`,

  // Auto-update updated_at
  `CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
   $$ LANGUAGE plpgsql`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'projects_updated_at') THEN
      CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tasks_updated_at') THEN
      CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
  END $$`,

  // space_members table
  `CREATE TABLE IF NOT EXISTS space_members (
    id SERIAL PRIMARY KEY,
    space_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT,
    department TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(space_id, user_name)
  )`,

  // Add email column to space_members if missing
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'space_members' AND column_name = 'email') THEN
      ALTER TABLE space_members ADD COLUMN email TEXT;
    END IF;
  END $$`,

  // task_templates table
  `CREATE TABLE IF NOT EXISTS task_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    department TEXT,
    subtasks JSONB NOT NULL DEFAULT '[]',
    estimated_days INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Add hierarchical task columns
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'parent_task_id') THEN
      ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id);
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'is_routine') THEN
      ALTER TABLE tasks ADD COLUMN is_routine BOOLEAN DEFAULT FALSE;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'recurrence') THEN
      ALTER TABLE tasks ADD COLUMN recurrence TEXT;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'description') THEN
      ALTER TABLE tasks ADD COLUMN description TEXT;
    END IF;
  END $$`,

  // Google Tasks & Calendar integration columns
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'google_task_id') THEN
      ALTER TABLE tasks ADD COLUMN google_task_id TEXT;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'google_event_id') THEN
      ALTER TABLE tasks ADD COLUMN google_event_id TEXT;
    END IF;
  END $$`,
];

async function migrate() {
  console.log('Running migrations...');
  for (const sql of migrations) {
    await pool.query(sql);
  }
  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
