import {migrateProjects,validateState} from '../src/model.js';

export class InvalidWorkspaceError extends Error {
  constructor() {
    super('Stored workspace could not be read');
    this.name = 'InvalidWorkspaceError';
  }
}

export class WorkspaceInputError extends Error {}
export class WorkspaceConflictError extends Error {}

export function validateWorkspaceSave(input) {
  if (!input || typeof input.revision !== 'string'
      || !/^(0|[1-9][0-9]{0,18})$/.test(input.revision)
      || BigInt(input.revision) >= 9223372036854775807n) {
    throw new WorkspaceInputError('Provide a valid revision as a decimal string.');
  }
  try {
    return {snapshot:validateState(migrateProjects(input.snapshot)),revision:input.revision};
  } catch {
    throw new WorkspaceInputError('Invalid Cardboard snapshot.');
  }
}

export async function saveWorkspace(pool,userId,input) {
  const {snapshot,revision} = validateWorkspaceSave(input);
  const result = revision === '0'
    ? await pool.query(
      'INSERT INTO cardboard.workspaces(clerk_user_id,snapshot) VALUES ($1,$2) ON CONFLICT (clerk_user_id) DO NOTHING RETURNING snapshot,revision,updated_at',
      [userId,JSON.stringify(snapshot)]
    )
    : await pool.query(
      'UPDATE cardboard.workspaces SET snapshot=$2,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE clerk_user_id=$1 AND revision=$3::bigint RETURNING snapshot,revision,updated_at',
      [userId,JSON.stringify(snapshot),revision]
    );
  if (!result.rows.length) throw new WorkspaceConflictError('Workspace has changed. Load the latest revision before saving.');
  const row = result.rows[0];
  return {snapshot:row.snapshot,revision:String(row.revision),updatedAt:new Date(row.updated_at).toISOString()};
}

export async function loadWorkspace(pool,userId) {
  const result = await pool.query(
    'SELECT snapshot, revision, updated_at FROM cardboard.workspaces WHERE clerk_user_id = $1',
    [userId]
  );
  if (result.rows.length === 0) return {snapshot:null,revision:'0',updatedAt:null};
  const row = result.rows[0];
  try {
    const snapshot = validateState(migrateProjects(row.snapshot));
    const revision = String(row.revision);
    if (!/^[1-9][0-9]*$/.test(revision)) throw new Error('Invalid revision');
    const updatedAt = new Date(row.updated_at).toISOString();
    return {snapshot,revision,updatedAt};
  } catch {
    throw new InvalidWorkspaceError();
  }
}
