import { describe, expect, it } from 'vitest';
import { BoardEventSchema } from '@monitor/protocol';
import { normalizeClaudeCodeEvent } from './adapter';

describe('normalizeClaudeCodeEvent', () => {
  it('requires explicit timestamps for Claude root events', () => {
    expect(() =>
      normalizeClaudeCodeEvent({
        type: 'session.start',
        sessionId: 'session-1',
        actorId: 'lead-1',
        summary: 'Session started',
        sequence: 1,
        monitorSessionId: 'monitor:session-1',
      } as never),
    ).toThrow();
  });

  it('maps Claude Code tool finish into protocol tool.finished and preserves toolName', () => {
    const event = normalizeClaudeCodeEvent({
      type: 'tool.finish',
      sessionId: 'session-1',
      actorId: 'subagent-1',
      parentActorId: 'lead-1',
      rootSessionId: 'session-1',
      monitorOwnerActorId: 'lead-1',
      toolName: 'Read',
      summary: 'Scanned target file',
      sequence: 3,
      monitorSessionId: 'monitor:session-1',
      timestamp: '2026-04-18T10:00:03.000Z',
    });

    expect(BoardEventSchema.parse(event)).toEqual(event);
    expect(event.eventType).toBe('tool.finished');
    expect(event.toolName).toBe('Read');
    expect(event.actorType).toBe('subagent');
    expect(event.rootSessionId).toBe('session-1');
    expect(event.monitorOwnerActorId).toBe('lead-1');
    expect(event.timestamp).toBe('2026-04-18T10:00:03.000Z');
  });

  it('rejects non-root Claude events without explicit parent/root monitor context', () => {
    expect(() =>
      normalizeClaudeCodeEvent({
        type: 'tool.finish',
        sessionId: 'session-1',
        actorId: 'subagent-1',
        toolName: 'Read',
        summary: 'Scanned target file',
        sequence: 4,
        monitorSessionId: 'monitor:session-1',
        timestamp: '2026-04-18T10:00:04.000Z',
      } as never),
    ).toThrow();
  });
});
