export type Grant = { token: string; sessionId: string; expiresAt: string };

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function parse(body: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(body);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function errorCode(body: string): string | null {
  const error = parse(body)?.error;
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

export function asGrant(body: string): Grant | null {
  const v = parse(body);
  if (!v || typeof v.token !== 'string' || !TOKEN_RE.test(v.token)) return null;
  return {
    token: v.token,
    sessionId: typeof v.sessionId === 'string' ? v.sessionId : '',
    expiresAt: typeof v.expiresAt === 'string' ? v.expiresAt : '',
  };
}
