import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs'

import type { LocalInstallRecord, SkillManifest } from '@luobata/skill-contracts'

import { loadSkillManifest } from './manifest-loader.js'
import { getLocalInstallStatePath, getLocalInstallTargetPath } from './paths.js'
import { readLocalInstallRecord } from './state-store.js'

export interface RemoveLinkedSkillOptions {
  skillRoot: string
  installRoot: string
  stateRoot: string
}

type RemoveLinkedSkillSkippedReason =
  | 'already-absent'
  | 'not-linked'
  | 'unexpected-install-type'
  | 'unexpected-install-target'

interface RemoveLinkedSkillBaseResult {
  manifest: SkillManifest
  installPath: string
  statePath: string
  record: LocalInstallRecord | null
}

export type RemoveLinkedSkillResult =
  | (RemoveLinkedSkillBaseResult & {
      removed: true
      record: Extract<LocalInstallRecord, { mode: 'linked' }> | null
    })
  | (RemoveLinkedSkillBaseResult & {
      removed: false
      reason: RemoveLinkedSkillSkippedReason
    })

const isOrphanLinkForSkillRoot = (installPath: string, skillRoot: string) => {
  try {
    return lstatSync(installPath).isSymbolicLink() && realpathSync(installPath) === realpathSync(skillRoot)
  } catch {
    return false
  }
}

const isExpectedLinkedInstallTarget = (
  installPath: string,
  requestedSkillRoot: string,
  recordedSourcePath: string,
) => {
  try {
    if (!lstatSync(installPath).isSymbolicLink()) {
      return false
    }

    const resolvedInstallTarget = realpathSync(installPath)

    return (
      resolvedInstallTarget === realpathSync(requestedSkillRoot) &&
      resolvedInstallTarget === realpathSync(recordedSourcePath)
    )
  } catch {
    return false
  }
}

export function removeLinkedSkill(options: RemoveLinkedSkillOptions): RemoveLinkedSkillResult {
  const manifest = loadSkillManifest(options.skillRoot)
  const installPath = getLocalInstallTargetPath(options.installRoot, manifest.cocoInstallName)
  const statePath = getLocalInstallStatePath(options.stateRoot, manifest.cocoInstallName)
  const record = readLocalInstallRecord(statePath)

  if (!record) {
    if (isOrphanLinkForSkillRoot(installPath, options.skillRoot)) {
      rmSync(installPath, { recursive: true, force: true })
      rmSync(statePath, { force: true })

      return {
        removed: true,
        manifest,
        installPath,
        statePath,
        record: null,
      }
    }

    return {
      removed: false,
      reason: 'already-absent',
      manifest,
      installPath,
      statePath,
      record: null,
    }
  }

  if (record.mode !== 'linked') {
    return {
      removed: false,
      reason: 'not-linked',
      manifest,
      installPath,
      statePath,
      record,
    }
  }

  if (existsSync(installPath) && !lstatSync(installPath).isSymbolicLink()) {
    return {
      removed: false,
      reason: 'unexpected-install-type',
      manifest,
      installPath,
      statePath,
      record,
    }
  }

  if (existsSync(installPath) && !isExpectedLinkedInstallTarget(installPath, options.skillRoot, record.sourcePath)) {
    return {
      removed: false,
      reason: 'unexpected-install-target',
      manifest,
      installPath,
      statePath,
      record,
    }
  }

  rmSync(installPath, { recursive: true, force: true })
  rmSync(statePath, { force: true })

  return {
    removed: true,
    manifest,
    installPath,
    statePath,
    record,
  }
}
