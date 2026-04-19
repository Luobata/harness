import { describe, expect, it } from 'vitest';
import { BoardEventSchema } from '@monitor/protocol';
import { normalizeCocoEvent } from './adapter';

describe('normalizeCocoEvent', () => {
  it('maps coco session started into a valid lead board event with explicit timestamp', () => {
    const event = normalizeCocoEvent({
      kind: 'session.started',
      sessionId: 'session-1',
      actorId: 'lead-1',
      model: 'gpt-5.4-mini',
      summary: 'Session booted',
      sequence: 1,
      monitorSessionId: 'monitor:session-1',
      timestamp: '2026-04-18T10:00:00.000Z',
    });

    expect(BoardEventSchema.parse(event)).toEqual(event);
    expect(event.eventType).toBe('session.started');
    expect(event.actorType).toBe('lead');
    expect(event.parentActorId).toBeNull();
    expect(event.rootSessionId).toBe('session-1');
    expect(event.monitorOwnerActorId).toBe('lead-1');
    expect(event.timestamp).toBe('2026-04-18T10:00:00.000Z');
  });

  it('maps coco child spawn into a valid worker board event and preserves parentActorId', () => {
    const event = normalizeCocoEvent({
      kind: 'child.spawned',
      sessionId: 'session-1',
      actorId: 'worker-1',
      parentActorId: 'lead-1',
      rootSessionId: 'session-1',
      monitorOwnerActorId: 'lead-1',
      model: 'gpt-5.4-mini',
      summary: 'Running tests',
      sequence: 2,
      monitorSessionId: 'monitor:session-1',
      timestamp: '2026-04-18T10:00:01.000Z',
    });

    expect(BoardEventSchema.parse(event)).toEqual(event);
    expect(event.eventType).toBe('actor.spawned');
    expect(event.actorType).toBe('worker');
    expect(event.parentActorId).toBe('lead-1');
    expect(event.monitorInherited).toBe(true);
    expect(event.monitorOwnerActorId).toBe('lead-1');
    expect(event.rootSessionId).toBe('session-1');
  });

  it('rejects non-root coco events without explicit parent/root monitor context and timestamp', () => {
    expect(() =>
      normalizeCocoEvent({
        kind: 'tool.finished',
        sessionId: 'session-1',
        actorId: 'worker-1',
        toolName: 'Read',
        summary: 'Read complete',
        sequence: 3,
        monitorSessionId: 'monitor:session-1',
      } as never),
    ).toThrow();
  });
});
