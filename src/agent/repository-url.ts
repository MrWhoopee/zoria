const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function isRepositoryRoot(value: string): boolean {
  const v = value.trim();
  if (v.length === 0 || v.includes('?') || v.includes('#')) return false;
  const ssh = /^git@github\.com:(.+)$/i.exec(v);
  let path = ssh ? ssh[1] : v.replace(/^https?:\/\//i, '');
  if (!ssh) {
    const host = /^(?:www\.)?github\.com\//i.exec(path);
    if (host) path = path.slice(host[0].length);
    else if (/^https?:\/\//i.test(v)) return false;
  }
  path = path.replace(/\/+$/, '').replace(/\.git$/i, '');
  const parts = path.split('/');
  if (parts.length !== 2) return false;
  const [owner, repo] = parts;
  return OWNER.test(owner) && REPO.test(repo) && repo !== '.' && repo !== '..';
}
