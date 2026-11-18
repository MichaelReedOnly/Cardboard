import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {createDatabasePool, databaseError} from './database.js';

const directory = new URL('./migrations/',import.meta.url);
let pool;
let client;
let inTransaction = false;

try {
  const files = (await readdir(directory)).filter(name=>/^\d{3}-[a-z0-9-]+\.sql$/.test(name)).sort();
  if (files.length === 0) throw new Error('No migration files found.');
  pool = createDatabasePool();
  client = await pool.connect();
  await client.query('BEGIN');
  inTransaction = true;
  // Fixed transaction-scoped lock serializes migration runners on this database.
  await client.query('SELECT pg_advisory_xact_lock(172903, 1)');
  const result = await client.query("SELECT to_regclass('cardboard.schema_migrations') AS name");
  const permission = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='cardboard') AS schema_exists, has_database_privilege(current_user,current_database(),'CREATE') AS can_create_schema"
  );
  if (!permission.rows[0].schema_exists && !permission.rows[0].can_create_schema) {
    throw new Error('The cardboard schema must first be created by an administrator with authorization assigned to the configured PGUSER.');
  }
  if (!permission.rows[0].schema_exists) await client.query('CREATE SCHEMA cardboard');
  const applied = result.rows[0].name
    ? (await client.query('SELECT version, checksum FROM cardboard.schema_migrations')).rows : [];
  const known = new Map(applied.map(row=>[row.version,row.checksum]));
  if (applied.some(row=>!files.includes(row.version))) {
    throw new Error('Database contains a migration missing from this checkout.');
  }
  const completed = [];
  for (const file of files) {
    const sql = await readFile(new URL(file,directory),'utf8');
    const checksum = createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex');
    if (known.has(file)) {
      if (known.get(file) !== checksum) throw new Error(`Applied migration ${file} has changed.`);
      completed.push(`Skipped ${file} (already applied)`);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO cardboard.schema_migrations(version, checksum) VALUES ($1, $2)',[file,checksum]);
    completed.push(`Applied ${file}`);
  }
  await client.query('COMMIT');
  inTransaction = false;
  for (const message of completed) console.log(message);
} catch (error) {
  if (inTransaction) await client.query('ROLLBACK').catch(()=>{});
  console.error(error.code ? databaseError(error) : error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}
