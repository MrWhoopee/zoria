export type Failure = { status: number; code: string | null; requestId: string | null; retryAfter: number | null };

const withCode = (head: string, code: string | null): string => (code ? `${head}   ${code}` : head);

export function describeFailure(f: Failure): string[] {
  const req = f.status >= 500 && f.requestId ? [`REQ ${f.requestId}`] : [];
  if (f.code === 'no-session') return ['NOT SIGNED IN   type LOGIN'];
  if (f.code === 'agent-offline') return ['AGENT OFFLINE'];
  if (f.status === 0 && f.code === 'timeout') return ['SERVER TIMED OUT, retrying'];
  if (f.status === 0) return [withCode('NO LINK TO SERVER', f.code)];
  if (f.status === 503 && f.code === 'stopping') return ['PAUSED   server restarting', ...req];
  if (f.status === 429) return [withCode(`WAIT ${f.retryAfter ?? 60}s`, f.code)];
  if (f.status === 401) return ['SIGN-IN NEEDED   type LOGIN'];
  if (f.status === 403) return [withCode('FORBIDDEN', f.code)];
  if (f.status === 404) return ['NOT FOUND OR NOT RELEASED YET'];
  if (f.status === 409) return [withCode('CONFLICT', f.code)];
  if (f.status === 422) return [withCode('REJECTED', f.code)];
  if (f.status >= 500) return [`SERVER ERROR ${f.status}`, ...req];
  if (f.status >= 400) return [withCode(`REQUEST ERROR ${f.status}`, f.code)];
  return [`UNEXPECTED ${f.status}`];
}
