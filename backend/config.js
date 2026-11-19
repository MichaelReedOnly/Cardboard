/** Server-only configuration. Never serialize this object to a browser or log. */
export function readServerConfig(env) {
  const storageMode = env.CARDBOARD_STORAGE === undefined ? 'local' : env.CARDBOARD_STORAGE.trim();
  if (!['local','database'].includes(storageMode)) {
    throw new Error('CARDBOARD_STORAGE must be local or database.');
  }

  const publishableKey = env.CLERK_PUBLISHABLE_KEY?.trim() ?? '';
  const secretKey = env.CLERK_SECRET_KEY?.trim() ?? '';
  const origin = env.CARDBOARD_ORIGIN?.trim() || `http://127.0.0.1:${env.PORT || 4318}`;
  const publicMatch = /^pk_(test|live)_([A-Za-z0-9+/_=-]+)$/.exec(publishableKey);
  const secretMatch = /^sk_(test|live)_\S+$/.exec(secretKey);
  const domain = publicMatch ? Buffer.from(publicMatch[2],'base64').toString('utf8') : '';
  const validDomain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\$$/i.test(domain);
  let validOrigin = false;
  try {
    const parsed = new URL(origin);
    validOrigin = parsed.origin === origin && ['http:','https:'].includes(parsed.protocol);
  } catch {}

  let authError = null;
  if (!publishableKey || !secretKey) authError = 'Clerk publishable and secret keys are required.';
  else if (!publicMatch || !secretMatch || !validDomain) authError = 'Clerk key configuration is invalid.';
  else if (publicMatch[1] !== secretMatch[1]) authError = 'Clerk keys must belong to the same environment.';
  else if (!validOrigin) authError = 'CARDBOARD_ORIGIN must be an HTTP or HTTPS origin without a path.';
  else if (publicMatch[1] === 'live' && (!env.CARDBOARD_ORIGIN?.trim() || !origin.startsWith('https://'))) {
    authError = 'Production Clerk keys require an explicit HTTPS CARDBOARD_ORIGIN.';
  }
  if (storageMode === 'database' && authError) throw new Error(`Database mode requires valid authentication configuration. ${authError}`);

  return {
    storageMode,origin,publishableKey,secretKey,
    clerkOrigin:authError ? null : `https://${domain.slice(0,-1)}`,
    authConfigured:authError === null,authError,
  };
}

/** Safe public rollout status; database board integration follows in Step 3.3. */
export function getPublicConfig(config) {
  return {storageMode:config.storageMode,boardReady:config.storageMode === 'local'};
}
