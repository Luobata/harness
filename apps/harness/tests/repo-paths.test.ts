import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

const tempRoots: string[] = []
const builtModuleUrl = pathToFileURL(resolve(import.meta.dirname, '..', 'dist', 'src', 'runtime', 'repo-paths.js')).href

const createTempRoot = (prefix: string): string => {
  const root = mkdtempSync(resolve(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

async function loadRepoPathsModule(options: { stateRoot?: string; skillPacksRoot?: string } = {}) {
  vi.resetModules()
  vi.stubEnv('HARNESS_STATE_ROOT', options.stateRoot ?? '')
  vi.stubEnv('HARNESS_SKILL_PACKS_ROOT', options.skillPacksRoot ?? '')
  return await import('../src/runtime/repo-paths.js')
}

describe('repo paths', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()

    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('能从编译产物 module url 推导 monorepo 根路径', async () => {
    const { createHarnessRepoPaths } = await loadRepoPathsModule()

    const paths = createHarnessRepoPaths(builtModuleUrl)

    expect(paths.appRoot).toBe(resolve(import.meta.dirname, '..'))
    expect(paths.repoRoot).toBe(resolve(import.meta.dirname, '..', '..', '..'))
    expect(paths.configRoot).toBe(resolve(paths.appRoot, 'configs'))
    expect(paths.skillsRoot).toBe(resolve(paths.repoRoot, 'skills'))
    expect(paths.skillPacksRoot).toBe(resolve(paths.repoRoot, '.harness', 'skill-packs'))
    expect(paths.stateRoot).toBe(resolve(paths.repoRoot, '.harness', 'state'))
    expect(paths.skillStateRoot).toBe(resolve(paths.stateRoot, 'skills'))
  })

  it('允许通过环境变量覆写 stateRoot 与 skillPacksRoot', async () => {
    const overriddenStateRoot = createTempRoot('harness-test-state-root-')
    const overriddenSkillPacksRoot = createTempRoot('harness-test-skill-packs-root-')
    const { createHarnessRepoPaths } = await loadRepoPathsModule({
      stateRoot: overriddenStateRoot,
      skillPacksRoot: overriddenSkillPacksRoot,
    })

    const paths = createHarnessRepoPaths(builtModuleUrl)

    expect(paths.appRoot).toBe(resolve(import.meta.dirname, '..'))
    expect(paths.repoRoot).toBe(resolve(import.meta.dirname, '..', '..', '..'))
    expect(paths.stateRoot).toBe(overriddenStateRoot)
    expect(paths.skillStateRoot).toBe(resolve(overriddenStateRoot, 'skills'))
    expect(paths.skillPacksRoot).toBe(overriddenSkillPacksRoot)
    expect(paths.skillsRoot).toBe(resolve(paths.repoRoot, 'skills'))
  })

  it('stateRoot 位于 monorepo 根目录的 .harness/state', async () => {
    const { getHarnessRepoPaths } = await loadRepoPathsModule()
    const paths = getHarnessRepoPaths()

    expect(paths.appRoot).toBe(resolve(import.meta.dirname, '..'))
    expect(paths.repoRoot).toBe(resolve(paths.appRoot, '..', '..'))
    expect(paths.configRoot).toBe(resolve(paths.appRoot, 'configs'))
    expect(paths.skillsRoot).toBe(resolve(paths.repoRoot, 'skills'))
    expect(paths.skillPacksRoot).toBe(resolve(paths.repoRoot, '.harness', 'skill-packs'))
    expect(paths.stateRoot).toBe(resolve(paths.repoRoot, '.harness', 'state'))
    expect(paths.skillStateRoot).toBe(resolve(paths.stateRoot, 'skills'))
  })

  it('当输入仅存在于 repo root 时会 fallback 到 repo root', async () => {
    const { resolveHarnessInputPath } = await loadRepoPathsModule()
    const workspace = createTempRoot('harness-repo-paths-')
    const appRoot = resolve(workspace, 'apps', 'harness')
    const cwd = resolve(appRoot, 'src')
    const repoOnlyTarget = resolve(workspace, 'docs', 'spec.md')

    mkdirSync(cwd, { recursive: true })
    mkdirSync(resolve(workspace, 'docs'), { recursive: true })
    writeFileSync(repoOnlyTarget, '# spec\n', 'utf8')

    const resolvedPath = resolveHarnessInputPath('docs/spec.md', {
      cwd,
      repoRoot: workspace,
    })

    expect(resolvedPath).toBe(repoOnlyTarget)
    expect(existsSync(resolvedPath)).toBe(true)
  })
})
