import test from 'node:test';
import assert from 'node:assert/strict';
import { Mailroom } from '../../src/agent/mailroom.ts';
import type { CallResult } from '../../src/agent/server.ts';

const ID1 = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
const ID3 = '00000000-0000-4000-8000-000000000003';
const SID = '00000000-0000-4000-8000-0000000000aa';

const ok = (data: unknown): CallResult => ({ ok: true, status: 200, data });
const fail = (status: number, code: string | null, requestId: string | null = null, retryAfter: number | null = null): CallResult =>
  ({ ok: false, status, code, requestId, retryAfter });

type Routes = Record<string, Array<() => CallResult>>;

function fakeCall(routes: Routes): { call: (m: 'GET' | 'POST', p: string) => Promise<CallResult>; log: string[] } {
  const log: string[] = [];
  const taken: Record<string, number> = {};
  return {
    log,
    call: async (method, path) => {
      const key = `${method} ${path}`;
      log.push(key);
      const list = routes[key];
      if (!list) return fail(404, 'not-found');
      const i = Math.min(taken[key] ?? 0, list.length - 1);
      taken[key] = (taken[key] ?? 0) + 1;
      return list[i]();
    },
  };
}

const summary = (over: Record<string, unknown> = {}) => ok({
  unread: 1, releasedStages: 1, acknowledgedStages: 0,
  latestNews: 'n1', repositoryAt: 'r1', serverTime: 't', ...over,
});
const msg = (id: string) => ({ id, kind: 'message', title: `m${id.slice(-1)}`, body: 'b', createdAt: 'c', readAt: null, notice: null });
const news = (id: string) => ({ id, title: 'n', body: 'b', publishedAt: 'p' });
const stageSummary = (errataAt: string | null = null) => ({ id: SID, position: 2, title: 'Part 2', excerpt: 'x', errataAt, acknowledgedAt: null });
const stage = (errata: string | null = null) => ({ ...stageSummary(errata ? 'e1' : null), body: '# Part two', errata });
const repo = { url: 'https://github.com/north/z', accessStatus: 'verified', checkedAt: 'c', reason: null, reasonCode: 'marker-found', updatedAt: 'u', verifiedElsewhere: false };

function baseRoutes(): Routes {
  return {
    'GET /me/summary': [() => summary()],
    'GET /inbox?limit=100&offset=0': [() => ok({ items: [msg(ID1)], nextOffset: null })],
    'GET /news?limit=100&offset=0': [() => ok({ items: [news(ID1)], nextOffset: null })],
    'GET /stages': [() => ok({ items: [stageSummary()] })],
    [`GET /stages/${SID}`]: [() => ok({ stage: stage() })],
    'GET /me/repository': [() => ok({ repository: repo })],
  };
}

function room(routes: Routes, over: Partial<ConstructorParameters<typeof Mailroom>[0]> = {}) {
  const f = fakeCall(routes);
  const m = new Mailroom({
    call: f.call, loadConfig: async () => ({ githubUsername: 'zoria-net-bot', permission: 'W', instructions: 'I' }),
    ready: () => true, intervalMs: 15_000, now: () => 0, rand: () => 1, ...over,
  });
  return { m, log: f.log };
}

test('the first tick reads everything once', async () => {
  const { m } = room(baseRoutes());
  await m.tick();
  const d = m.data();
  assert.equal(d.summary?.unread, 1);
  assert.equal(d.inbox.length, 1);
  assert.equal(d.news.length, 1);
  assert.equal(d.stages[0].position, 2);
  assert.equal(m.stage(SID)?.body, '# Part two');
  assert.equal(d.repository?.accessStatus, 'verified');
  assert.equal(d.config?.githubUsername, 'zoria-net-bot');
  assert.equal(d.lastError, null);
});

test('an unchanged summary reads nothing else', async () => {
  const { m, log } = room(baseRoutes());
  await m.tick();
  log.length = 0;
  await m.tick();
  assert.deepEqual(log, ['GET /me/summary']);
});

test('a moved latestNews rereads only the news', async () => {
  const routes = baseRoutes();
  let latestNews = 'n1';
  routes['GET /me/summary'] = [() => summary({ latestNews })];
  const { m, log } = room(routes);
  await m.tick();
  log.length = 0;
  latestNews = 'n2';
  await m.tick();
  assert.deepEqual(log, ['GET /me/summary', 'GET /news?limit=100&offset=0', 'GET /me/summary']);
});

test('a moved repositoryAt rereads only the repository', async () => {
  const routes = baseRoutes();
  let repositoryAt = 'r1';
  routes['GET /me/summary'] = [() => summary({ repositoryAt })];
  const { m, log } = room(routes);
  await m.tick();
  log.length = 0;
  repositoryAt = 'r2';
  await m.tick();
  assert.deepEqual(log, ['GET /me/summary', 'GET /me/repository']);
});

test('a moved errataAt rereads that part, an unchanged one is not reread', async () => {
  const routes = baseRoutes();
  let acknowledgedStages = 0;
  routes['GET /me/summary'] = [() => summary({ acknowledgedStages })];
  routes['GET /stages'] = [() => ok({ items: [stageSummary()] }), () => ok({ items: [stageSummary('e1')] })];
  routes[`GET /stages/${SID}`] = [() => ok({ stage: stage() }), () => ok({ stage: stage('fix') })];
  const { m, log } = room(routes);
  await m.tick();
  log.length = 0;
  acknowledgedStages = 1;
  await m.tick();
  assert.ok(log.includes(`GET /stages/${SID}`));
  assert.equal(m.stage(SID)?.errata, 'fix');
});

test('pages are followed to the end and duplicates are dropped', async () => {
  const routes = baseRoutes();
  routes['GET /inbox?limit=100&offset=0'] = [() => ok({ items: [msg(ID1), msg(ID2)], nextOffset: 2 })];
  routes['GET /inbox?limit=100&offset=2'] = [() => ok({ items: [msg(ID2), msg(ID3)], nextOffset: null })];
  const { m } = room(routes);
  await m.tick();
  assert.deepEqual(m.data().inbox.map((x) => x.id), [ID1, ID2, ID3]);
});

test('a letter arriving mid-scroll restarts the scroll, at most three times', async () => {
  const routes = baseRoutes();
  let n = 0;
  routes['GET /me/summary'] = [() => summary({ unread: (n += 1) })];
  const { m, log } = room(routes);
  await m.tick();
  const scrolls = log.filter((x) => x === 'GET /inbox?limit=100&offset=0').length;
  assert.equal(scrolls, 4);
  assert.equal(m.data().inbox.length, 1);
});

test('a non-advancing nextOffset does not loop forever', async () => {
  const routes = baseRoutes();
  routes['GET /inbox?limit=100&offset=0'] = [() => ok({ items: [msg(ID1)], nextOffset: 0 })];
  const { m } = room(routes);
  await m.tick();
  assert.equal(m.data().inbox.length, 1);
});

test('a failed read keeps the old data, records the request id and retries next tick', async () => {
  let clock = 0;
  let latestNews = 'n1';
  const routes = baseRoutes();
  routes['GET /me/summary'] = [() => summary({ latestNews })];
  routes['GET /news?limit=100&offset=0'] = [
    () => ok({ items: [news(ID1)], nextOffset: null }),
    () => fail(500, 'internal-error', 'req-9'),
    () => ok({ items: [news(ID1), news(ID2)], nextOffset: null }),
  ];
  const { m } = room(routes, { now: () => clock });
  await m.tick();
  latestNews = 'n2';
  await m.tick();
  assert.equal(m.data().news.length, 1);
  assert.deepEqual(m.data().lastError, { what: 'news', status: 500, code: 'internal-error', requestId: 'req-9' });
  clock += 2_000;
  await m.tick();
  assert.equal(m.data().news.length, 2);
  assert.equal(m.data().lastError, null);
});

test('429 on the summary pauses polling for Retry-After', async () => {
  let clock = 0;
  const routes = baseRoutes();
  routes['GET /me/summary'] = [() => fail(429, 'rate-limited', null, 60), () => summary()];
  const { m, log } = room(routes, { now: () => clock });
  await m.tick();
  clock += 59_000;
  await m.tick();
  assert.equal(log.filter((x) => x === 'GET /me/summary').length, 1);
  clock += 1_000;
  await m.tick();
  assert.equal(m.data().summary?.unread, 1);
});

test('an unreleased part (404) is skipped, the rest is kept', async () => {
  const routes = baseRoutes();
  routes[`GET /stages/${SID}`] = [() => fail(404, 'not-found')];
  const { m } = room(routes);
  await m.tick();
  assert.equal(m.data().stages.length, 1);
  assert.equal(m.stage(SID), null);
});

test('a null repository is a valid answer', async () => {
  const routes = baseRoutes();
  routes['GET /me/repository'] = [() => ok({ repository: null })];
  const { m } = room(routes);
  await m.tick();
  assert.equal(m.data().repository, null);
  assert.equal(m.data().lastError, null);
});

test('not ready means no request at all', async () => {
  const { m, log } = room(baseRoutes(), { ready: () => false });
  await m.tick();
  assert.deepEqual(log, []);
});

test('two overlapping ticks run once', async () => {
  const { m, log } = room(baseRoutes());
  await Promise.all([m.tick(), m.tick()]);
  assert.equal(log.filter((x) => x === 'GET /inbox?limit=100&offset=0').length, 1);
});

test('ack and markRead update the stored part and letter', async () => {
  const routes = baseRoutes();
  routes[`POST /stages/${SID}/ack`] = [() => ok({ stage: { ...stage(), acknowledgedAt: 'a1' } })];
  routes[`POST /inbox/${ID1}/read`] = [() => ok({ message: { ...msg(ID1), readAt: 'r1' } })];
  const { m } = room(routes);
  await m.tick();
  assert.equal((await m.ack(SID)).ok, true);
  assert.equal(m.data().stages[0].acknowledgedAt, 'a1');
  assert.equal(m.stage(SID)?.acknowledgedAt, 'a1');
  assert.equal((await m.markRead(ID1)).ok, true);
  assert.equal(m.data().inbox[0].readAt, 'r1');
  assert.equal((await m.ack('../me')).ok, false);
});

test('reset forgets everything read so the next tick reads it all again', async () => {
  const { m, log } = room(baseRoutes());
  await m.tick();
  m.reset();
  assert.equal(m.data().inbox.length, 0);
  log.length = 0;
  await m.tick();
  assert.ok(log.includes('GET /inbox?limit=100&offset=0'));
});

test('one letter arriving mid-scroll costs one extra scroll, not four', async () => {
  const routes = baseRoutes();
  let unread = 1;
  let scrolls = 0;
  routes['GET /inbox?limit=100&offset=0'] = [() => { scrolls += 1; if (scrolls === 1) unread = 2; return ok({ items: [msg(ID1)], nextOffset: null }); }];
  routes['GET /me/summary'] = [() => summary({ unread })];
  const { m } = room(routes);
  await m.tick();
  assert.equal(scrolls, 2);
  await m.tick();
  assert.equal(scrolls, 2, 'the next tick sees nothing new');
});

test('a reset during a running tick keeps the old account out of the data', async () => {
  const routes = baseRoutes();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => { release = r; });
  const f = fakeCall(routes);
  const m = new Mailroom({
    call: async (method, path) => { if (path === '/me/repository') await gate; return f.call(method, path); },
    loadConfig: async () => null, ready: () => true, intervalMs: 15_000, now: () => 0, rand: () => 1,
  });
  const running = m.tick();
  await new Promise((r) => setTimeout(r, 20));
  m.reset();
  release();
  await running;
  assert.equal(m.data().inbox.length, 0);
  assert.equal(m.data().repository, null);
  assert.equal(m.stage(SID), null);
});

test('a broken inbox answer does not stop parts, news and repository from being read', async () => {
  const routes = baseRoutes();
  routes['GET /inbox?limit=100&offset=0'] = [() => ok('<html>')];
  const { m } = room(routes);
  await m.tick();
  assert.equal(m.data().stages.length, 1);
  assert.equal(m.data().news.length, 1);
  assert.equal(m.data().repository?.accessStatus, 'verified');
  assert.equal(m.data().lastError?.what, 'inbox');
});
