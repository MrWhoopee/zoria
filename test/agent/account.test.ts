import test from 'node:test';
import assert from 'node:assert/strict';
import {
  asConfigAccess, asMessage, asPage, asRepository, asStage, asStageList, asSummary, field, isId,
} from '../../src/agent/account.ts';

const ID = '5e6f7081-92a3-44b5-86c7-d8e9fa0b1c2d';

test('a summary from the spec parses, extra fields are ignored', () => {
  const s = asSummary({
    unread: 1, releasedStages: 1, acknowledgedStages: 0, latestNews: '2026-09-24T19:30:00.000Z',
    repositoryAt: null, serverTime: '2026-09-24T19:31:12.402Z', futureField: 7,
  });
  assert.deepEqual(s, {
    unread: 1, releasedStages: 1, acknowledgedStages: 0, latestNews: '2026-09-24T19:30:00.000Z',
    repositoryAt: null, serverTime: '2026-09-24T19:31:12.402Z',
  });
});

test('anything that is not a summary is rejected, not half-read', () => {
  for (const v of [null, 'x', [], {}, { unread: '1', releasedStages: 0 }, { unread: 1 }]) {
    assert.equal(asSummary(v), null, JSON.stringify(v));
  }
});

test('ids with slashes, dots or spaces are refused so they never reach a URL path', () => {
  assert.equal(isId(ID), true);
  for (const v of ['../me', 'a/b', 'a b', '', 'x'.repeat(65), 5, null]) assert.equal(isId(v), false, String(v));
});

test('a message with an unknown notice type is kept as a plain letter with its notice', () => {
  const m = asMessage({
    id: ID, messageId: null, stageId: null, kind: 'message', title: 'T', body: 'B',
    createdAt: '2026-09-24T09:04:00.000Z', readAt: null, notice: { type: 'future-thing', x: 1 },
  });
  assert.equal(m?.notice?.type, 'future-thing');
  assert.equal(m?.title, 'T');
});

test('a list page drops broken items and keeps the offset', () => {
  const p = asPage({ items: [{ id: ID, title: 'a', body: 'b' }, { id: 'a/b', title: 'x', body: 'y' }, 7], nextOffset: 50 }, asMessage);
  assert.equal(p?.items.length, 1);
  assert.equal(p?.nextOffset, 50);
  assert.equal(asPage({ items: 'no' }, asMessage), null);
  assert.equal(asPage({ items: [], nextOffset: -1 }, asMessage)?.nextOffset, null);
});

test('a stage keeps errata apart from the body', () => {
  const s = asStage({
    id: ID, position: 2, title: 'Part 2', body: '# Hello', publishedAt: 'p', releasedAt: 'r',
    acknowledgedAt: null, errata: 'fix', errataAt: 'e',
  });
  assert.equal(s?.body, '# Hello');
  assert.equal(s?.errata, 'fix');
  assert.equal(asStageList({ items: [{ id: ID, position: 1, title: 'P', excerpt: 'x' }] })?.[0].position, 1);
});

test('repository and config parse; a null repositoryAccess is valid', () => {
  const r = asRepository({
    url: 'https://github.com/north/z', accessStatus: 'verified', checkedAt: null, reason: null,
    reasonCode: 'marker-found', updatedAt: 'u', verifiedElsewhere: false,
  });
  assert.equal(r?.accessStatus, 'verified');
  assert.equal(asConfigAccess({ apiVersion: 1, repositoryAccess: null }), null);
  assert.deepEqual(
    asConfigAccess({ repositoryAccess: { githubUsername: 'zoria-net-bot', permission: 'Write', instructions: 'Invite' } }),
    { githubUsername: 'zoria-net-bot', permission: 'Write', instructions: 'Invite' },
  );
  assert.equal(asConfigAccess('<html>'), undefined);
  assert.equal(field({ stage: 1 }, 'stage'), 1);
  assert.equal(field(null, 'stage'), undefined);
});
