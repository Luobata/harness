import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { LocalInstallRecordSchema, type LocalInstallRecord } from '@luobata/skill-contracts'

const ensureParentDirectory = (filePath: string) => {
  mkdirSync(path.dirname(filePath), { recursive: true })
}

const atomicWriteJson = (filePath: string, value: unknown) => {
  ensureParentDirectory(filePath)
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`

  writeFileSync(tempPath, JSON.stringify(value, null, 2))
  renameSync(tempPath, filePath)
}

export function readLocalInstallRecord(statePath: string): LocalInstallRecord | null {
  if (!existsSync(statePath)) {
    return null
  }

  const record = JSON.parse(readFileSync(statePath, 'utf8')) as unknown

  return LocalInstallRecordSchema.parse(record)
}

export function writeLocalInstallRecord(
  statePath: string,
  record: LocalInstallRecord,
): LocalInstallRecord {
  const parsedRecord = LocalInstallRecordSchema.parse(record)

  atomicWriteJson(statePath, parsedRecord)

  return parsedRecord
}
