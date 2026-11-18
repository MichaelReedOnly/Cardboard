import pg from 'pg';

export function createDatabasePool() {
  for (const key of ['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD']) {
    if (!process.env[key]?.trim()) throw new Error(`Missing database setting ${key}.`);
  }
  const pool = new pg.Pool({
    max: 4,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 15000,
    application_name: 'cardboard',
  });
  pool.on('error', error => {
    console.error(databaseError(error));
  });
  return pool;
}

export function databaseError(error) {
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? ` (${error.code})` : '';
  return `Database operation failed${code}. Check connection settings and database privileges.`;
}
