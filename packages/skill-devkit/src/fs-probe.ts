import { existsSync } from 'node:fs'

import type { LocalInstallRecord } from '@luobata/skill-contracts'

import { getLocalInstallStatePath } from './paths.js'
import { readLocalInstallRecord } from './state-store.js'

export type LocalInstallProbeResult =
  | {
      status: 'absent'
      statePath: string
      record: null
    }
  | {
      status: 'linked'
      statePath: string
      targetPath: string
      record: Extract<LocalInstallRecord, { mode: 'linked' }>
    }
  | {
      status: 'published-local'
      statePath: string
      targetPath: string
      record: Extract<LocalInstallRecord, { mode: 'published-local' }>
    }
  | {
      status: 'broken'
      statePath: string
      record: LocalInstallRecord | null
      reason: 'invalid-record' | 'missing-target'
      missingPath?: string
    }

export function probeLocalInstall(
  stateRoot: string,
  cocoInstallName: string,
): LocalInstallProbeResult {
  const statePath = getLocalInstallStatePath(stateRoot, cocoInstallName)

  let record: LocalInstallRecord | null

  try {
    record = readLocalInstallRecord(statePath)
  } catch {
    return {
      status: 'broken',
      statePath,
      record: null,
      reason: 'invalid-record',
    }
  }

  if (!record) {
    return {
      status: 'absent',
      statePath,
      record: null,
    }
  }

  const targetPath = record.mode === 'linked' ? record.sourcePath : record.packPath

  if (!existsSync(targetPath)) {
    return {
      status: 'broken',
      statePath,
      record,
      reason: 'missing-target',
      missingPath: targetPath,
    }
  }

  if (record.mode === 'linked') {
    return {
      status: 'linked',
      statePath,
      targetPath,
      record,
    }
  }

  return {
    status: 'published-local',
    statePath,
    targetPath,
    record,
  }
}
