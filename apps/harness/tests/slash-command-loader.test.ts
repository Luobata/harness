import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseHarnessTeamInvocation } from '../src/cli/index.js'
import { loadSlashCommandRegistry, resolveSlashCommand } from '../src/cli/slash-command-loader.js'

const configPath = resolve(import.meta.dirname, '../configs/slash-commands.yaml')

describe('slash command loader', () => {
  it('拒绝已移除的 harness 专属 slash 入口', () => {
    const registry = loadSlashCommandRegistry(configPath)

    expect(() => resolveSlashCommand('/h', new Map(), registry)).toThrow(/未知 slash 命令/)
    expect(() => resolveSlashCommand('/harness', new Map(), registry)).toThrow(/未知 slash 命令/)
    expect(() => resolveSlashCommand('/harness-debug', new Map(), registry)).toThrow(/未知 slash 命令/)
    expect(() => resolveSlashCommand('/harndess-debug', new Map(), registry)).toThrow(/未知 slash 命令/)
  })

  it('把 /review 映射为 run + review-only composition', () => {
    const registry = loadSlashCommandRegistry(configPath)
    const resolved = resolveSlashCommand('/review', new Map(), registry)

    expect(resolved).not.toBeNull()
    expect(resolved?.command).toBe('run')
    expect(resolved?.flags.get('composition')).toBe('review-only')
    expect(resolved?.flags.get('teamName')).toBe('default')
  })

  it('把 /harness-team 映射为 run + team-run DSL', () => {
    const registry = loadSlashCommandRegistry(configPath)
    const resolved = resolveSlashCommand('/harness-team', new Map(), registry)

    expect(resolved).not.toBeNull()
    expect(resolved?.command).toBe('run')
    expect(resolved?.dsl).toBe('team-run')
  })

  it('允许显式 flags 覆盖 slash command 默认值', () => {
    const registry = loadSlashCommandRegistry(configPath)
    const resolved = resolveSlashCommand('/research', new Map([['composition', 'qa-only']]), registry)

    expect(resolved?.command).toBe('run')
    expect(resolved?.flags.get('composition')).toBe('qa-only')
  })

  it('非 slash 命令返回 null', () => {
    const registry = loadSlashCommandRegistry(configPath)
    expect(resolveSlashCommand('run', new Map(), registry)).toBeNull()
  })

  it('解析 /harness-team 的 team-size、slot overrides 与 goal', () => {
    expect(parseHarnessTeamInvocation(['3', '1:backend=coco', '2:model=gpt5.4', '3:profile=cc-local', '修复', 'watch', '视图'])).toEqual({
      goal: '修复 watch 视图',
      teamRunSpec: {
        teamSize: 3,
        overrides: [
          { slotId: 1, key: 'backend', value: 'coco' },
          { slotId: 2, key: 'model', value: 'gpt5.4' },
          { slotId: 3, key: 'profile', value: 'cc-local' }
        ],
        slots: [
          { slotId: 1, backend: 'coco' },
          { slotId: 2, model: 'gpt5.4' },
          { slotId: 3, profile: 'cc-local' }
        ]
      }
    })
  })

  it('数字开头的普通 goal 不会被误判为 team-size', () => {
    expect(parseHarnessTeamInvocation(['2025', 'Q1', 'roadmap'])).toEqual({
      goal: '2025 Q1 roadmap',
      teamRunSpec: {
        teamSize: 2,
        overrides: [],
        slots: [{ slotId: 1 }, { slotId: 2 }]
      }
    })
  })

  it('支持通过 -- 显式分隔 team-size 与 goal', () => {
    expect(parseHarnessTeamInvocation(['3', '--', '2025', 'Q1', 'roadmap'])).toEqual({
      goal: '2025 Q1 roadmap',
      teamRunSpec: {
        teamSize: 3,
        overrides: [],
        slots: [{ slotId: 1 }, { slotId: 2 }, { slotId: 3 }]
      }
    })
  })

  it('支持通过前置 -- 保留小数字开头的普通 goal', () => {
    expect(parseHarnessTeamInvocation(['--', '3', '修复', 'watch', '视图'])).toEqual({
      goal: '3 修复 watch 视图',
      teamRunSpec: {
        teamSize: 2,
        overrides: [],
        slots: [{ slotId: 1 }, { slotId: 2 }]
      }
    })
  })

  it('缺省 team-size 时会按默认值和最大 slot 自动补齐', () => {
    expect(parseHarnessTeamInvocation(['3:model=gpt5.4', '梳理', '登录链路']).teamRunSpec.teamSize).toBe(3)
    expect(parseHarnessTeamInvocation(['实现', 'team', 'mode']).teamRunSpec.teamSize).toBe(2)
  })

  it('对非法 /harness-team 输入给出明确报错', () => {
    expect(() => parseHarnessTeamInvocation([])).toThrow(/需要提供 goal/)
    expect(() => parseHarnessTeamInvocation(['2', '0:model=gpt5.4', '实现'])).toThrow(/slotId 非法/)
    expect(() => parseHarnessTeamInvocation(['2', '1:model=', '实现'])).toThrow(/slot override 值不能为空/)
    expect(() => parseHarnessTeamInvocation(['2', '2:foo=bar', '实现'])).toThrow(/slot override key 非法/)
    expect(() => parseHarnessTeamInvocation(['2', '3:model=gpt5.4', '实现'])).toThrow(/超出 team-size=2/)
    expect(() => parseHarnessTeamInvocation(['2', '1:backend=unknown', '实现'])).toThrow(/backend 非法/)
    expect(() => parseHarnessTeamInvocation(['2:model=gpt5.4'])).toThrow(/需要提供 goal/)
  })
})
