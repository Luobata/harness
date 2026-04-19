import type { SkillManifest } from '@luobata/skill-contracts'

import {
  resolveSkillStatus,
  type ResolveSkillStatusOptions,
  type SkillHealth,
  type SkillStatus,
  type SkillStatusIssue,
} from './status.js'

export interface DoctorSkillResult {
  ok: boolean
  manifest: SkillManifest
  status: SkillStatus
  health: SkillHealth
  installPath: string
  statePath: string
  issues: SkillStatusIssue[]
  summary: string
}

export function doctorSkill(options: ResolveSkillStatusOptions): DoctorSkillResult {
  const resolvedStatus = resolveSkillStatus(options)

  return {
    ok: resolvedStatus.health === 'ok',
    manifest: resolvedStatus.manifest,
    status: resolvedStatus.status,
    health: resolvedStatus.health,
    installPath: resolvedStatus.installPath,
    statePath: resolvedStatus.statePath,
    issues: resolvedStatus.issues,
    summary:
      resolvedStatus.issues.length === 0
        ? `${resolvedStatus.manifest.cocoInstallName} is healthy`
        : `${resolvedStatus.manifest.cocoInstallName} has ${resolvedStatus.issues.length} issue(s)`,
  }
}
