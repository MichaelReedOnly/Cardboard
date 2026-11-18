export class SessionError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'SessionError';
    this.status = status;
  }
}

/**
 * Returns the authenticated Clerk user ID for a Node request.
 * Callers translate SessionError into an HTTP response.
 */
export function createSessionVerifier(clerkClient, origin) {
  return async function requireUserId(req) {
    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' || !/^Bearer \S+$/i.test(authorization)) {
      throw new SessionError(401, 'Sign-in required');
    }
    if (!clerkClient) {
      throw new SessionError(503, 'Clerk server verification is not configured');
    }

    let session;
    try {
      const request = new Request(new URL(req.url, origin), {
        headers: {authorization},
      });
      session = await clerkClient.authenticateRequest(request, {
        authorizedParties: [origin],
        acceptsToken: 'session_token',
      });
      const userId = session.isAuthenticated ? session.toAuth().userId : null;
      if (typeof userId === 'string' && userId.length > 0) return userId;
    } catch {
      throw new SessionError(503, 'Clerk session verification is unavailable');
    }
    throw new SessionError(401, 'Invalid or expired session');
  };
}
