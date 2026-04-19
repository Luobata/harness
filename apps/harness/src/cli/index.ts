#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { dispatchPlan } from '../dispatcher/dispatcher.js'
import { buildPlan } from '../planner/planner.js'
import { loadRoleModelConfig } from '../role-model-config/loader.js'
import { AutoFallbackCocoAdapter, CocoCliAdapter, DryRunCocoAdapter } from '../runtime/coco-adapter.js'
import { applyFailurePolicies, loadFailurePolicyConfig } from '../runtime/failure-policy.js'
import { getHarnessRepoPaths, resolveHarnessConfigPath, resolveHarnessInputPath } from '../runtime/repo-paths.js'
import { createRunSession } from '../runtime/run-session.js'
import { createRunDirectory, loadLatestRunPointer, persistPlan, persistRunReport } from '../runtime/state-store.js'
import { resumeRun } from '../runtime/recovery.js'
import { getQueuePath, getTaskRecordPath, queueExists } from '../runtime/task-store.js'
import { loadTaskQueue } from '../runtime/task-queue.js'
import { loadRoles, buildRoleRegistry } from '../team/role-registry.js'
import { loadRolePromptTemplates } from '../team/prompt-loader.js'
import { loadSkills } from '../team/skill-loader.js'
import { buildSkillRegistry } from '../team/skill-registry.js'
import { loadTeamCompositionRegistry } from '../team/team-composition-loader.js'
import { loadSlashCommandRegistry, resolveSlashCommand } from './slash-command-loader.js'
import { dispatchSkillCommand, parseSkillCommand } from './skill-command.js'
import { verifyAssignments, verifyRun } from '../verification/index.js'
import type { DoctorSkillResult, ResolveSkillStatusResult } from '@luobata/skill-devkit'
import type {
  ExecutionBackend,
  GoalTargetFile,
  TeamRunSpec,
  TeamSlotOverride,
  TeamSlotOverrideKey,
  TeamSlotSpec
} from '../domain/types.js'

const { appRoot, repoRoot, skillsRoot, skillPacksRoot, stateRoot, skillStateRoot } = getHarnessRepoPaths()
const roleModelConfigPath = resolveHarnessConfigPath('role-models.yaml')
const rolesConfigPath = resolveHarnessConfigPath('roles.yaml')
const rolePromptConfigPath = resolveHarnessConfigPath('role-prompts.yaml')
const failurePolicyConfigPath = resolveHarnessConfigPath('failure-policies.yaml')
const skillsConfigPath = resolveHarnessConfigPath('skills.yaml')
const teamCompositionConfigPath = resolveHarnessConfigPath('team-compositions.yaml')
const slashCommandConfigPath = resolveHarnessConfigPath('slash-commands.yaml')
const MAX_TARGET_FILE_CHARS = 4000
const TARGET_TEXT_FILE_EXTENSIONS = new Set(['.md', '.markdown', '.mdx', '.txt', '.yaml', '.yml', '.json'])
const IGNORED_TARGET_DIRECTORIES = new Set(['.git', '.harness', 'node_modules', 'dist', 'build', 'coverage'])
const BOOLEAN_FLAGS = new Set(['attach', 'yolo'])
const FLAG_ALIASES = new Map<string, string>([
  ['atach', 'attach'],
  ['team-size', 'teamSize']
])
const TEAM_RUN_DEFAULT_SIZE = 2
const TEAM_RUN_MAX_SIZE = 32
const TEAM_RUN_DSL_NAME = 'team-run'
const TEAM_SLOT_OVERRIDE_KEYS = new Set<TeamSlotOverrideKey>(['backend', 'model', 'profile'])
const EXECUTION_BACKENDS = new Set<ExecutionBackend>(['coco', 'claude-code', 'local-cc'])

export interface ParsedHarnessTeamInvocation {
  goal: string
  teamRunSpec: TeamRunSpec
}

function appendFlag(flags: Map<string, string>, key: string, value: string) {
  const normalizedKey = FLAG_ALIASES.get(key) ?? key

  if ((normalizedKey === 'target' || normalizedKey === 'dir') && flags.has(normalizedKey)) {
    flags.set(normalizedKey, `${flags.get(normalizedKey)},${value}`)
    return
  }

  flags.set(normalizedKey, value)
}

function parseFlags(args: string[], options?: { preserveSeparator?: boolean }): { flags: Map<string, string>; positionals: string[] } {
  const flags = new Map<string, string>()
  const positionals: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (arg === '--') {
      if (options?.preserveSeparator) {
        positionals.push(arg, ...args.slice(index + 1))
      } else {
        positionals.push(...args.slice(index + 1))
      }
      break
    }

    const prefix = arg.startsWith('--') ? '--' : arg.startsWith('-') && arg.length > 1 ? '-' : ''

    if (prefix) {
      const rawFlag = arg.slice(prefix.length)
      const flag = FLAG_ALIASES.get(rawFlag) ?? rawFlag
      const separatorIndex = rawFlag.indexOf('=')

      if (separatorIndex >= 0) {
        appendFlag(flags, rawFlag.slice(0, separatorIndex), rawFlag.slice(separatorIndex + 1))
        continue
      }

      const nextArg = args[index + 1]
      if (BOOLEAN_FLAGS.has(flag) && (nextArg === 'true' || nextArg === 'false')) {
        appendFlag(flags, flag, nextArg)
        index += 1
        continue
      }

      if (nextArg && !nextArg.startsWith('-') && !BOOLEAN_FLAGS.has(flag)) {
        appendFlag(flags, flag, nextArg)
        index += 1
        continue
      }

      appendFlag(flags, flag, 'true')
    } else {
      positionals.push(arg)
    }
  }

  return { flags, positionals }
}

function normalizeCommandInvocation(command: string, flags: Map<string, string>, positionals: string[]): { flags: Map<string, string>; positionals: string[] } {
  const normalizedFlags = new Map(flags)
  const normalizedPositionals = [...positionals]

  if (command === 'run' && normalizedPositionals[0] === 'run' && normalizedPositionals.length > 1) {
    normalizedPositionals.shift()
    process.stderr.write('[harness] normalized duplicated subcommand: run\n')
  }

  return { flags: normalizedFlags, positionals: normalizedPositionals }
}

function isPositiveIntegerToken(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0
}

function parseTeamSlotOverrideToken(token: string): TeamSlotOverride | null {
  const match = token.match(/^(\d+):([a-z-]+)=(.*)$/)
  if (!match) {
    return null
  }

  const [, slotIdToken, rawKey, rawValue] = match
  const slotId = Number(slotIdToken)
  if (!Number.isInteger(slotId) || slotId <= 0) {
    throw new Error(`slotId 非法: ${slotIdToken}`)
  }

  if (!TEAM_SLOT_OVERRIDE_KEYS.has(rawKey as TeamSlotOverrideKey)) {
    throw new Error(`slot override key 非法: ${rawKey}（可选: backend, model, profile）`)
  }

  const value = rawValue.trim()
  if (!value) {
    throw new Error(`slot override 值不能为空: ${token}`)
  }

  const key = rawKey as TeamSlotOverrideKey
  if (key === 'backend' && !EXECUTION_BACKENDS.has(value as ExecutionBackend)) {
    throw new Error(`backend 非法: ${value}（可选: coco, claude-code, local-cc）`)
  }

  return {
    slotId,
    key,
    value
  }
}

function buildTeamSlotSpecs(teamSize: number, overrides: TeamSlotOverride[]): TeamSlotSpec[] {
  const slots: TeamSlotSpec[] = Array.from({ length: teamSize }, (_, index) => ({
    slotId: index + 1
  }))

  for (const override of overrides) {
    if (override.slotId > teamSize) {
      throw new Error(`slot ${override.slotId} 超出 team-size=${teamSize}`)
    }

    const slot = slots[override.slotId - 1]!
    if (override.key === 'backend') {
      slot.backend = override.value as ExecutionBackend
    }
    if (override.key === 'model') {
      slot.model = override.value
    }
    if (override.key === 'profile') {
      slot.profile = override.value
    }
  }

  return slots
}

function shouldTreatFirstTokenAsExplicitTeamSize(positionals: string[]): boolean {
  if (!isPositiveIntegerToken(positionals[0] ?? null)) {
    return false
  }

  const secondToken = positionals[1]
  if (secondToken === '--') {
    return true
  }

  return secondToken != null && parseTeamSlotOverrideToken(secondToken) != null
}

function validateTeamSize(teamSize: number): void {
  if (!Number.isInteger(teamSize) || teamSize <= 0) {
    throw new Error(`team-size 非法: ${teamSize}`)
  }
  if (teamSize > TEAM_RUN_MAX_SIZE) {
    throw new Error(`team-size 超出上限: ${teamSize}（最大 ${TEAM_RUN_MAX_SIZE}）`)
  }
}

function applyExplicitTeamSize(parsed: ParsedHarnessTeamInvocation, explicitTeamSize: number): ParsedHarnessTeamInvocation {
  validateTeamSize(explicitTeamSize)
  return {
    ...parsed,
    teamRunSpec: {
      teamSize: explicitTeamSize,
      overrides: parsed.teamRunSpec.overrides,
      slots: buildTeamSlotSpecs(explicitTeamSize, parsed.teamRunSpec.overrides)
    }
  }
}

export function parseHarnessTeamInvocation(positionals: string[]): ParsedHarnessTeamInvocation {
  if (positionals.length === 0) {
    throw new Error('`/harness-team` 需要提供 goal，格式: /harness-team [team-size --] [slotId:key=value ...] "goal" 或 /harness-team --team-size N "goal"')
  }

  let cursor = 0
  let explicitTeamSize: number | null = null
  if (positionals[cursor] === '--') {
    cursor += 1
  } else if (shouldTreatFirstTokenAsExplicitTeamSize(positionals)) {
    explicitTeamSize = Number(positionals[0])
    cursor += 1
    if (positionals[cursor] === '--') {
      cursor += 1
    }
  }

  const overrides: TeamSlotOverride[] = []
  while (cursor < positionals.length) {
    const override = parseTeamSlotOverrideToken(positionals[cursor]!)
    if (!override) {
      break
    }
    overrides.push(override)
    cursor += 1
  }

  const goal = positionals.slice(cursor).join(' ').trim()
  if (!goal) {
    throw new Error('`/harness-team` 需要提供 goal，格式: /harness-team [team-size --] [slotId:key=value ...] "goal" 或 /harness-team --team-size N "goal"')
  }

  const maxSlotId = overrides.reduce((currentMax, override) => Math.max(currentMax, override.slotId), 0)
  const teamSize = explicitTeamSize ?? Math.max(TEAM_RUN_DEFAULT_SIZE, maxSlotId)
  validateTeamSize(teamSize)

  return {
    goal,
    teamRunSpec: {
      teamSize,
      overrides,
      slots: buildTeamSlotSpecs(teamSize, overrides)
    }
  }
}

function normalizeTargetContent(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.length > MAX_TARGET_FILE_CHARS ? `${trimmed.slice(0, MAX_TARGET_FILE_CHARS)}\n...[truncated]` : trimmed
}

function readTargetFileAtPath(resolvedPath: string): GoalTargetFile {
  const raw = readFileSync(resolvedPath, 'utf8').trim()

  return {
    path: resolvedPath,
    content: normalizeTargetContent(raw)
  }
}

function readTargetFile(targetPath: string): GoalTargetFile {
  return readTargetFileAtPath(resolveHarnessInputPath(targetPath, { cwd: process.cwd(), repoRoot }))
}

function splitFlagValues(rawValue: string): string[] {
  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function readTargetFiles(targetValue: string): GoalTargetFile[] {
  return splitFlagValues(targetValue).map((targetPath) => readTargetFile(targetPath))
}

function shouldIgnoreDirectoryEntry(name: string, isDirectory: boolean): boolean {
  return isDirectory && IGNORED_TARGET_DIRECTORIES.has(name)
}

function isSupportedTargetFile(filePath: string): boolean {
  return TARGET_TEXT_FILE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function collectDirectoryFiles(directoryPath: string): string[] {
  const entries = readdirSync(directoryPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))

  return entries.flatMap((entry) => {
    if (shouldIgnoreDirectoryEntry(entry.name, entry.isDirectory())) {
      return []
    }

    const resolvedPath = resolve(directoryPath, entry.name)

    if (entry.isDirectory()) {
      return collectDirectoryFiles(resolvedPath)
    }

    if (entry.isFile()) {
      if (!isSupportedTargetFile(resolvedPath)) {
        return []
      }

      return [resolvedPath]
    }

    return []
  })
}

function readTargetDirectories(dirValue: string): GoalTargetFile[] {
  return splitFlagValues(dirValue)
    .flatMap((directoryPath) => collectDirectoryFiles(resolveHarnessInputPath(directoryPath, { cwd: process.cwd(), repoRoot })))
    .map((filePath) => readTargetFileAtPath(filePath))
}

function mergeTargetFiles(...groups: GoalTargetFile[][]): GoalTargetFile[] {
  const deduped = new Map<string, GoalTargetFile>()

  for (const group of groups) {
    for (const targetFile of group) {
      if (!deduped.has(targetFile.path)) {
        deduped.set(targetFile.path, targetFile)
      }
    }
  }

  return Array.from(deduped.values())
}

function writeRunBootstrap(runDirectory: string): void {
  const queuePath = getQueuePath(runDirectory)
  process.stderr.write(`[harness] runDirectory: ${runDirectory}\n`)
  process.stderr.write(`[harness] queuePath: ${queuePath}\n`)
  process.stderr.write(`[harness] watch: pnpm --dir "${appRoot}" watch --runDirectory "${runDirectory}"\n`)
}

function formatRunSummary(params: {
  goal: string
  verification: { ok: boolean; checks: string[] }
  persisted: {
    runDirectory?: string
    reportPath?: string
    taskStorePath?: string
    queuePath?: string
  }
  summary?: {
    completedTaskCount?: number
    failedTaskCount?: number
    blockedTaskCount?: number
    retryTaskCount?: number
    generatedTaskCount?: number
    loopCount?: number
  }
}): string {
  const { goal, verification, persisted, summary } = params
  const lines = [
    `Goal: ${goal}`,
    `Status: ${verification.ok ? 'COMPLETED' : 'FAILED'}`,
    `Tasks: completed=${summary?.completedTaskCount ?? 0}, failed=${summary?.failedTaskCount ?? 0}, blocked=${summary?.blockedTaskCount ?? 0}, retried=${summary?.retryTaskCount ?? 0}`,
    `Summary: generated=${summary?.generatedTaskCount ?? 0}, loops=${summary?.loopCount ?? 0}`
  ]

  if (verification.checks.length > 0) {
    lines.push(`Checks: ${verification.checks.join(' | ')}`)
  }

  if (persisted.runDirectory) {
    lines.push(`Run Directory: ${persisted.runDirectory}`)
  }
  if (persisted.reportPath) {
    lines.push(`Report Path: ${persisted.reportPath}`)
  }
  if (persisted.taskStorePath) {
    lines.push(`Task Store: ${persisted.taskStorePath}`)
  }
  if (persisted.queuePath) {
    lines.push(`Queue Path: ${persisted.queuePath}`)
  }

  return `${lines.join('\n')}\n`
}

function buildRunFailureDetail(runDirectory: string): string | null {
  if (!queueExists(runDirectory)) {
    return null
  }

  try {
    const queue = loadTaskQueue(runDirectory)
    const runtime = queue.getRuntimeSnapshot()
    const failedTask = runtime.taskStates.find((taskState) => taskState.status === 'failed')
    if (failedTask) {
      return [
        `首个失败任务: ${failedTask.taskId}`,
        `错误摘要: ${failedTask.lastError ?? 'unknown error'}`,
        `任务状态文件: ${getTaskRecordPath(runDirectory, failedTask.taskId)}`,
        `队列状态文件: ${getQueuePath(runDirectory)}`
      ].join('\n')
    }

    const blockedTask = runtime.taskStates.find((taskState) => taskState.status === 'blocked')
    if (blockedTask) {
      return [
        `阻塞任务: ${blockedTask.taskId}`,
        `阻塞原因: 上游任务失败，当前任务无法继续执行`,
        `任务状态文件: ${getTaskRecordPath(runDirectory, blockedTask.taskId)}`,
        `队列状态文件: ${getQueuePath(runDirectory)}`
      ].join('\n')
    }

    return `队列状态文件: ${getQueuePath(runDirectory)}`
  } catch {
    return `队列状态文件: ${getQueuePath(runDirectory)}`
  }
}

function createAdapter(params: {
  adapterKind: string
  timeoutMs: number
  allowedTools: string[]
  yolo: boolean
  promptTemplates: ReturnType<typeof loadRolePromptTemplates>
  skillRegistry: ReturnType<typeof buildSkillRegistry>
}): AutoFallbackCocoAdapter | CocoCliAdapter | DryRunCocoAdapter {
  const { adapterKind, timeoutMs, allowedTools, yolo, promptTemplates, skillRegistry } = params

  if (adapterKind === 'coco-cli') {
    return new CocoCliAdapter({ timeoutMs, allowedTools, yolo, promptTemplates, skillRegistry })
  }

  if (adapterKind === 'coco-pty') {
    return new CocoCliAdapter({ mode: 'pty', timeoutMs, allowedTools, yolo, promptTemplates, skillRegistry })
  }

  if (adapterKind === 'coco-auto') {
    return new AutoFallbackCocoAdapter({ timeoutMs, allowedTools, yolo, promptTemplates, skillRegistry })
  }

  if (adapterKind === 'dry-run') {
    return new DryRunCocoAdapter()
  }

  throw new Error(`adapter 非法: ${adapterKind}（可选: coco-auto, coco-cli, coco-pty, dry-run）`)
}

function resolveSkillRoot(skillName: string): string {
  const skillRoot = resolve(skillsRoot, skillName)
  const relativeSkillRoot = relative(skillsRoot, skillRoot)

  if (relativeSkillRoot === '' || (!isAbsolute(relativeSkillRoot) && !/^\.\.(?:[\\/]|$)/.test(relativeSkillRoot))) {
    return skillRoot
  }

  throw new Error(`skill 名称超出 skills 目录: ${skillName}`)
}

function resolveSkillInstallRoot(): string {
  const homeDirectory = process.env.HOME ?? process.env.USERPROFILE

  if (!homeDirectory) {
    throw new Error('无法解析用户目录，请设置 HOME 或 USERPROFILE')
  }

  return resolve(homeDirectory, '.coco', 'skills')
}

function shouldRespawnSkillCommandWithPreservedSymlinks(): boolean {
  return process.env.HARNESS_SKILL_PRESERVE_SYMLINKS !== 'true' && !process.execArgv.includes('--preserve-symlinks')
}

function buildSkillRespawnArgv(rawArgs: string[]): string[] {
  const entrypoint = process.argv[1]

  if (!entrypoint) {
    throw new Error('无法解析当前 CLI 入口，无法重新启动 skill 命令')
  }

  const execArgv = process.execArgv.filter((arg) => arg !== '--preserve-symlinks')
  const scriptArgs = ['skill', ...rawArgs]

  if (['.ts', '.tsx', '.mts', '.cts'].includes(extname(entrypoint))) {
    if (execArgv.length > 0) {
      return ['--preserve-symlinks', ...execArgv, entrypoint, ...scriptArgs]
    }

    const tsxCliPath = resolve(appRoot, 'node_modules/tsx/dist/cli.mjs')
    if (!existsSync(tsxCliPath)) {
      throw new Error(`skill 命令需要 tsx CLI 入口，请确认依赖已安装: ${tsxCliPath}`)
    }

    return ['--preserve-symlinks', tsxCliPath, entrypoint, ...scriptArgs]
  }

  return ['--preserve-symlinks', ...execArgv, entrypoint, ...scriptArgs]
}

function respawnSkillCommand(rawArgs: string[]): void {
  const result = spawnSync(process.execPath, buildSkillRespawnArgv(rawArgs), {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      HARNESS_SKILL_PRESERVE_SYMLINKS: 'true',
    },
  })

  if (result.error) {
    throw result.error
  }

  process.exitCode = result.status ?? 1
}

async function loadSkillDevkit() {
  return import(pathToFileURL(resolve(appRoot, 'node_modules/@luobata/skill-devkit/dist/index.js')).href)
}

function formatSkillStatusResult(result: ResolveSkillStatusResult): string {
  const lines = [
    `Skill: ${result.manifest.cocoInstallName}`,
    `Version: ${result.manifest.version}`,
    `Status: ${result.status}`,
    `Health: ${result.health}`,
    `Install Path: ${result.installPath}`,
    `State Path: ${result.statePath}`,
  ]

  if (result.issues.length > 0) {
    lines.push(`Issues: ${result.issues.map((issue) => issue.message).join(' | ')}`)
  }

  return `${lines.join('\n')}\n`
}

function formatDoctorSkillResult(result: DoctorSkillResult, fixRequested: boolean): string {
  const lines = [
    `Skill: ${result.manifest.cocoInstallName}`,
    `Status: ${result.status}`,
    `Health: ${result.health}`,
    `Summary: ${result.summary}`,
    `Install Path: ${result.installPath}`,
    `State Path: ${result.statePath}`,
  ]

  if (result.issues.length > 0) {
    lines.push(`Issues: ${result.issues.map((issue) => issue.message).join(' | ')}`)
  }

  if (fixRequested) {
    lines.push('Fix Requested: true (current devkit doctor is read-only)')
  }

  return `${lines.join('\n')}\n`
}

export async function main(): Promise<void> {
  const [, , rawCommand = 'plan', ...rawArgs] = process.argv
  const { flags: parsedFlags, positionals } = parseFlags(rawArgs, { preserveSeparator: rawCommand === '/harness-team' })
  const slashCommandRegistry = loadSlashCommandRegistry(slashCommandConfigPath)
  const slashResolution = resolveSlashCommand(rawCommand, parsedFlags, slashCommandRegistry)
  const command = slashResolution?.command ?? rawCommand
  const normalizedInvocation = normalizeCommandInvocation(command, slashResolution?.flags ?? parsedFlags, positionals)
  const flags = normalizedInvocation.flags

  if (command === 'watch') {
    const { runWatchTui } = await import('../tui/watch.js')
    await runWatchTui({
      stateRoot,
      runDirectory: flags.get('runDirectory'),
      reportPath: flags.get('reportPath')
    })
    return
  }

  if (command === 'skill') {
    parseSkillCommand(rawArgs)

    if (shouldRespawnSkillCommandWithPreservedSymlinks()) {
      respawnSkillCommand(rawArgs)
      return
    }

    const skillDevkit = await loadSkillDevkit()
    const installRoot = resolveSkillInstallRoot()

    await dispatchSkillCommand(rawArgs, {
      validate({ skillName }) {
        const skillRoot = resolveSkillRoot(skillName)
        const manifest = skillDevkit.loadSkillManifest(skillRoot)

        process.stdout.write(`Validated skill: ${manifest.cocoInstallName}@${manifest.version}\nSkill Root: ${skillRoot}\n`)
      },
      pack({ skillName }) {
        const skillRoot = resolveSkillRoot(skillName)
        const result = skillDevkit.packSkill({
          skillRoot,
          packRoot: skillPacksRoot,
        })

        process.stdout.write(
          `Packed skill: ${result.manifest.cocoInstallName}@${result.manifest.version}\nOutput Directory: ${result.outputDirectory}\nMetadata Path: ${result.metadataPath}\n`,
        )
      },
      link({ skillName }) {
        const skillRoot = resolveSkillRoot(skillName)
        const result = skillDevkit.linkSkill({
          skillRoot,
          installRoot,
          stateRoot: skillStateRoot,
        })

        process.stdout.write(
          `Linked skill: ${result.manifest.cocoInstallName}@${result.manifest.version}\nInstall Path: ${result.installPath}\nState Path: ${result.statePath}\n`,
        )
      },
      unlink({ skillName }) {
        const skillRoot = resolveSkillRoot(skillName)
        const result = skillDevkit.removeLinkedSkill({
          skillRoot,
          installRoot,
          stateRoot: skillStateRoot,
        })

        process.stdout.write(
          result.removed
            ? `Unlinked skill: ${result.manifest.cocoInstallName}@${result.manifest.version}\nInstall Path: ${result.installPath}\nState Path: ${result.statePath}\n`
            : `Unlink skipped: ${result.reason}\nInstall Path: ${result.installPath}\nState Path: ${result.statePath}\n`,
        )
      },
      publishLocal({ skillName }) {
        const skillRoot = resolveSkillRoot(skillName)
        const result = skillDevkit.publishLocalSkill({
          skillRoot,
          packRoot: skillPacksRoot,
          installRoot,
          stateRoot: skillStateRoot,
        })

        process.stdout.write(
          `Published local skill: ${result.manifest.cocoInstallName}@${result.manifest.version}\nInstall Path: ${result.installPath}\nState Path: ${result.statePath}\nPack Directory: ${result.packResult.outputDirectory}\n`,
        )
      },
      status({ skillName }) {
        const skillRoot = resolveSkillRoot(skillName)
        const result = skillDevkit.resolveSkillStatus({
          skillRoot,
          installRoot,
          stateRoot: skillStateRoot,
        })

        process.stdout.write(formatSkillStatusResult(result))
      },
      doctor({ skillName, fix }) {
        const skillRoot = resolveSkillRoot(skillName)

        if (fix) {
          process.stderr.write('[harness] doctor --fix 当前仅执行只读检查，尚未调用自动修复\n')
        }

        const result = skillDevkit.doctorSkill({
          skillRoot,
          installRoot,
          stateRoot: skillStateRoot,
        })

        process.stdout.write(formatDoctorSkillResult(result, fix))
      },
    })
    return
  }

  const isTeamRunDsl = slashResolution?.dsl === TEAM_RUN_DSL_NAME || rawCommand === '/harness-team'
  const baseParsedHarnessTeam = isTeamRunDsl ? parseHarnessTeamInvocation(normalizedInvocation.positionals) : null
  const explicitTeamSizeFlag = flags.get('teamSize')
  if (explicitTeamSizeFlag && (!Number.isInteger(Number(explicitTeamSizeFlag)) || Number(explicitTeamSizeFlag) <= 0)) {
    throw new Error(`team-size 非法: ${explicitTeamSizeFlag}`)
  }
  const parsedHarnessTeam = baseParsedHarnessTeam && explicitTeamSizeFlag
    ? applyExplicitTeamSize(baseParsedHarnessTeam, Number(explicitTeamSizeFlag))
    : baseParsedHarnessTeam
  const goal = parsedHarnessTeam?.goal ?? normalizedInvocation.positionals.join(' ').trim()

  if (parsedHarnessTeam && parsedHarnessTeam.teamRunSpec.overrides.length > 0) {
    process.stderr.write(
      '[harness] slot overrides 已接入 teamRunSpec，并会在 worker slot 与执行目标解析中生效\n'
    )
  }
  const targetFlag = flags.get('target')
  const dirFlag = flags.get('dir')
  const targetFiles = mergeTargetFiles(targetFlag ? readTargetFiles(targetFlag) : [], dirFlag ? readTargetDirectories(dirFlag) : [])
  const effectiveGoal =
    goal ||
    (targetFiles.length === 1
      ? `基于目标文件 ${targetFiles[0]!.path} 执行`
      : targetFiles.length > 1
        ? `基于 ${targetFiles.length} 个目标文件执行`
        : '')

  if (!effectiveGoal && command !== 'resume') {
    throw new Error('请提供目标，或通过 -target todo.md / -target=a.md,b.md / -dir docs 指定目标输入')
  }

  const roles = loadRoles(rolesConfigPath)
  const roleRegistry = buildRoleRegistry(roles)
  const modelConfig = loadRoleModelConfig(roleModelConfigPath)
  const promptTemplates = loadRolePromptTemplates(rolePromptConfigPath)
  const failurePolicyConfig = loadFailurePolicyConfig(failurePolicyConfigPath)
  const skillRegistry = buildSkillRegistry(loadSkills(skillsConfigPath))
  const teamCompositionRegistry = loadTeamCompositionRegistry(teamCompositionConfigPath)
  const adapterKind = flags.get('adapter') ?? 'dry-run'
  const timeoutMs = Number(flags.get('timeoutMs') ?? '120000')
  const teamName = flags.get('teamName') ?? 'default'
  const compositionName = flags.get('composition')
  const maxConcurrencyFlag = flags.get('maxConcurrency')
  const allowedTools = (flags.get('allowedTools') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`timeoutMs 非法: ${flags.get('timeoutMs')}`)
  }

  if (maxConcurrencyFlag && (!Number.isInteger(Number(maxConcurrencyFlag)) || Number(maxConcurrencyFlag) <= 0)) {
    throw new Error(`maxConcurrency 非法: ${maxConcurrencyFlag}`)
  }

  const maxConcurrency = maxConcurrencyFlag ? Number(maxConcurrencyFlag) : parsedHarnessTeam?.teamRunSpec.teamSize

  if (command === 'plan') {
    const plan = applyFailurePolicies(
      buildPlan({ goal: effectiveGoal, teamName, compositionName, teamRunSpec: parsedHarnessTeam?.teamRunSpec, targetFiles }, teamCompositionRegistry),
      failurePolicyConfig
    )
    const assignments = dispatchPlan(plan, roleRegistry, modelConfig, teamName)
    const { buildExecutionBatches } = await import('../runtime/scheduler.js')
    const batches = buildExecutionBatches(assignments)
    const verification = verifyAssignments(assignments)
    const persistedPlanPath = persistPlan(stateRoot, plan)
    process.stdout.write(JSON.stringify({ plan, assignments, batches, verification, persistedPlanPath }, null, 2))
    return
  }

  if (command === 'run') {
    const runDirectory = createRunDirectory(stateRoot, effectiveGoal)
    const attach = flags.get('attach') === 'true'
    writeRunBootstrap(runDirectory)
    const adapter = createAdapter({
      adapterKind,
      timeoutMs,
      allowedTools,
      yolo: flags.get('yolo') === 'true',
      promptTemplates,
      skillRegistry
    })
    const session = createRunSession({
      workspaceRoot: repoRoot,
      stateRoot,
      runDirectory,
      input: { goal: effectiveGoal, teamName, compositionName, teamRunSpec: parsedHarnessTeam?.teamRunSpec, targetFiles },
      adapter,
      roleRegistry,
      modelConfig,
      failurePolicyConfig,
      teamCompositionRegistry,
      maxConcurrency: maxConcurrency ?? 2
    })

    try {
      if (attach) {
        if ((!process.stdin.isTTY || !process.stdout.isTTY) && !process.env.HARNESS_WATCH_CAPTURE_PATH) {
          const report = await session.startAndWait()
          const verification = verifyRun(report)
          const persisted = persistRunReport(stateRoot, report, session.runDirectory)
          process.stdout.write(
            formatRunSummary({
              goal: report.goal,
              verification,
              persisted,
              summary: report.summary
            })
          )
          return
        }

        const { runWatchTui } = await import('../tui/watch.js')
        await session.start()
        await runWatchTui({
          stateRoot,
          runDirectory: session.runDirectory,
          attachSession: session
        })
        await session.waitForCompletion()
        if (session.getStatus() === 'failed') {
          throw session.getError() ?? new Error('run attach 失败')
        }
        return
      }

      const report = await session.startAndWait()
      const verification = verifyRun(report)
      const persisted = persistRunReport(stateRoot, report, session.runDirectory)
      process.stdout.write(
        formatRunSummary({
          goal: report.goal,
          verification,
          persisted,
          summary: report.summary
        })
      )
      return
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failureDetail = buildRunFailureDetail(runDirectory)
      throw new Error(failureDetail ? `${message}\n${failureDetail}` : message)
    }
  }

  if (command === 'resume') {
    const latestRun = loadLatestRunPointer(stateRoot)
    const reportPath = flags.get('reportPath') ?? latestRun?.reportPath
    const runDirectory = flags.get('runDirectory') ?? latestRun?.runDirectory

    if (!runDirectory && !reportPath) {
      throw new Error('未找到可恢复的运行，请先执行 run，或通过 --runDirectory/--reportPath 指定恢复目标')
    }

    const adapter = createAdapter({
      adapterKind,
      timeoutMs,
      allowedTools,
      yolo: flags.get('yolo') === 'true',
      promptTemplates,
      skillRegistry
    })
    const report = await resumeRun({
      adapter,
      workspaceRoot: repoRoot,
      runDirectory,
      reportPath,
      workerPool: maxConcurrency ? { maxConcurrency } : undefined
    })
    const verification = verifyRun(report)
    const persisted = persistRunReport(stateRoot, report, runDirectory ?? latestRun?.runDirectory)
    process.stdout.write(
      JSON.stringify(
        { adapter: adapterKind, resumedFrom: runDirectory ?? reportPath, report, verification, persisted },
        null,
        2
      )
    )
    return
  }

  throw new Error(`未知命令: ${command}`)
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false

if (isDirectExecution) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
