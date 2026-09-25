import test from 'node:test';
import assert from 'node:assert/strict';
import { initialEther } from '../../src/protocol/ether.ts';
import type { Snapshot } from '../../src/client/agent/snapshot.ts';
import { parseSnapshot } from '../../src/client/agent/snapshot.ts';
import { formatDuration, formatLocal, ribbonGlyphs, statusLines } from '../../src/client/terminal/status.ts';

const NOW = Date.UTC(2026, 8, 23, 23, 47, 27);
const OPENS = Date.UTC(2026, 8, 24, 5, 0, 0);

function snap(over: Partial<Snapshot> = {}, ether: Partial<Snapshot['ether']> = {}): Snapshot {
  return {
    ether: { ...initialEther(), ...ether },
    registrar: 'listening',
    blockedReason: null,
    serverNow: null,
    msUntilOpen: null,
    ...over,
  };
}

test('no agent means an OFFLINE screen, not an empty one', () => {
  const lines = statusLines(null, NOW, 'UTC');
  assert.equal(lines[0], 'AGENT    OFFLINE');
});

test('an incomplete snapshot shows UNKNOWN and never NaN or undefined', () => {
  const lines = statusLines(snap(), NOW, 'Europe/Kyiv');
  assert.equal(lines[0], 'PHASE    UNKNOWN');
  assert.ok(lines.includes('OPENS    unknown'));
  for (const l of lines) {
    assert.ok(!l.includes('NaN'), l);
    assert.ok(!l.includes('undefined'), l);
  }
});

test('before the window it counts down and names the local time zone', () => {
  const lines = statusLines(snap({ msUntilOpen: OPENS - NOW }, { phase: 'static', opensAt: OPENS }), NOW, 'Europe/Kyiv');
  assert.equal(lines[0], 'PHASE    STATIC');
  assert.ok(lines.includes('OPENS    in 05:12:33'));
  assert.ok(lines.includes('         24.09 08:00 Europe/Kyiv'));
});

test('during the window it shows when the window closes', () => {
  const closes = Date.UTC(2026, 8, 24, 15, 0, 0);
  const lines = statusLines(snap({}, { phase: 'window', opensAt: OPENS, closesAt: closes }), NOW, 'UTC');
  assert.ok(lines.includes('CLOSES   24.09 15:00 UTC'));
});

test('a window that has already passed says CLOSED instead of counting down to zero', () => {
  const closes = OPENS + 10 * 3600_000;
  const later = closes + 3600_000;
  const lines = statusLines(snap({ msUntilOpen: OPENS - later }, { phase: 'after', opensAt: OPENS, closesAt: closes }), later, 'UTC');
  assert.ok(lines.includes('CLOSED   24.09 15:00 UTC'), lines.join('\n'));
  assert.ok(!lines.some((l) => l.includes('00:00:00')));
});

test('a past opening with no closing time is treated as unknown', () => {
  const later = OPENS + 3600_000;
  const lines = statusLines(snap({ msUntilOpen: OPENS - later }, { phase: 'static', opensAt: OPENS, closesAt: null }), later, 'UTC');
  assert.ok(lines.includes('OPENS    unknown'), lines.join('\n'));
});

test('an active jam shows the seconds left; an expired one shows nothing', () => {
  const jammed = statusLines(snap({}, { silentUntil: NOW + 42_000 }), NOW, 'UTC');
  assert.ok(jammed.includes('JAMMED   42s'));
  const clear = statusLines(snap({}, { silentUntil: NOW - 1 }), NOW, 'UTC');
  assert.ok(!clear.some((l) => l.startsWith('JAMMED')));
});

test('the ribbon maps every mark to its glyph and keeps only the newest 36', () => {
  assert.equal(ribbonGlyphs(['signal', 'noise', 'forgery', 'silence', 'jam'], 36), '│░✗·!');
  const long = Array.from({ length: 50 }, () => 'noise' as const);
  assert.equal(Array.from(ribbonGlyphs(long, 36)).length, 36);
});

test('a blocked registrar shows its reason', () => {
  const lines = statusLines(snap({ registrar: 'blocked', blockedReason: 'invalid-invitation' }), NOW, 'UTC');
  assert.ok(lines.includes('REGISTER blocked (invalid-invitation)'));
});

test('letter fragments are counted when the total is known', () => {
  const lines = statusLines(snap({}, { fragments: { 3: 'a', 18: 'b' }, fragmentsOf: 32 }), NOW, 'UTC');
  assert.ok(lines.includes('LETTER   2/32'));
});

test('earlier letters are counted next to the current one', () => {
  const lines = statusLines(snap({}, { fragments: { 1: 'a' }, fragmentsOf: 20, archive: [{ of: 32, fragments: {} }] }), NOW, 'UTC');
  assert.ok(lines.includes('LETTER   1/20  +1 EARLIER'), lines.join('\n'));
});

test('a typical status fits the 46-column screen', () => {
  const lines = statusLines(snap({ msUntilOpen: OPENS - NOW }, { phase: 'static', opensAt: OPENS, fragmentsOf: 32 }), NOW, 'Europe/Kyiv');
  for (const l of lines) assert.ok(Array.from(l).length <= 46, l);
});

test('durations are HH:MM:SS, clamp at zero, and let hours pass 24', () => {
  assert.equal(formatDuration(0), '00:00:00');
  assert.equal(formatDuration(-5000), '00:00:00');
  assert.equal(formatDuration(26 * 3600 * 1000), '26:00:00');
});

test('local time is DD.MM HH:MM in the given zone', () => {
  assert.equal(formatLocal(OPENS, 'UTC'), '24.09 05:00');
  assert.equal(formatLocal(OPENS, 'Europe/Kyiv'), '24.09 08:00');
});

test('parseSnapshot accepts an agent snapshot and rejects anything else', () => {
  assert.ok(parseSnapshot(JSON.stringify(snap())));
  assert.equal(parseSnapshot('not json'), null);
  assert.equal(parseSnapshot('null'), null);
  assert.equal(parseSnapshot(JSON.stringify({ ether: {}, registrar: 'listening' })), null);
  assert.equal(parseSnapshot(JSON.stringify({ ether: { ribbon: [] } })), null);
});

test('a snapshot from an older agent without letter archive still renders', () => {
  const s = snap({}, { fragments: { 1: 'a' }, fragmentsOf: 32 });
  const { archive: _, ...older } = s.ether;
  const parsed = parseSnapshot(JSON.stringify({ ...s, ether: older }));
  assert.ok(parsed);
  assert.deepEqual(parsed.ether.archive, []);
  assert.ok(statusLines(parsed, NOW, 'UTC').includes('LETTER   1/32'));
});

const ACCOUNT = {
  session: { state: 'active' as const, expiresAt: '2026-09-27T05:00:00.000Z', username: 'mrwhoopee', displayName: 'MrWhoopee' },
  summary: { unread: 2, releasedStages: 1, acknowledgedStages: 0, latestNews: null, repositoryAt: null, serverTime: null },
  config: null,
  repository: { url: 'https://github.com/mrwhoopee/zoria', accessStatus: 'verified', checkedAt: null, reason: null, reasonCode: null, updatedAt: null, verifiedElsewhere: false },
  stages: [], inbox: [], news: [], lastError: null,
};

test('503 stopping says PAUSED, a jam says JAMMED', () => {
  assert.ok(statusLines(snap({}, { silentUntil: NOW + 10_000, silentWhy: 'stop' }), NOW, 'UTC').includes('PAUSED   10s'));
  assert.ok(statusLines(snap({}, { silentUntil: NOW + 10_000, silentWhy: 'jam' }), NOW, 'UTC').includes('JAMMED   10s'));
});

test('a registered agent shows the session end, new mail, parts and repository', () => {
  const lines = statusLines(snap({ registrar: 'registered', account: ACCOUNT }), NOW, 'UTC');
  assert.ok(lines.includes('SESSION  until 27.09 05:00 UTC'));
  assert.ok(lines.includes('MAIL 2 NEW   PARTS 1   REPO VERIFIED'));
  assert.ok(lines.length <= 10, 'fits the body of the screen');
});

test('logged out and rejected sessions point at LOGIN', () => {
  const out = statusLines(snap({ account: { ...ACCOUNT, session: { ...ACCOUNT.session, state: 'logged-out' } } }), NOW, 'UTC');
  assert.ok(out.includes('SESSION  logged out   type LOGIN'));
  const rej = statusLines(snap({ account: { ...ACCOUNT, session: { ...ACCOUNT.session, state: 'rejected' } } }), NOW, 'UTC');
  assert.ok(rej.includes('SESSION  REJECTED   type LOGIN'));
});

test('the last server error is shown with its request id', () => {
  const lines = statusLines(snap({ account: { ...ACCOUNT, lastError: { what: 'news', status: 502, code: null, requestId: 'req-7' } } }), NOW, 'UTC');
  assert.ok(lines.includes('ERROR    news: SERVER ERROR 502'));
  assert.ok(lines.includes('REQ req-7'));
});

test('parseSnapshot keeps a snapshot whose account lists are missing', () => {
  const s = parseSnapshot(JSON.stringify({ ...snap(), account: { session: ACCOUNT.session } }));
  assert.deepEqual(s?.account?.inbox, []);
  assert.deepEqual(s?.account?.stages, []);
});
