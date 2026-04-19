import { lstatSync, readlinkSync, realpathSync } from 'node:fs'

import type { LocalInstallRecord, SkillManifest } from '@luobata/skill-contracts'

import { probeLocalInstall, type LocalInstallProbeResult } from './fs-probe.js'
import { loadSkillManifest } from './manifest-loader.js'
import { getLocalInstallStatePath, getLocalInstallTargetPath } from './paths.js'
import { readLocalInstallRecord } from './state-store.js'

export interface ResolveSkillStatusOptions {
  skillRoot: string
  installRoot: string
  stateRoot: string
}

export type SkillHealth = 'ok' | 'error'
export type SkillStatus = 'not-installed' | 'linked' | 'published-local' | 'broken'
export type SkillStatusIssueCode =
  | 'invalid-record'
  | 'missing-recorded-target'
  | 'unexpected-install-without-record'
  | 'missing-install-path'
  | 'unexpected-install-kind'
  | 'symlink-target-mismatch'
  | 'install-path-mismatch'

export interface SkillStatusIssue {
  code: SkillStatusIssueCode
  message: string
}

export type InstalledSkillState =
  | {
      kind: 'absent'
      path: string
      exists: false
    }
  | {
      kind: 'symlink'
      path: string
      exists: true
      linkTarget: string
      resolvedTarget: string | null
    }
  | {
      kind: 'directory'
      path: string
      exists: true
    }
  | {
      kind: 'other'
      path: string
      exists: true
    }

export interface ResolveSkillStatusResult {
  manifest: SkillManifest
  statePath: string
  installPath: string
  recorded: LocalInstallRecord | null
  probe: LocalInstallProbeResult
  installed: InstalledSkillState
  status: SkillStatus
  health: SkillHealth
  issues: SkillStatusIssue[]
}

const readRecordedState = (statePath: string): LocalInstallRecord | null => {
  try {
    return readLocalInstallRecord(statePath)
  } catch {
    return null
  }
}

const inspectInstalledSkill = (installPath: string): InstalledSkillState => {
  try {
    const stat = lstatSync(installPath)

    if (stat.isSymbolicLink()) {
      return {
        kind: 'symlink',
        path: installPath,
        exists: true,
        linkTarget: readlinkSync(installPath),
        resolvedTarget: (() => {
          try {
            return realpathSync(installPath)
          } catch {
            return null
          }
        })(),
      }
    }

    if (stat.isDirectory()) {
      return {
        kind: 'directory',
        path: installPath,
        exists: true,
      }
    }

    return {
      kind: 'other',
      path: installPath,
      exists: true,
    }
  } catch {
    return {
      kind: 'absent',
      path: installPath,
      exists: false,
    }
  }
}

const createIssue = (code: SkillStatusIssueCode, message: string): SkillStatusIssue => ({ code, message })

const formatIssues = (issues: SkillStatusIssue[]) => issues.map((issue) => issue.message).join('; ')

export function resolveSkillStatus(options: ResolveSkillStatusOptions): ResolveSkillStatusResult {
  const manifest = loadSkillManifest(options.skillRoot)
  const statePath = getLocalInstallStatePath(options.stateRoot, manifest.cocoInstallName)
  const installPath = getLocalInstallTargetPath(options.installRoot, manifest.cocoInstallName)
  const recorded = readRecordedState(statePath)
  const probe = probeLocalInstall(options.stateRoot, manifest.cocoInstallName)
  const installed = inspectInstalledSkill(installPath)
  const issues: SkillStatusIssue[] = []

  if (probe.status === 'absent') {
    if (installed.kind !== 'absent') {
      issues.push(
        createIssue(
          'unexpected-install-without-record',
          `Found an installed skill at ${installPath} but no local install record exists for ${manifest.cocoInstallName}`,
        ),
      )
    }
  } else if (probe.status === 'broken') {
    if (probe.reason === 'invalid-record') {
      issues.push(
        createIssue(
          'invalid-record',
          `Local install record at ${statePath} is invalid for ${manifest.cocoInstallName}`,
        ),
      )
    } else {
      issues.push(
        createIssue(
          'missing-recorded-target',
          `Recorded install target ${probe.missingPath} is missing for ${manifest.cocoInstallName}`,
        ),
      )
    }
  } else if (probe.status === 'linked') {
    if (installed.kind === 'absent') {
      issues.push(
        createIssue(
          'missing-install-path',
          `Expected a linked install at ${installPath} for ${manifest.cocoInstallName}`,
        ),
      )
    } else if (installed.kind !== 'symlink') {
      issues.push(
        createIssue(
          'unexpected-install-kind',
          `Expected ${installPath} to be a symlink for ${manifest.cocoInstallName}`,
        ),
      )
    } else {
      const expectedTarget = realpathSync(probe.record.sourcePath)

      if (installed.resolvedTarget !== expectedTarget) {
        issues.push(
          createIssue(
            'symlink-target-mismatch',
            `Linked install at ${installPath} points to ${installed.resolvedTarget ?? installed.linkTarget} instead of ${expectedTarget}`,
          ),
        )
      }
    }
  } else {
    if (probe.record.packPath !== installPath) {
      issues.push(
        createIssue(
          'install-path-mismatch',
          `Published-local record points to ${probe.record.packPath} instead of ${installPath}`,
        ),
      )
    }

    if (installed.kind === 'absent') {
      issues.push(
        createIssue(
          'missing-install-path',
          `Expected a published-local install directory at ${installPath} for ${manifest.cocoInstallName}`,
        ),
      )
    } else if (installed.kind !== 'directory') {
      issues.push(
        createIssue(
          'unexpected-install-kind',
          `Expected ${installPath} to be a directory for ${manifest.cocoInstallName}`,
        ),
      )
    }
  }

  const status: SkillStatus =
    issues.length > 0 ? 'broken' : probe.status === 'absent' ? 'not-installed' : probe.status

  return {
    manifest,
    statePath,
    installPath,
    recorded,
    probe,
    installed,
    status,
    health: issues.length > 0 ? 'error' : 'ok',
    issues,
  }
}

export function assertSafeInstallReplacement(
  options: ResolveSkillStatusOptions,
): ResolveSkillStatusResult {
  const resolved = resolveSkillStatus(options)

  if (resolved.health === 'error') {
    throw new Error(`Refusing to replace install target ${resolved.installPath}: ${formatIssues(resolved.issues)}`)
  }

  if (resolved.status === 'not-installed' || resolved.status === 'published-local') {
    return resolved
  }

  const expectedTarget = realpathSync(options.skillRoot)

  if (resolved.installed.kind === 'symlink' && resolved.installed.resolvedTarget === expectedTarget) {
    return resolved
  }

  throw new Error(
    `Refusing to replace install target ${resolved.installPath}: linked install points to ${resolved.installed.kind === 'symlink' ? resolved.installed.resolvedTarget ?? resolved.installed.linkTarget : 'an unexpected target'} instead of ${expectedTarget}`,
  )
}
