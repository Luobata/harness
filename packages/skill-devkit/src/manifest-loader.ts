import { readFileSync } from 'node:fs'

import { SkillManifestSchema, type SkillManifest } from '@luobata/skill-contracts'

import { getSkillManifestPath } from './paths.js'

export function loadSkillManifest(skillRoot: string): SkillManifest {
  const manifestPath = getSkillManifestPath(skillRoot)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown

  return SkillManifestSchema.parse(manifest)
}
