/** Select storage before any repository or browser-local data is opened. */
export async function startBoard({fetchImpl=globalThis.fetch,startLocal,startDatabase}) {
  const response=await fetchImpl('/api/config',{cache:'no-store'});
  if (!response.ok) throw Error('Unable to load Cardboard configuration.');
  const config=await response.json();
  if (config.storageMode==='local') return startLocal();
  if (config.storageMode==='database') return startDatabase(config);
  throw Error('Cardboard storage configuration is invalid.');
}
