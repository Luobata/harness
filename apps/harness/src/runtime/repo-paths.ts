import { existsSync } from 'node:fs'
import { dirname, isAbsolute, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type HarnessRepoPaths = {
  appRoot: string
  repoRoot: string
  configRoot: string
  skillsRoot: string
  skillPacksRoot: string
  stateRoot: string
  skillStateRoot: string
}

function isHarnessAppRoot(candidatePath: string): boolean {
  return existsSync(resolve(candidatePath, 'package.json')) && existsSync(resolve(candidatePath, 'configs'))
}

function resolveRootOverride(envVarName: 'HARNESS_SKILL_PACKS_ROOT' | 'HARNESS_STATE_ROOT', fallbackPath: string): string {
  const rawOverride = process.env[envVarName]?.trim()
  if (!rawOverride) {
    return fallbackPath
  }

  if (!isAbsolute(rawOverride)) {
    throw new Error(`${envVarName} must be an absolute path: ${rawOverride}`)
  }

  return rawOverride
}

export function createHarnessRepoPaths(moduleUrl: string): HarnessRepoPaths {
  const moduleFilePath = fileURLToPath(moduleUrl)
  let currentDirectory = dirname(moduleFilePath)
  const { root } = parse(currentDirectory)

  while (true) {
    if (isHarnessAppRoot(currentDirectory)) {
      const appRoot = currentDirectory
      const repoRoot = resolve(appRoot, '..', '..')
      const stateRoot = resolveRootOverride('HARNESS_STATE_ROOT', resolve(repoRoot, '.harness', 'state'))

      return {
        appRoot,
        repoRoot,
        configRoot: resolve(appRoot, 'configs'),
        skillsRoot: resolve(repoRoot, 'skills'),
        skillPacksRoot: resolveRootOverride('HARNESS_SKILL_PACKS_ROOT', resolve(repoRoot, '.harness', 'skill-packs')),
        stateRoot,
        skillStateRoot: resolve(stateRoot, 'skills')
      }
    }

    if (currentDirectory === root) {
      throw new Error(`Unable to resolve harness app root from ${moduleFilePath}`)
    }

    currentDirectory = dirname(currentDirectory)
  }
}

const { appRoot, repoRoot, configRoot, skillsRoot, skillPacksRoot, stateRoot, skillStateRoot } =
  createHarnessRepoPaths(import.meta.url)

export function getHarnessRepoPaths(): HarnessRepoPaths {
  return {
    appRoot,
    repoRoot,
    configRoot,
    skillsRoot,
    skillPacksRoot,
    stateRoot,
    skillStateRoot
  }
}

export function resolveHarnessConfigPath(...segments: string[]): string {
  return resolve(configRoot, ...segments)
}

export function resolveHarnessInputPath(
  inputPath: string,
  options: {
    cwd?: string
    repoRoot?: string
  } = {}
): string {
  if (isAbsolute(inputPath)) {
    return inputPath
  }

  const effectiveCwd = options.cwd ?? process.cwd()
  const effectiveRepoRoot = options.repoRoot ?? repoRoot
  const cwdResolvedPath = resolve(effectiveCwd, inputPath)
  if (existsSync(cwdResolvedPath)) {
    return cwdResolvedPath
  }

  return resolve(effectiveRepoRoot, inputPath)
}
