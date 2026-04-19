import { copyFileSync, globSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

import { PackMetadataSchema, type PackMetadata, type SkillManifest } from '@luobata/skill-contracts'

import { loadSkillManifest } from './manifest-loader.js'
import { getPackMetadataPath, getPackOutputDirectory } from './paths.js'

export interface PackSkillOptions {
  skillRoot: string
  packRoot: string
}

export interface PackSkillResult {
  manifest: SkillManifest
  outputDirectory: string
  metadataPath: string
  metadata: PackMetadata
  copiedFiles: string[]
}

const normalizeRelativePath = (relativePath: string) => relativePath.replaceAll('\\', '/')

const collectManifestFiles = (skillRoot: string, manifest: SkillManifest): string[] => {
  const includedFiles = new Set<string>()

  for (const pattern of manifest.files) {
    for (const match of globSync(normalizeRelativePath(pattern), { cwd: skillRoot })) {
      const sourcePath = path.resolve(skillRoot, match)

      if (statSync(sourcePath).isFile()) {
        includedFiles.add(normalizeRelativePath(match))
      }
    }
  }

  return [...includedFiles].sort()
}

const validatePackContents = (manifest: SkillManifest, copiedFiles: string[]) => {
  if (copiedFiles.length === 0) {
    throw new Error(`manifest.files matched no packable files for ${manifest.cocoInstallName}`)
  }

  const normalizedEntry = normalizeRelativePath(manifest.entry)

  if (!copiedFiles.includes(normalizedEntry)) {
    throw new Error(
      `manifest.entry "${manifest.entry}" was not included in the packed output for ${manifest.cocoInstallName}`,
    )
  }
}

const copyManifestFiles = (skillRoot: string, outputDirectory: string, files: string[]) => {
  let unpackedSize = 0

  for (const relativePath of files) {
    const sourcePath = path.resolve(skillRoot, relativePath)
    const destinationPath = path.resolve(outputDirectory, relativePath)

    mkdirSync(path.dirname(destinationPath), { recursive: true })
    copyFileSync(sourcePath, destinationPath)
    unpackedSize += statSync(sourcePath).size
  }

  return unpackedSize
}

const createPackIntegrity = (skillRoot: string, files: string[]) => {
  const hash = createHash('sha512')

  for (const relativePath of files) {
    hash.update(relativePath)
    hash.update('\u0000')
    hash.update(readFileSync(path.resolve(skillRoot, relativePath)))
    hash.update('\u0000')
  }

  return `sha512-${hash.digest('base64')}`
}

export function packSkill(options: PackSkillOptions): PackSkillResult {
  const manifest = loadSkillManifest(options.skillRoot)
  const outputDirectory = getPackOutputDirectory(options.packRoot, manifest)
  const copiedFiles = collectManifestFiles(options.skillRoot, manifest)

  validatePackContents(manifest, copiedFiles)

  rmSync(outputDirectory, { recursive: true, force: true })
  mkdirSync(outputDirectory, { recursive: true })

  const unpackedSize = copyManifestFiles(options.skillRoot, outputDirectory, copiedFiles)
  const metadata = PackMetadataSchema.parse({
    name: manifest.name,
    cocoInstallName: manifest.cocoInstallName,
    version: manifest.version,
    artifactPath: outputDirectory,
    packedAt: new Date().toISOString(),
    integrity: createPackIntegrity(options.skillRoot, copiedFiles),
    fileCount: copiedFiles.length,
    unpackedSize,
  })
  const metadataPath = getPackMetadataPath(outputDirectory)

  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

  return {
    manifest,
    outputDirectory,
    metadataPath,
    metadata,
    copiedFiles,
  }
}
