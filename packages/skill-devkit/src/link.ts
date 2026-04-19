import { mkdirSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'

import type { LocalInstallRecord, SkillManifest } from '@luobata/skill-contracts'

import { loadSkillManifest } from './manifest-loader.js'
import { getLocalInstallStatePath, getLocalInstallTargetPath } from './paths.js'
import { writeLocalInstallRecord } from './state-store.js'
import { assertSafeInstallReplacement } from './status.js'

export interface LinkSkillOptions {
  skillRoot: string
  installRoot: string
  stateRoot: string
}

export interface LinkSkillResult {
  manifest: SkillManifest
  installPath: string
  statePath: string
  record: Extract<LocalInstallRecord, { mode: 'linked' }>
}

const assertLinkEnabled = (manifest: SkillManifest) => {
  if (!manifest.dev.link) {
    throw new Error(`manifest.dev.link is disabled for ${manifest.cocoInstallName}`)
  }
}

export function linkSkill(options: LinkSkillOptions): LinkSkillResult {
  const manifest = loadSkillManifest(options.skillRoot)

  assertLinkEnabled(manifest)

  const installPath = getLocalInstallTargetPath(options.installRoot, manifest.cocoInstallName)
  const statePath = getLocalInstallStatePath(options.stateRoot, manifest.cocoInstallName)
  const existingInstall = assertSafeInstallReplacement(options)

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
    symlinkSync(options.skillRoot, installPath, 'dir')

    const recordInput: Extract<LocalInstallRecord, { mode: 'linked' }> = {
      name: manifest.name,
      cocoInstallName: manifest.cocoInstallName,
      version: manifest.version,
      mode: 'linked',
      installedAt: new Date().toISOString(),
      sourcePath: options.skillRoot,
    }
    const record = writeLocalInstallRecord(statePath, recordInput) as Extract<
      LocalInstallRecord,
      { mode: 'linked' }
    >

    if (backupPath) {
      rmSync(backupPath, { recursive: true, force: true })
    }

    return {
      manifest,
      installPath,
      statePath,
      record,
    }
  } catch (error) {
    rmSync(installPath, { recursive: true, force: true })

    if (backupPath) {
      renameSync(backupPath, installPath)
    }

    throw error
  }
}
