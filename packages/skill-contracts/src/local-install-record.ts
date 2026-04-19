import path from 'node:path'

import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const semverLikeVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*))*))?(?:\+([\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?$/
const integrityPattern = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/
const semverLikeVersionString = nonEmptyString.regex(
  semverLikeVersionPattern,
  'version must be a semver-like string',
)
const integrityString = nonEmptyString.regex(
  integrityPattern,
  'integrity must be a structured integrity string',
)

const isAbsolutePath = (value: string) => {
  const normalized = value.replaceAll('\\', '/')

  return path.posix.isAbsolute(normalized) || path.win32.isAbsolute(value)
}

const absolutePathString = (fieldName: string) =>
  nonEmptyString.refine(isAbsolutePath, `${fieldName} must be an absolute path`)

export const LocalInstallStateSchema = z.enum(['linked', 'published-local'])
export const LocalInstallModeSchema = LocalInstallStateSchema

const BaseLocalInstallRecordSchema = z
  .object({
    name: nonEmptyString,
    cocoInstallName: nonEmptyString,
    version: semverLikeVersionString,
    installedAt: z.string().datetime(),
  })
  .strict()

const LinkedInstallRecordSchema = BaseLocalInstallRecordSchema.extend({
  mode: z.literal('linked'),
  sourcePath: absolutePathString('sourcePath'),
}).strict()

const PublishedLocalInstallRecordSchema = BaseLocalInstallRecordSchema.extend({
  mode: z.literal('published-local'),
  packPath: absolutePathString('packPath'),
  integrity: integrityString.optional(),
}).strict()

export const LocalInstallRecordSchema = z.discriminatedUnion('mode', [
  LinkedInstallRecordSchema,
  PublishedLocalInstallRecordSchema,
])

export type LocalInstallState = z.infer<typeof LocalInstallStateSchema>
export type LocalInstallMode = z.infer<typeof LocalInstallModeSchema>
export type LocalInstallRecord = z.infer<typeof LocalInstallRecordSchema>
