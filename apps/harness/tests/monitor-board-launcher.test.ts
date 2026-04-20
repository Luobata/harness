import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const tempRoots: string[] = []

const createTempRoot = (): string => {
  const root = mkdtempSync(resolve(tmpdir(), 'monitor-board-launcher-'))
  tempRoots.push(root)
  return root
}

const loadBoardLauncher = async () => import('../../../skills/monitor/runtime/board-launcher.mjs')

afterEach(() => {
  vi.restoreAllMocks()

  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

class FakeChildProcess extends EventEmitter {
  pid: number | undefined

  constructor(pid?: number) {
    super()
    this.pid = pid
  }

  unref() {}
}

describe('monitor board launcher', () => {
  it('builds a launch command that passes host and port directly to vite', async () => {
    const repoRoot = createTempRoot()
    const mod = await loadBoardLauncher()

    expect(mod.createMonitorBoardLaunchSpec({ repoRoot, host: '127.0.0.1', port: 5173 })).toEqual({
      command: 'pnpm',
      args: ['--dir', resolve(repoRoot, 'apps', 'monitor-board'), 'exec', 'vite', '--host', '127.0.0.1', '--port', '5173'],
    })
  })

  it('starts monitor-board when no state exists and the port is offline', async () => {
    const repoRoot = createTempRoot()
    const runtimeStatePath = resolve(repoRoot, '.harness', 'state', 'monitor-board', 'runtime.json')
    const mod = await loadBoardLauncher()

    mkdirSync(resolve(repoRoot, 'apps', 'monitor-board'), { recursive: true })
    writeFileSync(resolve(repoRoot, 'apps', 'monitor-board', 'package.json'), '{"name":"monitor-board"}\n', 'utf8')

    const spawnProcess = vi.fn(() => ({ pid: 43210, unref() {}, stdout: null, stderr: null }))
    const isMonitorBoard = vi.fn().mockResolvedValue(true)

    const result = await mod.ensureMonitorBoardRunning(
      {
        repoRoot,
        runtimeStatePath,
        monitorSessionId: 'monitor:workspace-1',
        preferredPort: 5173,
        host: '127.0.0.1',
      },
      {
        isPortReachable: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
        isMonitorBoard,
        spawnProcess,
        waitForPort: vi.fn().mockResolvedValue(true),
      },
    )

    expect(result).toMatchObject({
      status: 'started',
      url: 'http://127.0.0.1:5173/?monitorSessionId=monitor%3Aworkspace-1',
      port: 5173,
      pid: 43210,
    })
    expect(spawnProcess).toHaveBeenCalledTimes(1)
    expect(isMonitorBoard).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 5173,
      timeoutMs: 1_000,
    })
    expect(JSON.parse(readFileSync(runtimeStatePath, 'utf8'))).toMatchObject({
      port: 5173,
      pid: 43210,
    })
  })

  it('cleans up the detached board when persisting runtime state fails after startup', async () => {
    const repoRoot = createTempRoot()
    const runtimeStatePath = resolve(repoRoot, '.harness', 'state', 'monitor-board', 'runtime.json')
    const mod = await loadBoardLauncher()

    mkdirSync(resolve(repoRoot, 'apps', 'monitor-board'), { recursive: true })
    writeFileSync(resolve(repoRoot, 'apps', 'monitor-board', 'package.json'), '{"name":"monitor-board"}\n', 'utf8')

    const child = new FakeChildProcess(43210)
    const cleanupProcess = vi.fn().mockResolvedValue(undefined)
    const writeRuntimeState = vi.fn().mockRejectedValue(new Error('disk full'))

    const result = await mod.ensureMonitorBoardRunning(
      {
        repoRoot,
        runtimeStatePath,
        monitorSessionId: 'monitor:workspace-1',
        preferredPort: 5173,
        host: '127.0.0.1',
      },
      {
        cleanupProcess,
        isMonitorBoard: vi.fn().mockResolvedValue(true),
        isPortReachable: vi.fn().mockResolvedValue(false),
        spawnProcess: vi.fn(() => child),
        waitForPort: vi.fn().mockResolvedValue(true),
        writeRuntimeState,
      },
    )

    expect(result.status).toBe('failed')
    expect(result.port).toBe(5173)
    expect(result.pid).toBe(null)
    expect(result.message).toContain('failed to persist runtime state')
    expect(result.message).toContain('disk full')
    expect(cleanupProcess).toHaveBeenCalledWith({ child, pid: 43210 })
    expect(writeRuntimeState).toHaveBeenCalledWith(
      runtimeStatePath,
      expect.objectContaining({
        host: '127.0.0.1',
        pid: 43210,
        port: 5173,
        repoRoot,
      }),
    )
    expect(existsSync(runtimeStatePath)).toBe(false)
  })

  it('requires positive monitor-board identity verification before reusing an existing port', async () => {
    const repoRoot = createTempRoot()
    const runtimeStatePath = resolve(repoRoot, '.harness', 'state', 'monitor-board', 'runtime.json')
    const mod = await loadBoardLauncher()

    mkdirSync(resolve(repoRoot, '.harness', 'state', 'monitor-board'), { recursive: true })
    mkdirSync(resolve(repoRoot, 'apps', 'monitor-board'), { recursive: true })
    writeFileSync(resolve(repoRoot, 'apps', 'monitor-board', 'package.json'), '{"name":"monitor-board"}\n', 'utf8')
    writeFileSync(
      runtimeStatePath,
      `${JSON.stringify({
        pid: 123,
        port: 5172,
        url: 'http://127.0.0.1:5172',
        startedAt: '2026-04-20T00:00:00.000Z',
        repoRoot,
      })}\n`,
      'utf8',
    )

    const spawnProcess = vi.fn(() => ({ pid: 43210, unref() {}, stdout: null, stderr: null }))
    const isMonitorBoard = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const result = await mod.ensureMonitorBoardRunning(
      {
        repoRoot,
        runtimeStatePath,
        monitorSessionId: 'monitor:workspace-1',
        preferredPort: 5173,
        host: '127.0.0.1',
      },
      {
        isPortReachable: vi.fn().mockResolvedValue(true),
        isMonitorBoard,
        spawnProcess,
        waitForPort: vi.fn().mockResolvedValue(true),
      },
    )

    expect(result).toMatchObject({
      status: 'started',
      url: 'http://127.0.0.1:5173/?monitorSessionId=monitor%3Aworkspace-1',
      port: 5173,
      pid: 43210,
    })
    expect(spawnProcess).toHaveBeenCalledTimes(1)
    expect(isMonitorBoard).toHaveBeenNthCalledWith(1, {
      host: '127.0.0.1',
      port: 5172,
      timeoutMs: 1_000,
    })
    expect(isMonitorBoard).toHaveBeenNthCalledWith(2, {
      host: '127.0.0.1',
      port: 5173,
      timeoutMs: 1_000,
    })
    expect(JSON.parse(readFileSync(runtimeStatePath, 'utf8'))).toMatchObject({
      port: 5173,
      pid: 43210,
    })
  })

  it.each([
    {
      name: 'child error',
      emitFailure: (child: FakeChildProcess) => queueMicrotask(() => child.emit('error', new Error('spawn failed'))),
      expectedMessage: 'spawn failed',
    },
    {
      name: 'early child exit',
      emitFailure: (child: FakeChildProcess) => queueMicrotask(() => child.emit('exit', 1, null)),
      expectedMessage: 'exited before becoming ready (code 1)',
    },
    {
      name: 'startup timeout',
      emitFailure: () => {},
      expectedMessage: 'failed to start on 127.0.0.1:5173 within 25ms',
    },
  ])('fails cleanly on $name during startup', async ({ emitFailure, expectedMessage }) => {
    const repoRoot = createTempRoot()
    const runtimeStatePath = resolve(repoRoot, '.harness', 'state', 'monitor-board', 'runtime.json')
    const mod = await loadBoardLauncher()

    mkdirSync(resolve(repoRoot, 'apps', 'monitor-board'), { recursive: true })
    writeFileSync(resolve(repoRoot, 'apps', 'monitor-board', 'package.json'), '{"name":"monitor-board"}\n', 'utf8')

    const child = new FakeChildProcess(54321)
    const cleanupProcess = vi.fn().mockResolvedValue(undefined)
    const waitForPort = vi.fn().mockResolvedValue(false)
    const spawnProcess = vi.fn(() => {
      emitFailure(child)
      return child
    })

    const result = await mod.ensureMonitorBoardRunning(
      {
        repoRoot,
        runtimeStatePath,
        monitorSessionId: 'monitor:workspace-1',
        preferredPort: 5173,
        host: '127.0.0.1',
        timeoutMs: 25,
      },
      {
        cleanupProcess,
        isMonitorBoard: vi.fn(),
        isPortReachable: vi.fn().mockResolvedValue(false),
        spawnProcess,
        waitForPort,
      },
    )

    expect(result.status).toBe('failed')
    expect(result.port).toBe(5173)
    expect(result.pid).toBe(null)
    expect(result.message).toContain(expectedMessage)
    expect(cleanupProcess).toHaveBeenCalledWith({ child, pid: 54321 })
    expect(child.listenerCount('error')).toBe(0)
    expect(child.listenerCount('exit')).toBe(0)
  })
})
