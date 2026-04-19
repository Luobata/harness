import {
  BoardEventSchema,
  createBoardEventId,
  type BoardEvent,
  type BoardStatus,
  type EventType,
} from '@monitor/protocol';

type ClaudeRootEventBase = {
  sessionId: string;
  actorId: string;
  summary: string;
  sequence: number;
  monitorSessionId: string;
  timestamp: string;
  model?: string;
};

type ClaudeNonRootEventBase = ClaudeRootEventBase & {
  parentActorId: string;
  rootSessionId: string;
  monitorOwnerActorId: string;
};

type ClaudeSessionStartEvent = ClaudeRootEventBase & {
  type: 'session.start';
};

type ClaudeSubagentSpawnEvent = ClaudeNonRootEventBase & {
  type: 'subagent.spawn';
};

type ClaudeToolFinishEvent = ClaudeNonRootEventBase & {
  type: 'tool.finish';
  toolName: string;
};

export type ClaudeCodeRawEvent = ClaudeSessionStartEvent | ClaudeSubagentSpawnEvent | ClaudeToolFinishEvent;

const toProtocolEventType = (type: ClaudeCodeRawEvent['type']): EventType => {
  switch (type) {
    case 'session.start':
      return 'session.started';
    case 'subagent.spawn':
      return 'actor.spawned';
    case 'tool.finish':
      return 'tool.finished';
  }
};

const toStatus = (type: ClaudeCodeRawEvent['type']): BoardStatus => (type === 'tool.finish' ? 'done' : 'active');

export const normalizeClaudeCodeEvent = (raw: ClaudeCodeRawEvent): BoardEvent => {
  const eventType = toProtocolEventType(raw.type);

  switch (raw.type) {
    case 'session.start':
      return BoardEventSchema.parse({
        id: createBoardEventId(eventType, raw.actorId, raw.sequence),
        sessionId: raw.sessionId,
        rootSessionId: raw.sessionId,
        monitorSessionId: raw.monitorSessionId,
        actorId: raw.actorId,
        parentActorId: null,
        actorType: 'lead',
        eventType,
        action: raw.type,
        status: toStatus(raw.type),
        timestamp: raw.timestamp,
        sequence: raw.sequence,
        model: raw.model ?? null,
        toolName: null,
        tokenIn: 0,
        tokenOut: 0,
        elapsedMs: 0,
        costEstimate: 0,
        summary: raw.summary,
        metadata: {
          source: 'claude-code',
          rawType: raw.type,
        },
        tags: [],
        severity: 'info' as const,
        monitorEnabled: true,
        monitorInherited: false,
        monitorOwnerActorId: raw.actorId,
      });
    case 'subagent.spawn':
      return BoardEventSchema.parse({
        id: createBoardEventId(eventType, raw.actorId, raw.sequence),
        sessionId: raw.sessionId,
        rootSessionId: raw.rootSessionId,
        monitorSessionId: raw.monitorSessionId,
        actorId: raw.actorId,
        parentActorId: raw.parentActorId,
        actorType: 'subagent',
        eventType,
        action: raw.type,
        status: toStatus(raw.type),
        timestamp: raw.timestamp,
        sequence: raw.sequence,
        model: raw.model ?? null,
        toolName: null,
        tokenIn: 0,
        tokenOut: 0,
        elapsedMs: 0,
        costEstimate: 0,
        summary: raw.summary,
        metadata: {
          source: 'claude-code',
          rawType: raw.type,
        },
        tags: [],
        severity: 'info' as const,
        monitorEnabled: true,
        monitorInherited: true,
        monitorOwnerActorId: raw.monitorOwnerActorId,
      });
    case 'tool.finish':
      return BoardEventSchema.parse({
        id: createBoardEventId(eventType, raw.actorId, raw.sequence),
        sessionId: raw.sessionId,
        rootSessionId: raw.rootSessionId,
        monitorSessionId: raw.monitorSessionId,
        actorId: raw.actorId,
        parentActorId: raw.parentActorId,
        actorType: 'subagent',
        eventType,
        action: raw.type,
        status: toStatus(raw.type),
        timestamp: raw.timestamp,
        sequence: raw.sequence,
        model: raw.model ?? null,
        toolName: raw.toolName,
        tokenIn: 0,
        tokenOut: 0,
        elapsedMs: 0,
        costEstimate: 0,
        summary: raw.summary,
        metadata: {
          source: 'claude-code',
          rawType: raw.type,
        },
        tags: [],
        severity: 'info' as const,
        monitorEnabled: true,
        monitorInherited: true,
        monitorOwnerActorId: raw.monitorOwnerActorId,
      });
  }
};
