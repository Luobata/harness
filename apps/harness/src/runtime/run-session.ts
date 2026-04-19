import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GoalInput, RoleDefinition, RunReport, TeamSlotTmuxBinding } from '../domain/types.js'
import type { RoleModelConfig } from '../role-model-config/schema.js'
import type { CocoAdapter } from './coco-adapter.js'
import type { FailurePolicyConfig } from './failure-policy.js'
import type { TeamCompositionRegistry } from '../team/team-composition-loader.js'
import { persistRunReport } from './state-store.js'
import { getRunReportPath } from './state-store.js'
import { queueExists } from './task-store.js'
import { runGoal } from '../orchestrator/run-goal.js'
import { createHarnessRepoPaths } from './repo-paths.js'

export type RunSessionStatus = 'idle' | 'running' | 'completed' | 'failed'

export type RunSession = {
  runDirectory: string
  start(): Promise<void>
  waitForCompletion(): Promise<RunReport>
  startAndWait(): Promise<RunReport>
  getStatus(): RunSessionStatus
  getError(): Error | null
  getReport(): RunReport | null
}

const RUN_SESSION_START_TIMEOUT_MS = 5000

type TmuxManagerModule = {
  checkTmuxHealth(): Promise<{ available: boolean }>
  createSplitLayout(
    layout: {
      type: 'horizontal' | 'vertical' | 'grid'
      panes: Array<{ name: string; cwd: string }>
    },
    options?: {
      newWindow?: boolean
      sessionName?: string
      windowName?: string
      timeout?: number
    }
  ): Promise<{
    sessionName: string
    workerPaneIds: string[]
    mode: TeamSlotTmuxBinding['mode']
  }>
  getPaneInfo(paneId: string): Promise<{ paneIndex: number; title?: string } | null>
  sanitizeName(name: string): string
}

export function resolveTmuxManagerFallbackSpecifiers(moduleUrl: string = import.meta.url): string[] {
  const { repoRoot } = createHarnessRepoPaths(moduleUrl)
  return [
    pathToFileURL(resolve(repoRoot, 'packages', 'tmux-manager', 'dist', 'index.js')).href,
    pathToFileURL(resolve(repoRoot, 'packages', 'tmux-manager', 'src', 'index.ts')).href
  ]
}

export async function loadTmuxManagerModule(params?: {
  importPackage?: (specifier: string) => Promise<TmuxManagerModule>
  importFallback?: (specifier: string) => Promise<TmuxManagerModule>
  moduleUrl?: string
}): Promise<TmuxManagerModule> {
  const importPackage = params?.importPackage ?? (async (specifier: string) => await import(specifier) as TmuxManagerModule)
  const importFallback = params?.importFallback ?? (async (specifier: string) => await import(specifier) as TmuxManagerModule)
  const packageName = '@luobata/tmux-manager'
  const fallbackSpecifiers = resolveTmuxManagerFallbackSpecifiers(params?.moduleUrl)

  try {
    return await importPackage(packageName)
  } catch (primaryError) {
    let lastFallbackError: unknown = primaryError
    for (const fallbackSpecifier of fallbackSpecifiers) {
      try {
        return await importFallback(fallbackSpecifier)
      } catch (fallbackError) {
        lastFallbackError = fallbackError
      }
    }

    throw lastFallbackError instanceof Error ? lastFallbackError : new Error(String(lastFallbackError))
  }
}

function buildTeamTmuxLayoutType(teamSize: number): 'horizontal' | 'grid' {
  return teamSize <= 2 ? 'horizontal' : 'grid'
}

function buildSanitizedTmuxName(name: string, sanitizeName: (value: string) => string, fallback: string): string {
  const sanitized = sanitizeName(name).trim()
  return sanitized || fallback
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function prepareTeamRunSpecWithTmuxBindings(params: {
  workspaceRoot: string
  runDirectory: string
  input: GoalInput
  loadTmuxManager?: () => Promise<TmuxManagerModule>
}): Promise<GoalInput> {
  const { workspaceRoot, runDirectory, input, loadTmuxManager = loadTmuxManagerModule } = params
  const teamRunSpec = input.teamRunSpec
  if (!teamRunSpec || teamRunSpec.slots.length === 0) {
    return input
  }

  try {
    const tmuxManager = await loadTmuxManager()
    const health = await tmuxManager.checkTmuxHealth()
    if (!health.available) {
      return input
    }

    const runLabel = basename(runDirectory)
    const sessionName = buildSanitizedTmuxName(`harness-${runLabel}`, tmuxManager.sanitizeName, 'harness-team')
    const windowName = buildSanitizedTmuxName(`${runLabel}-team`, tmuxManager.sanitizeName, 'team')
    const layout: {
      type: 'horizontal' | 'vertical' | 'grid'
      panes: Array<{ name: string; cwd: string }>
    } = {
      type: buildTeamTmuxLayoutType(teamRunSpec.teamSize),
      panes: [
        { name: 'leader', cwd: workspaceRoot },
        ...teamRunSpec.slots.map((slot) => ({
          name: `slot-${slot.slotId}`,
          cwd: workspaceRoot
        }))
      ]
    }

    const createdLayout = await tmuxManager.createSplitLayout(layout, {
      newWindow: true,
      sessionName,
      windowName
    })

    const slots = await Promise.all(teamRunSpec.slots.map(async (slot, index) => {
      const paneId = createdLayout.workerPaneIds[index]
      if (!paneId) {
        return slot
      }

      const paneInfo = await tmuxManager.getPaneInfo(paneId).catch(() => null)
      return {
        ...slot,
        tmux: {
          paneId,
          sessionName: createdLayout.sessionName,
          mode: createdLayout.mode,
          paneIndex: paneInfo?.paneIndex ?? null,
          title: paneInfo?.title?.trim() ? paneInfo.title : null
        }
      }
    }))

    return {
      ...input,
      teamRunSpec: {
        ...teamRunSpec,
        slots
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[harness] tmux bootstrap skipped: ${message}\n`)
    return input
  }
}

export function createRunSession(params: {
  workspaceRoot: string
  stateRoot: string
  runDirectory: string
  input: GoalInput
  adapter: CocoAdapter
  roleRegistry: Map<string, RoleDefinition>
  modelConfig: RoleModelConfig
  failurePolicyConfig: FailurePolicyConfig
  teamCompositionRegistry: TeamCompositionRegistry
  maxConcurrency?: number
  prepareInput?: (params: { workspaceRoot: string; runDirectory: string; input: GoalInput }) => Promise<GoalInput>
}): RunSession {
  const {
    workspaceRoot,
    stateRoot,
    runDirectory,
    input,
    adapter,
    roleRegistry,
    modelConfig,
    failurePolicyConfig,
    teamCompositionRegistry,
    maxConcurrency = 2,
    prepareInput = prepareTeamRunSpecWithTmuxBindings
  } = params

  let status: RunSessionStatus = 'idle'
  let error: Error | null = null
  let report: RunReport | null = null
  let runPromise: Promise<RunReport> | null = null
  let startupPromise: Promise<void> | null = null
  const reportPath = getRunReportPath(runDirectory)

  const ensureStarted = (): Promise<RunReport> => {
    if (runPromise) {
      return runPromise
    }

    status = 'running'
    startupPromise = new Promise<void>((resolve, reject) => {
      runPromise = prepareInput({ workspaceRoot, runDirectory, input })
      .then((preparedInput) => {
        resolve()
        return runGoal({
          workspaceRoot,
          input: preparedInput,
          adapter,
          roleRegistry,
          modelConfig,
          failurePolicyConfig,
          teamCompositionRegistry,
          runDirectory,
          maxConcurrency
        })
      })
      .then((nextReport) => {
        report = nextReport
        persistRunReport(stateRoot, nextReport, runDirectory)
        status = 'completed'
        return nextReport
      })
      .catch((caughtError: unknown) => {
        error = caughtError instanceof Error ? caughtError : new Error(String(caughtError))
        status = 'failed'
        reject(error)
        throw error
      })
    })

    return runPromise!
  }

  return {
    runDirectory,
    async start(): Promise<void> {
      ensureStarted().catch(() => undefined)
      const startedAt = Date.now()

      while (true) {
        if (status === 'failed') {
          throw error ?? new Error('run session 启动失败')
        }

        if (queueExists(runDirectory) || existsSync(reportPath) || status === 'completed') {
          return
        }

        if (Date.now() - startedAt >= RUN_SESSION_START_TIMEOUT_MS) {
          throw new Error(`run session 启动超时: ${runDirectory}`)
        }

        await Promise.race([
          startupPromise?.catch(() => undefined) ?? Promise.resolve(),
          delay(10)
        ])
      }
    },
    waitForCompletion(): Promise<RunReport> {
      return ensureStarted()
    },
    startAndWait(): Promise<RunReport> {
      return ensureStarted()
    },
    getStatus(): RunSessionStatus {
      return status
    },
    getError(): Error | null {
      return error
    },
    getReport(): RunReport | null {
      return report
    }
  }
}
