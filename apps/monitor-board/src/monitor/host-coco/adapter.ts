import {
  BoardEventSchema,
  createBoardEventId,
  type BoardEvent,
  type BoardStatus,
  type EventType,
} from '@monitor/protocol';

type CocoRootEventBase = {
  sessionId: string;
  actorId: string;
  summary: string;
  sequence: number;
  monitorSessionId: string;
  timestamp: string;
  model?: string;
};

type CocoNonRootEventBase = CocoRootEventBase & {
  parentActorId: string;
  rootSessionId: string;
  monitorOwnerActorId: string;
};

type CocoSessionStartedEvent = CocoRootEventBase & {
  kind: 'session.started';
};

type CocoChildSpawnedEvent = CocoNonRootEventBase & {
  kind: 'child.spawned';
};

type CocoToolFinishedEvent = CocoNonRootEventBase & {
  kind: 'tool.finished';
  toolName: string;
};

export type CocoRawEvent = CocoSessionStartedEvent | CocoChildSpawnedEvent | CocoToolFinishedEvent;

const toProtocolEventType = (kind: CocoRawEvent['kind']): EventType => {
  switch (kind) {
    case 'session.started':
      return 'session.started';
    case 'child.spawned':
      return 'actor.spawned';
    case 'tool.finished':
      return 'tool.finished';
  }
};

const toStatus = (kind: CocoRawEvent['kind']): BoardStatus => (kind === 'tool.finished' ? 'done' : 'active');

export const normalizeCocoEvent = (raw: CocoRawEvent): BoardEvent => {
  const eventType = toProtocolEventType(raw.kind);

  switch (raw.kind) {
    case 'session.started':
      return BoardEventSchema.parse({
        id: createBoardEventId(eventType, raw.actorId, raw.sequence),
        sessionId: raw.sessionId,
        rootSessionId: raw.sessionId,
        monitorSessionId: raw.monitorSessionId,
        actorId: raw.actorId,
        parentActorId: null,
        actorType: 'lead',
        eventType,
        action: raw.kind,
        status: toStatus(raw.kind),
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
          source: 'coco',
          rawKind: raw.kind,
        },
        tags: [],
        severity: 'info' as const,
        monitorEnabled: true,
        monitorInherited: false,
        monitorOwnerActorId: raw.actorId,
      });
    case 'child.spawned':
      return BoardEventSchema.parse({
        id: createBoardEventId(eventType, raw.actorId, raw.sequence),
        sessionId: raw.sessionId,
        rootSessionId: raw.rootSessionId,
        monitorSessionId: raw.monitorSessionId,
        actorId: raw.actorId,
        parentActorId: raw.parentActorId,
        actorType: 'worker',
        eventType,
        action: raw.kind,
        status: toStatus(raw.kind),
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
          source: 'coco',
          rawKind: raw.kind,
        },
        tags: [],
        severity: 'info' as const,
        monitorEnabled: true,
        monitorInherited: true,
        monitorOwnerActorId: raw.monitorOwnerActorId,
      });
    case 'tool.finished':
      return BoardEventSchema.parse({
        id: createBoardEventId(eventType, raw.actorId, raw.sequence),
        sessionId: raw.sessionId,
        rootSessionId: raw.rootSessionId,
        monitorSessionId: raw.monitorSessionId,
        actorId: raw.actorId,
        parentActorId: raw.parentActorId,
        actorType: 'worker',
        eventType,
        action: raw.kind,
        status: toStatus(raw.kind),
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
          source: 'coco',
          rawKind: raw.kind,
        },
        tags: [],
        severity: 'info' as const,
        monitorEnabled: true,
        monitorInherited: true,
        monitorOwnerActorId: raw.monitorOwnerActorId,
      });
  }
};
