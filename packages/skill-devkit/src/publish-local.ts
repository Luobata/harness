import { cpSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'

import type { LocalInstallRecord, SkillManifest } from '@luobata/skill-contracts'

import { loadSkillManifest } from './manifest-loader.js'
import { type PackSkillResult, packSkill } from './pack.js'
import { getLocalInstallStatePath, getLocalInstallTargetPath } from './paths.js'
import { writeLocalInstallRecord } from './state-store.js'
import { assertSafeInstallReplacement } from './status.js'

export interface PublishLocalSkillOptions {
  skillRoot: string
  packRoot: string
  installRoot: string
  stateRoot: string
}

export interface PublishLocalSkillResult {
  manifest: SkillManifest
  installPath: string
  statePath: string
  record: Extract<LocalInstallRecord, { mode: 'published-local' }>
  packResult: PackSkillResult
}

const assertPublishLocalEnabled = (manifest: SkillManifest) => {
  if (!manifest.dev.publishLocal) {
    throw new Error(`manifest.dev.publishLocal is disabled for ${manifest.cocoInstallName}`)
  }
}

export function publishLocalSkill(options: PublishLocalSkillOptions): PublishLocalSkillResult {
  const manifest = loadSkillManifest(options.skillRoot)

  assertPublishLocalEnabled(manifest)

  const existingInstall = assertSafeInstallReplacement(options)

  const packResult = packSkill({
    skillRoot: options.skillRoot,
    packRoot: options.packRoot,
  })
  const installPath = getLocalInstallTargetPath(options.installRoot, manifest.cocoInstallName)
  const statePath = getLocalInstallStatePath(options.stateRoot, manifest.cocoInstallName)

  mkdirSync(options.installRoot, { recursive: true })

  const backupPath =
    existingInstall.installed.kind === 'absent'
      ? null
      : path.resolve(
          options.installRoot,
          `${path.basename(installPath)}.backup-${process.pid}-${Date.now()}`,
        )

  if (backupPath) {
    renameSync(installPath, backupPath)
  }

  try {
    cpSync(packResult.outputDirectory, installPath, { recursive: true })

    const recordInput: Extract<LocalInstallRecord, { mode: 'published-local' }> = {
      name: manifest.name,
      cocoInstallName: manifest.cocoInstallName,
      version: manifest.version,
      mode: 'published-local',
      installedAt: new Date().toISOString(),
      packPath: installPath,
      integrity: packResult.metadata.integrity,
    }
    const record = writeLocalInstallRecord(statePath, recordInput) as Extract<
      LocalInstallRecord,
      { mode: 'published-local' }
    >

    if (backupPath) {
      rmSync(backupPath, { recursive: true, force: true })
    }

    return {
      manifest,
      installPath,
      statePath,
      record,
      packResult,
    }
  } catch (error) {
    rmSync(installPath, { recursive: true, force: true })

    if (backupPath) {
      renameSync(backupPath, installPath)
    }

    throw error
  }
}
