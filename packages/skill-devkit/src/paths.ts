import path from 'node:path'

import type { SkillManifest } from '@luobata/skill-contracts'

export const SKILL_MANIFEST_FILE_NAME = 'skill-manifest.json'
export const PACK_METADATA_FILE_NAME = 'pack-metadata.json'

const normalizeInstallName = (cocoInstallName: string) => encodeURIComponent(cocoInstallName.trim())

export function getSkillManifestPath(skillRoot: string): string {
  return path.resolve(skillRoot, SKILL_MANIFEST_FILE_NAME)
}

export function getPackOutputDirectory(
  packRoot: string,
  manifest: Pick<SkillManifest, 'cocoInstallName' | 'version'>,
): string {
  return path.resolve(packRoot, normalizeInstallName(manifest.cocoInstallName), manifest.version)
}

export function getPackMetadataPath(packOutputDirectory: string): string {
  return path.resolve(packOutputDirectory, PACK_METADATA_FILE_NAME)
}

export function getLocalInstallStatePath(stateRoot: string, cocoInstallName: string): string {
  return path.resolve(stateRoot, `${normalizeInstallName(cocoInstallName)}.json`)
}

export function getLocalInstallTargetPath(installRoot: string, cocoInstallName: string): string {
  return path.resolve(installRoot, normalizeInstallName(cocoInstallName))
}
