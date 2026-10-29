/**
 * Tests for script/major-tag.sh, which release.yml runs. Each test runs it in
 * a git repository with fixture tags and a bare origin.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

const SCRIPT = path.resolve('script/major-tag.sh')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * A repository with one commit per tag, in the order given, and a bare origin
 * that holds `v1` at the first commit.
 */
function repoWithTags(tags: string[]): { work: string; origin: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'major-tag-'))
  const origin = path.join(dir, 'origin.git')
  const work = path.join(dir, 'work')

  git(dir, ['init', '-q', '--bare', origin])
  git(dir, ['init', '-q', work])
  git(work, ['config', 'user.name', 'test'])
  git(work, ['config', 'user.email', 'test@example.com'])
  git(work, ['config', 'commit.gpgSign', 'false'])
  git(work, ['config', 'tag.gpgSign', 'false'])
  git(work, ['remote', 'add', 'origin', origin])

  for (const tag of tags) {
    git(work, ['commit', '-q', '--allow-empty', '-m', tag])
    git(work, ['tag', tag])
  }

  git(work, ['tag', '-a', 'v1', '-m', 'v1', `${tags[0]}^{commit}`])
  git(work, ['push', '-q', 'origin', 'v1'])

  return { work, origin }
}

function run(work: string, tag: string) {
  return spawnSync('sh', [SCRIPT, tag], { cwd: work, encoding: 'utf8' })
}

/** The commit `tag` points at in `repo`. */
function commitOf(repo: string, tag: string): string {
  return git(repo, ['rev-parse', `${tag}^{commit}`])
}

describe('major-tag.sh', () => {
  it('moves the major tag to the highest release of the major', () => {
    const { work, origin } = repoWithTags(['v1.0.0', 'v1.2.0', 'v1.10.0'])

    const result = run(work, 'v1.10.0')

    expect(result.status).toBe(0)
    expect(commitOf(origin, 'v1')).toBe(commitOf(work, 'v1.10.0'))
  })

  it('skips with a notice a release that is not the highest of its major', () => {
    const { work, origin } = repoWithTags(['v1.0.0', 'v1.3.0', 'v1.1.0-rc1'])
    git(work, [
      'push',
      '-q',
      '--force',
      'origin',
      'v1.3.0^{commit}:refs/tags/v1'
    ])

    const result = run(work, 'v1.1.0-rc1')

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      '::notice::Release v1.1.0-rc1 is not the highest v1 release (v1.3.0), so v1 does not move.'
    )
    expect(commitOf(origin, 'v1')).toBe(commitOf(work, 'v1.3.0'))
  })

  it('ranks a release above its prereleases', () => {
    const { work, origin } = repoWithTags(['v1.0.0', 'v1.1.0', 'v1.1.0-rc1'])

    expect(run(work, 'v1.1.0').status).toBe(0)
    expect(commitOf(origin, 'v1')).toBe(commitOf(work, 'v1.1.0'))
  })

  it('compares only the tags of the same major', () => {
    const { work, origin } = repoWithTags(['v1.0.0', 'v10.0.0', 'v1.1.0'])

    expect(run(work, 'v1.1.0').status).toBe(0)
    expect(commitOf(origin, 'v1')).toBe(commitOf(work, 'v1.1.0'))
  })

  it('fails on a tag that does not start with vMAJOR', () => {
    const { work } = repoWithTags(['v1.0.0', 'release-1'])

    const result = run(work, 'release-1')

    expect(result.status).toBe(1)
    expect(result.stdout).toContain(
      '::error::Release tag release-1 does not start with vMAJOR.'
    )
  })

  it('fails on a release tag that is not fetched', () => {
    const { work } = repoWithTags(['v1.0.0'])

    const result = run(work, 'v1.1.0')

    expect(result.status).toBe(1)
    expect(result.stdout).toContain(
      '::error::Release tag v1.1.0 is not fetched.'
    )
  })
})
