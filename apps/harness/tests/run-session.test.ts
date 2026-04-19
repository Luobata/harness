import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FailurePolicyConfig } from '../src/runtime/failure-policy.js'
import type { RoleModelConfig } from '../src/role-model-config/schema.js'
import type { TeamCompositionRegistry } from '../src/team/team-composition-loader.js'
import type { GoalInput } from '../src/domain/types.js'
import type { CocoAdapter } from '../src/runtime/coco-adapter.js'
import {
  createRunSession,
  loadTmuxManagerModule,
  prepareTeamRunSpecWithTmuxBindings,
  resolveTmuxManagerFallbackSpecifiers
} from '../src/runtime/run-session.js'

afterEach(() => {
  vi.useRealTimers()
})

const noopAdapter: CocoAdapter = {
  async execute() {
    throw new Error('should not execute adapter in startup timeout test')
  }
}

const modelConfig: RoleModelConfig = {
  version: 1,
  defaults: {
    global: 'gpt5.4',
    teams: {}
  },
  taskTypes: {},
  roles: {},
  skills: {}
}

const failurePolicyConfig: FailurePolicyConfig = {
  version: 1,
  defaults: {
    global: {
      maxAttempts: 1,
      retryDelayMs: 0,
      fallbackRole: null,
      fallbackModel: null,
      fixVerifyLoop: null,
      retryOn: [],
      terminalOn: []
    },
    taskTypes: {},
    roles: {}
  }
}

const teamCompositionRegistry: TeamCompositionRegistry = {
  defaultComposition: 'default',
  compositions: {
    default: {
      name: 'default',
      description: 'default composition',
      workstreams: [
        {
          taskType: 'coding',
          role: 'coder',
          title: 'coding',
          skills: ['implementation'],
          acceptance: ['done']
        }
      ]
    }
  }
}

describe('run session tmux bootstrap', () => {
  it('fallback specifiers 在 dist 运行时优先尝试 workspace dist，再回退 source 入口', () => {
    const distRuntimeUrl = pathToFileURL(resolve(import.meta.dirname, '../dist/src/runtime/run-session.js')).href

    expect(resolveTmuxManagerFallbackSpecifiers(distRuntimeUrl)).toEqual([
      pathToFileURL(resolve(import.meta.dirname, '../../../packages/tmux-manager/dist/index.js')).href,
      pathToFileURL(resolve(import.meta.dirname, '../../../packages/tmux-manager/src/index.ts')).href
    ])
  })

  it('primary import 失败时会回退到 ts source 入口加载 tmux manager', async () => {
    const fallbackSpecifiers: string[] = []
    const manager = {
      async checkTmuxHealth() {
        return { available: true }
      },
      async createSplitLayout() {
        return {
          sessionName: 'tmux-run-a:1',
          workerPaneIds: ['%12'],
          mode: 'dedicated-window' as const
        }
      },
      async getPaneInfo() {
        return { paneIndex: 0, title: 'slot-1' }
      },
      sanitizeName(name: string) {
        return name
      }
    }

    const loaded = await loadTmuxManagerModule({
      importPackage: async () => {
        throw new Error('package dist missing')
      },
      importFallback: async (specifier) => {
        fallbackSpecifiers.push(specifier)
        if (specifier.endsWith('/packages/tmux-manager/dist/index.js')) {
          throw new Error('workspace dist missing')
        }
        return manager
      }
    })

    expect(loaded).toBe(manager)
    expect(fallbackSpecifiers).toHaveLength(2)
    expect(fallbackSpecifiers[0]).toContain('/packages/tmux-manager/dist/index.js')
    expect(fallbackSpecifiers[1]).toContain('/packages/tmux-manager/src/index.ts')
  })

  it('为 teamRunSpec slot 注入 tmux pane binding', async () => {
    const input: GoalInput = {
      goal: 'tmux goal',
      teamRunSpec: {
        teamSize: 2,
        overrides: [],
        slots: [
          { slotId: 1, backend: 'coco', model: 'gpt5.4' },
          { slotId: 2, backend: 'claude-code', profile: 'cc-local' }
        ]
      }
    }

    const preparedInput = await prepareTeamRunSpecWithTmuxBindings({
      workspaceRoot: '/workspace/root',
      runDirectory: '/tmp/runs/run-a',
      input,
      loadTmuxManager: async () => ({
        async checkTmuxHealth() {
          return { available: true }
        },
        async createSplitLayout() {
          return {
            sessionName: 'tmux-run-a:1',
            workerPaneIds: ['%12', '%13'],
            mode: 'dedicated-window' as const
          }
        },
        async getPaneInfo(paneId: string) {
          return {
            paneIndex: paneId === '%12' ? 0 : 1,
            title: paneId === '%12' ? 'slot-1' : 'slot-2'
          }
        },
        sanitizeName(name: string) {
          return name
        }
      })
    })

    expect(input.teamRunSpec?.slots[0]?.tmux).toBeUndefined()
    expect(preparedInput.teamRunSpec?.slots).toMatchObject([
      {
        slotId: 1,
        backend: 'coco',
        model: 'gpt5.4',
        tmux: {
          paneId: '%12',
          sessionName: 'tmux-run-a:1',
          mode: 'dedicated-window',
          paneIndex: 0,
          title: 'slot-1'
        }
      },
      {
        slotId: 2,
        backend: 'claude-code',
        profile: 'cc-local',
        tmux: {
          paneId: '%13',
          sessionName: 'tmux-run-a:1',
          mode: 'dedicated-window',
          paneIndex: 1,
          title: 'slot-2'
        }
      }
    ])
  })

  it('tmux 不可用时保持原始 teamRunSpec', async () => {
    const input: GoalInput = {
      goal: 'tmux unavailable goal',
      teamRunSpec: {
        teamSize: 1,
        overrides: [],
        slots: [{ slotId: 1, backend: 'coco' }]
      }
    }

    const preparedInput = await prepareTeamRunSpecWithTmuxBindings({
      workspaceRoot: '/workspace/root',
      runDirectory: '/tmp/runs/run-b',
      input,
      loadTmuxManager: async () => ({
        async checkTmuxHealth() {
          return { available: false }
        },
        async createSplitLayout() {
          throw new Error('should not create layout when tmux unavailable')
        },
        async getPaneInfo() {
          return null
        },
        sanitizeName(name: string) {
          return name
        }
      })
    })

    expect(preparedInput).toBe(input)
  })

  it('tmux loader 异常时保持原始 teamRunSpec 并输出告警', async () => {
    const input: GoalInput = {
      goal: 'tmux broken goal',
      teamRunSpec: {
        teamSize: 1,
        overrides: [],
        slots: [{ slotId: 1, backend: 'coco' }]
      }
    }
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const preparedInput = await prepareTeamRunSpecWithTmuxBindings({
      workspaceRoot: '/workspace/root',
      runDirectory: '/tmp/runs/run-c',
      input,
      loadTmuxManager: async () => {
        throw new Error('tmux manager bootstrap failed')
      }
    })

    expect(preparedInput).toBe(input)
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('tmux bootstrap skipped: tmux manager bootstrap failed'))
  })

  it('start 会在 prepareInput 卡住时按启动超时报错', async () => {
    vi.useFakeTimers()
    const stateRoot = mkdtempSync(resolve(tmpdir(), 'harness-run-session-state-'))
    const runDirectory = mkdtempSync(resolve(tmpdir(), 'harness-run-session-start-'))
    const session = createRunSession({
      workspaceRoot: '/workspace/root',
      stateRoot,
      runDirectory,
      input: { goal: 'hang startup goal' },
      adapter: noopAdapter,
      roleRegistry: new Map(),
      modelConfig,
      failurePolicyConfig,
      teamCompositionRegistry,
      prepareInput: async () => await new Promise<GoalInput>(() => undefined)
    })

    const startPromise = session.start()
    const rejection = expect(startPromise).rejects.toThrow(`run session 启动超时: ${runDirectory}`)
    await vi.advanceTimersByTimeAsync(5001)

    await rejection
  })
})
