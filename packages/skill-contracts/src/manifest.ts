import path from 'node:path'

import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const semverLikeVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*))*))?(?:\+([\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?$/
const semverLikeVersionString = nonEmptyString.regex(
  semverLikeVersionPattern,
  'version must be a semver-like string',
)

const normalizeSkillPath = (value: string) => value.replaceAll('\\', '/')
const globMetacharacterPattern = /[*?\[\]{}]/

const isWindowsDriveRelativePath = (value: string) => /^[A-Za-z]:(?![\\/])/.test(value)

const isAbsolutePath = (value: string) => {
  const normalized = normalizeSkillPath(value)

  return path.posix.isAbsolute(normalized) || path.win32.isAbsolute(value)
}

const hasParentDirectoryTraversal = (value: string) =>
  normalizeSkillPath(value)
    .split('/')
    .some((segment) => segment === '..')

const escapesSkillRoot = (value: string) => {
  if (hasParentDirectoryTraversal(value)) {
    return true
  }

  const normalized = path.posix.normalize(normalizeSkillPath(value))

  return normalized === '..' || normalized.startsWith('../')
}

const isRelativeWithinSkillRoot = (value: string) => {
  if (isAbsolutePath(value)) {
    return false
  }

  if (isWindowsDriveRelativePath(value)) {
    return false
  }

  if (escapesSkillRoot(value)) {
    return false
  }

  const normalized = path.posix.normalize(normalizeSkillPath(value))

  return normalized !== '.' && normalized !== './'
}

const createRelativeSkillPathSchema = (fieldName: string) =>
  nonEmptyString.refine(
    isRelativeWithinSkillRoot,
    `${fieldName} must be a relative path within the skill root`,
  )

const createEntryPathSchema = () =>
  createRelativeSkillPathSchema('entry').refine(
    (value) => !globMetacharacterPattern.test(value),
    'entry must be a relative file path within the skill root and not a glob pattern',
  )

export const SkillManifestSchema = z.object({
  name: nonEmptyString,
  displayName: nonEmptyString,
  entry: createEntryPathSchema(),
  cocoInstallName: nonEmptyString,
  version: semverLikeVersionString,
  files: z.array(createRelativeSkillPathSchema('files')).min(1),
  dev: z
    .object({
      link: z.boolean(),
      publishLocal: z.boolean(),
    })
    .strict(),
  metadata: z
    .object({
      description: nonEmptyString,
      tags: z.array(nonEmptyString),
    })
    .strict(),
}).strict()

export type SkillManifest = z.infer<typeof SkillManifestSchema>
