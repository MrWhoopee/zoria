import test from 'node:test';
import assert from 'node:assert/strict';
import { mailList, mailText, newsList, numbered, partsList, reasonText, repoLines, rollLines } from '../../src/client/terminal/account.ts';

const Z = 'UTC';
const m = (id: string, createdAt: string, readAt: string | null = null) =>
  ({ id, kind: 'message', stageId: null, title: `Title ${id}`, body: '**Hello** [site](https://zoria.net)', createdAt, readAt, notice: null });

test('numbers follow age so they stay put when new items arrive; newest is listed first', () => {
  const list = numbered([m('b', '2026-09-25T10:00:00.000Z'), m('a', '2026-09-24T10:00:00.000Z')], (x) => x.createdAt);
  assert.deepEqual(list.map((x) => [x.n, x.item.id]), [[2, 'b'], [1, 'a']]);
});

test('mail list marks unread letters', () => {
  const lines = mailList([m('a', '2026-09-24T10:00:00.000Z'), m('b', '2026-09-25T10:00:00.000Z', 'r')], Z);
  assert.equal(lines[0], '  2 25.09 10:00 Title b');
  assert.equal(lines[1], '● 1 24.09 10:00 Title a');
  assert.deepEqual(mailList([], Z), ['NO MAIL YET']);
});

test('a letter shows sender, date and safe text; a server notice is named', () => {
  const lines = mailText({ ...m('a', '2026-09-24T10:00:00.000Z'), notice: { type: 'repository', accessStatus: 'verified' } }, Z, 46);
  assert.equal(lines[0], 'FROM     server notice');
  assert.equal(lines[1], 'DATE     24.09 10:00 UTC');
  assert.ok(lines.includes('Hello site <https://zoria.net/>'));
  assert.ok(lines.includes('ACCESS   VERIFIED'));
  const plain = mailText({ ...m('a', '2026-09-24T10:00:00.000Z'), notice: { type: 'unknown-kind' } }, Z, 46);
  assert.equal(plain[0], 'FROM     organizers');
});

test('news shows archived items as such', () => {
  const lines = newsList([{ id: 'n', title: 'Draw', body: '', publishedAt: '2026-09-26T12:00:00.000Z', updatedAt: null, archivedAt: 'x' }], Z);
  assert.equal(lines[0], '1 26.09 12:00 Draw (archived)');
});

test('parts list: position, title, release, receipt and errata', () => {
  const lines = partsList([{ id: 's', position: 2, title: 'Part 2', excerpt: '', publishedAt: null, releasedAt: '2026-09-28T07:00:00.000Z', acknowledgedAt: null, errataAt: '2026-09-29T08:00:00.000Z' }], Z);
  assert.equal(lines[0], '2. Part 2');
  assert.equal(lines[1], '   given 28.09 07:00   NEW   ERRATA 29.09 08:00');
  assert.ok(lines.includes('ACK N    acknowledge receipt of part N'));
  assert.deepEqual(partsList([], Z)[0], 'NO PARTS RELEASED YET');
});

test('repository: status, reason text by code, organizer reason verbatim, elsewhere warning', () => {
  const repo = { url: 'https://github.com/mrwhoopee/zoria', accessStatus: 'verified', checkedAt: '2026-09-25T05:00:36.000Z', reason: 'server text', reasonCode: 'marker-found', updatedAt: null, verifiedElsewhere: true };
  const lines = repoLines(repo, { githubUsername: 'zoria-net-bot', permission: 'Write', instructions: 'Invite the bot.' }, 'mrwhoopee', Z, 46);
  assert.ok(lines.includes('STATUS   VERIFIED'));
  assert.ok(lines.includes('CHECKED  25.09 05:00 UTC'));
  assert.ok(lines.includes('!! VERIFIED UNDER ANOTHER ACCOUNT'));
  assert.ok(lines.includes('INVITE   zoria-net-bot'));
  assert.ok(lines.includes('.zoria   mrwhoopee'));
  assert.ok(lines.includes('keep the repository private'));
  assert.equal(reasonText({ ...repo, reasonCode: 'organizer', reason: 'Organizer said so' }), 'Organizer said so');
  assert.equal(reasonText({ ...repo, reasonCode: 'marker-absent' }), 'invitation accepted, no .zoria file yet');
  assert.equal(reasonText({ ...repo, reasonCode: 'something-new', reason: 'fallback' }), 'fallback');
  assert.ok(repoLines(null, null, 'mrwhoopee', Z, 46).includes('URL      none on file'));
});

test('the roll marks your own line', () => {
  const lines = rollLines([{ n: 1, at: '2026-09-25T05:00:00.100Z', sinceOpen: 0, name: 'North' }, { n: 2, at: '2026-09-25T05:00:00.300Z', sinceOpen: 0, name: 'MrWhoopee' }], 'MrWhoopee', Z);
  assert.equal(lines[0], ' 1 25.09 05:00 +0s North');
  assert.equal(lines[1], ' 2 25.09 05:00 +0s MrWhoopee ◄');
});

test('a full letter stays within 46 columns however long its words are', () => {
  const long = 'x'.repeat(200);
  for (const l of mailText({ ...m('a', 'c'), title: long, body: `${long}\n\n- ${long}\n\n\`\`\`\n${long}\n\`\`\`` }, Z, 46)) {
    assert.ok(Array.from(l).length <= 46, l);
  }
});
