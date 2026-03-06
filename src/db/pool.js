const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

async function initDb() {
  const p = getPool();
  await p.query('SELECT 1');
  return p;
}

async function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { getPool, initDb, query };
