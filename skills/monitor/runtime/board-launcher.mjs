import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5173
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_IDENTITY_TIMEOUT_MS = 1_000

const toBoardUrl = (host, port, monitorSessionId) =>
  `http://${host}:${port}/?monitorSessionId=${encodeURIComponent(monitorSessionId)}`

const toBaseUrl = (host, port) => `http://${host}:${port}`

const isValidPort = (value) => Number.isInteger(value) && value > 0 && value <= 65_535

async function readRuntimeState(runtimeStatePath) {
  try {
    const raw = await readFile(runtimeStatePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    if (error instanceof SyntaxError) {
      return null
    }

    throw error
  }
}

async function writeRuntimeState(runtimeStatePath, state) {
  await mkdir(dirname(runtimeStatePath), { recursive: true })

  const tempFilePath = `${runtimeStatePath}.${process.pid}.${Date.now()}.tmp`
  const payload = `${JSON.stringify(state, null, 2)}\n`

  await writeFile(tempFilePath, payload, 'utf8')
  await rename(tempFilePath, runtimeStatePath)
}

async function defaultIsPortReachable({ host, port, timeoutMs = 1_000 }) {
  return await new Promise((resolvePromise) => {
    const socket = net.createConnection({ host, port })

    const finish = (reachable) => {
      socket.removeAllListeners()
      socket.destroy()
      resolvePromise(reachable)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })
}

async function defaultIsMonitorBoard({ host, port, timeoutMs = DEFAULT_IDENTITY_TIMEOUT_MS }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(toBaseUrl(host, port), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    })
    const body = await response.text()
    return /<title>\s*Monitor Board\s*<\/title>/i.test(body) || /\bMonitor Board\b/i.test(body)
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function defaultWaitForPort({ host, port, timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = 150, isPortReachable }) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await isPortReachable({ host, port, timeoutMs: Math.min(intervalMs, 1_000) })) {
      return true
    }

    await delay(intervalMs)
  }

  return false
}

function defaultSpawnProcess({ repoRoot, host, port }) {
  const { command, args } = createMonitorBoardLaunchSpec({ repoRoot, host, port })
  return spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
}

export function createMonitorBoardLaunchSpec({ repoRoot, host, port }) {
  const boardAppRoot = resolve(repoRoot, 'apps', 'monitor-board')

  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['--dir', boardAppRoot, 'exec', 'vite', '--host', host, '--port', String(port)],
  }
}

async function defaultCleanupProcess({ child, pid }) {
  if (Number.isInteger(pid) && pid > 0 && process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGTERM')
      return
    } catch {}
  }

  if (typeof child?.kill === 'function') {
    try {
      child.kill('SIGTERM')
    } catch {}
  }
}

async function checkMonitorBoardIdentity(isMonitorBoard, args) {
  try {
    return await isMonitorBoard(args)
  } catch {
    return false
  }
}

function formatChildExitMessage(code, signal) {
  if (Number.isInteger(code)) {
    return `monitor-board exited before becoming ready (code ${code})`
  }

  if (signal) {
    return `monitor-board exited before becoming ready (signal ${signal})`
  }

  return 'monitor-board exited before becoming ready'
}

async function waitForBoardStartup({ child, host, port, timeoutMs, waitForPort, isMonitorBoard }) {
  let detachChildListeners = () => {}

  const childFailure = new Promise((resolvePromise) => {
    if (!child || typeof child.once !== 'function' || typeof child.removeListener !== 'function') {
      return
    }

    const onError = (error) => resolvePromise({ kind: 'error', error })
    const onExit = (code, signal) => resolvePromise({ kind: 'exit', code, signal })

    child.once('error', onError)
    child.once('exit', onExit)
    detachChildListeners = () => {
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
    }
  })

  try {
    const readiness = await Promise.race([
      Promise.resolve(waitForPort({ host, port, timeoutMs })).then((ready) => (ready ? { kind: 'port-ready' } : { kind: 'timeout' })),
      childFailure,
    ])

    if (readiness.kind !== 'port-ready') {
      return readiness
    }

    const looksLikeMonitorBoard = await checkMonitorBoardIdentity(isMonitorBoard, {
      host,
      port,
      timeoutMs: Math.min(timeoutMs, DEFAULT_IDENTITY_TIMEOUT_MS),
    })

    return looksLikeMonitorBoard ? { kind: 'ready' } : { kind: 'identity-mismatch' }
  } finally {
    detachChildListeners()
  }
}

const toFailureResult = ({ port, message }) => ({
  status: 'failed',
  url: null,
  port,
  pid: null,
  message,
})

export async function ensureMonitorBoardRunning(options, deps = {}) {
  const repoRoot = options?.repoRoot ? resolve(options.repoRoot) : null
  const runtimeStatePath = options?.runtimeStatePath ? resolve(options.runtimeStatePath) : null
  const monitorSessionId = options?.monitorSessionId ?? null
  const host = options?.host ?? DEFAULT_HOST
  const preferredPort = isValidPort(options?.preferredPort) ? options.preferredPort : DEFAULT_PORT
  const timeoutMs = Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS

  if (!repoRoot) {
    return toFailureResult({
      port: preferredPort,
      message: 'monitor-board repo root is unavailable; could not locate apps/monitor-board/package.json',
    })
  }

  if (!runtimeStatePath) {
    return toFailureResult({
      port: preferredPort,
      message: 'monitor-board runtime state path is unavailable; could not persist board runtime state',
    })
  }

  if (!monitorSessionId) {
    return toFailureResult({
      port: preferredPort,
      message: 'monitor session id is required to launch monitor-board',
    })
  }

  const boardPackagePath = resolve(repoRoot, 'apps', 'monitor-board', 'package.json')
  const isPortReachable = deps.isPortReachable ?? defaultIsPortReachable
  const isMonitorBoard = deps.isMonitorBoard ?? defaultIsMonitorBoard
  const waitForPort = deps.waitForPort ?? ((waitOptions) => defaultWaitForPort({ ...waitOptions, isPortReachable }))
  const spawnProcess = deps.spawnProcess ?? defaultSpawnProcess
  const cleanupProcess = deps.cleanupProcess ?? defaultCleanupProcess
  const persistRuntimeState = deps.writeRuntimeState ?? writeRuntimeState

  let runtimeState = await readRuntimeState(runtimeStatePath)

  if (runtimeState?.repoRoot && resolve(runtimeState.repoRoot) !== repoRoot) {
    runtimeState = null
  }

  const recordedPort = isValidPort(runtimeState?.port) ? runtimeState.port : null
  if (recordedPort && (await isPortReachable({ host, port: recordedPort, timeoutMs: DEFAULT_IDENTITY_TIMEOUT_MS }))) {
    const looksLikeMonitorBoard = await checkMonitorBoardIdentity(isMonitorBoard, {
      host,
      port: recordedPort,
      timeoutMs: DEFAULT_IDENTITY_TIMEOUT_MS,
    })

    if (looksLikeMonitorBoard) {
      return {
        status: 'reused',
        url: toBoardUrl(host, recordedPort, monitorSessionId),
        port: recordedPort,
        pid: Number.isInteger(runtimeState?.pid) ? runtimeState.pid : null,
        message: `monitor-board already running on ${host}:${recordedPort}`,
      }
    }
  }

  if (!existsSync(boardPackagePath)) {
    return {
      status: 'failed',
      url: null,
      port: preferredPort,
      pid: null,
      message: 'monitor-board package.json is unavailable; could not launch board runtime',
    }
  }

  let child
  try {
    child = spawnProcess({ repoRoot, host, port: preferredPort })
  } catch (error) {
    return toFailureResult({
      port: preferredPort,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const pid = Number.isInteger(child?.pid) ? child.pid : null
  if (typeof child?.unref === 'function') {
    child.unref()
  }

  let startupResult
  try {
    startupResult = await waitForBoardStartup({
      child,
      host,
      port: preferredPort,
      timeoutMs,
      waitForPort,
      isMonitorBoard,
    })
  } catch (error) {
    await cleanupProcess({ child, pid })
    return toFailureResult({
      port: preferredPort,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  if (startupResult.kind !== 'ready') {
    await cleanupProcess({ child, pid })

    if (startupResult.kind === 'error') {
      const message = startupResult.error instanceof Error ? startupResult.error.message : String(startupResult.error)
      return toFailureResult({
        port: preferredPort,
        message: `monitor-board process failed before becoming ready: ${message}`,
      })
    }

    if (startupResult.kind === 'exit') {
      return toFailureResult({
        port: preferredPort,
        message: formatChildExitMessage(startupResult.code, startupResult.signal),
      })
    }

    if (startupResult.kind === 'identity-mismatch') {
      return toFailureResult({
        port: preferredPort,
        message: `monitor-board became reachable on ${host}:${preferredPort} but did not identify as monitor-board`,
      })
    }

    return toFailureResult({
      port: preferredPort,
      message: `monitor-board failed to start on ${host}:${preferredPort} within ${timeoutMs}ms`,
    })
  }

  const nextState = {
    pid,
    port: preferredPort,
    host,
    url: toBaseUrl(host, preferredPort),
    startedAt: new Date().toISOString(),
    repoRoot,
  }

  try {
    await persistRuntimeState(runtimeStatePath, nextState)
  } catch (error) {
    await cleanupProcess({ child, pid })

    return toFailureResult({
      port: preferredPort,
      message: `monitor-board started on ${host}:${preferredPort} but failed to persist runtime state: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }

  return {
    status: 'started',
    url: toBoardUrl(host, preferredPort, monitorSessionId),
    port: preferredPort,
    pid,
    message: `monitor-board started on ${host}:${preferredPort}`,
  }
}
