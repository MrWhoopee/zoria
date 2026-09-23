import test from 'node:test';
import assert from 'node:assert/strict';
import { isRepositoryRoot } from '../../src/agent/repository-url.ts';

const accepted = [
  'owner/repo',
  'MrWhoopee/zoria',
  'owner/repo.git',
  'owner/repo/',
  'owner/my.repo',
  'https://github.com/owner/repo',
  'http://github.com/owner/repo',
  'https://www.github.com/owner/repo',
  'github.com/owner/repo',
  'www.github.com/owner/repo',
  'https://github.com/owner/repo.git',
  'https://github.com/owner/repo/',
  'git@github.com:owner/repo.git',
  '  owner/repo  ',
];

const rejected = [
  '',
  'owner',
  'owner/repo/extra',
  'https://github.com/owner/repo/blob/main/README.md',
  'https://github.com/owner/repo/tree/main',
  'https://github.com/owner/repo?tab=readme',
  'https://github.com/owner/repo#readme',
  'https://gitlab.com/owner/repo',
  'gitlab.com/owner/repo',
  'owner.name/repo',
  'owner/..',
  '/repo',
  'owner/',
];

for (const value of accepted) {
  test(`accepts a repository root: ${JSON.stringify(value)}`, () => {
    assert.equal(isRepositoryRoot(value), true);
  });
}

for (const value of rejected) {
  test(`rejects anything but a GitHub repository root: ${JSON.stringify(value)}`, () => {
    assert.equal(isRepositoryRoot(value), false);
  });
}
