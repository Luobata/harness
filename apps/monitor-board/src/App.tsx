import React, { useEffect, useMemo, useState } from 'react';
import type { SessionSnapshot } from '@monitor/monitor-gateway';
import { useBoardStore } from './store/useBoardStore';
import { CrewGrid, type CrewCard } from './components/CrewGrid';
import { FocusDrawer, type FocusDrawerViewModel } from './components/FocusDrawer';
import { RunTree, type RunTreeNode } from './components/RunTree';
import { TimelinePanel, type TimelineEntry } from './components/TimelinePanel';
import { TopBar } from './components/TopBar';
import type { BoardMode } from './store/useBoardStore';
import { connectBoardSocket, type BoardSocketConnection, type BoardSocketConnector } from './lib/socket';
import './styles/pixel-theme.css';

type SessionActor = SessionSnapshot['state']['actors'][number];
type SessionEvent = SessionSnapshot['state']['timeline'][number];
type ActorStatus = SessionActor['status'];

interface AdaptedActorViewModel {
  id: string;
  name: string;
  actorType: SessionActor['actorType'];
  parentActorId: string | null;
  status: ActorStatus;
  summary: string;
  currentAction: string;
  model: string;
  latestTool: string | null;
  tokenCount: number;
  elapsedLabel: string;
  updatedAt: string;
}

interface AppProps {
  initialSnapshot?: SessionSnapshot;
  socketUrl?: string;
  connectSocket?: BoardSocketConnector;
}

const DEFAULT_SOCKET_URL = 'ws://127.0.0.1:8787';

const demoSnapshot: SessionSnapshot = {
  monitorSessionId: 'Task 8 Board',
  stats: {
    actorCount: 3,
    activeCount: 2,
    blockedCount: 0,
    totalTokens: 1280,
    elapsedMs: 734000,
  },
  actorCount: 3,
  timelineCount: 4,
  state: {
    actors: [
      {
        id: 'lead-1',
        parentActorId: null,
        actorType: 'lead',
        status: 'active',
        summary: 'Coordinating panel focus state',
        model: 'GPT-5.4',
        toolName: 'planning',
        totalTokens: 640,
        elapsedMs: 734000,
        children: ['subagent-1'],
        lastEventAt: '2026-04-18T12:05:00.000Z',
        lastEventSequence: 3,
      },
      {
        id: 'subagent-1',
        parentActorId: 'lead-1',
        actorType: 'subagent',
        status: 'active',
        summary: 'Shipping panel composition',
        model: 'GPT-5.4-mini',
        toolName: 'apply_patch',
        totalTokens: 420,
        elapsedMs: 511000,
        children: ['worker-1'],
        lastEventAt: '2026-04-18T12:03:00.000Z',
        lastEventSequence: 2,
      },
      {
        id: 'worker-1',
        parentActorId: 'subagent-1',
        actorType: 'worker',
        status: 'idle',
        summary: 'Holding virtualized rows',
        model: 'GPT-5.4-nano',
        toolName: 'vitest',
        totalTokens: 220,
        elapsedMs: 260000,
        children: [],
        lastEventAt: '2026-04-18T12:08:00.000Z',
        lastEventSequence: 4,
      },
    ],
    timeline: [
      {
        id: 'evt-1',
        sessionId: 'session-1',
        rootSessionId: 'session-1',
        monitorSessionId: 'Task 8 Board',
        actorId: 'lead-1',
        parentActorId: null,
        actorType: 'lead',
        eventType: 'session.started',
        action: 'opened Task 8 board shell',
        status: 'active',
        timestamp: '2026-04-18T12:01:00.000Z',
        sequence: 1,
        model: 'GPT-5.4',
        toolName: null,
        tokenIn: 0,
        tokenOut: 0,
        elapsedMs: 1000,
        costEstimate: 0,
        summary: 'Lead opened Task 8 board shell',
        metadata: {
          displayName: 'Lead Agent',
          currentAction: 'Aligning the board view-model pipeline',
          timelineLabel: 'opened Task 8 board shell',
        },
        tags: [],
        severity: 'info',
        monitorEnabled: true,
        monitorInherited: false,
        monitorOwnerActorId: 'lead-1',
      },
      {
        id: 'evt-2',
        sessionId: 'session-1',
        rootSessionId: 'session-1',
        monitorSessionId: 'Task 8 Board',
        actorId: 'subagent-1',
        parentActorId: 'lead-1',
        actorType: 'subagent',
        eventType: 'action.summary',
        action: 'Wiring summary and metadata variants',
        status: 'active',
        timestamp: '2026-04-18T12:03:00.000Z',
        sequence: 2,
        model: 'GPT-5.4-mini',
        toolName: 'apply_patch',
        tokenIn: 0,
        tokenOut: 0,
        elapsedMs: 3000,
        costEstimate: 0,
        summary: 'UI worker wired summary and metadata panels',
        metadata: {
          displayName: 'UI Worker',
          currentAction: 'Wiring summary and metadata variants',
          timelineLabel: 'wired summary and metadata panels',
        },
        tags: [],
        severity: 'info',
        monitorEnabled: true,
        monitorInherited: true,
        monitorOwnerActorId: 'lead-1',
      },
      {
        id: 'evt-3',
        sessionId: 'session-1',
        rootSessionId: 'session-1',
        monitorSessionId: 'Task 8 Board',
        actorId: 'lead-1',
        parentActorId: null,
        actorType: 'lead',
        eventType: 'action.summary',
        action: 'Synced focus hand-off',
        status: 'active',
        timestamp: '2026-04-18T12:05:00.000Z',
        sequence: 3,
        model: 'GPT-5.4',
        toolName: 'planning',
        tokenIn: 0,
        tokenOut: 0,
        elapsedMs: 5000,
        costEstimate: 0,
        summary: 'Lead synced focus hand-off',
        metadata: {
          displayName: 'Lead Agent',
          currentAction: 'Aligning the board view-model pipeline',
          timelineLabel: 'synced focus hand-off',
        },
        tags: [],
        severity: 'info',
        monitorEnabled: true,
        monitorInherited: false,
        monitorOwnerActorId: 'lead-1',
      },
      {
        id: 'evt-4',
        sessionId: 'session-1',
        rootSessionId: 'session-1',
        monitorSessionId: 'Task 8 Board',
        actorId: 'worker-1',
        parentActorId: 'subagent-1',
        actorType: 'worker',
        eventType: 'action.summary',
        action: 'Waiting for next actor filter update',
        status: 'idle',
        timestamp: '2026-04-18T12:08:00.000Z',
        sequence: 4,
        model: 'GPT-5.4-nano',
        toolName: 'vitest',
        tokenIn: 0,
        tokenOut: 0,
        elapsedMs: 8000,
        costEstimate: 0,
        summary: 'Timeline worker mounted virtual rows',
        metadata: {
          displayName: 'Timeline Worker',
          currentAction: 'Waiting for next actor filter update',
          timelineLabel: 'mounted virtual rows',
        },
        tags: [],
        severity: 'info',
        monitorEnabled: true,
        monitorInherited: true,
        monitorOwnerActorId: 'lead-1',
      },
    ],
  },
};

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const formatElapsedMs = (elapsedMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};

const formatClockTime = (value: string) => {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readStringFromMetadata = (metadata: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
};

const buildFallbackActorName = (actor: SessionActor) => {
  if (actor.actorType === 'lead') {
    return 'Lead Agent';
  }

  const suffix = actor.id.match(/(\d+)$/)?.[1];
  return suffix ? `${titleCase(actor.actorType)} ${suffix}` : `${titleCase(actor.actorType)} ${actor.id}`;
};

const compareEventOrder = (left: Pick<SessionEvent, 'timestamp' | 'sequence'>, right: Pick<SessionEvent, 'timestamp' | 'sequence'>) => {
  if (left.timestamp === right.timestamp) {
    return left.sequence - right.sequence;
  }

  return left.timestamp.localeCompare(right.timestamp);
};

const getLatestEventByActorId = (snapshot: SessionSnapshot) => {
  const latestByActorId = new Map<string, SessionEvent>();

  snapshot.state.timeline.forEach((event) => {
    const current = latestByActorId.get(event.actorId);

    if (!current || compareEventOrder(current, event) <= 0) {
      latestByActorId.set(event.actorId, event);
    }
  });

  return latestByActorId;
};

const adaptActors = (snapshot: SessionSnapshot): AdaptedActorViewModel[] => {
  const latestEventByActorId = getLatestEventByActorId(snapshot);

  return snapshot.state.actors.map((actor) => {
    const latestEvent = latestEventByActorId.get(actor.id);
    const metadata = isRecord(latestEvent?.metadata) ? latestEvent.metadata : {};
    const name = readStringFromMetadata(metadata, ['displayName', 'actorName', 'name']) ?? buildFallbackActorName(actor);
    const currentAction =
      readStringFromMetadata(metadata, ['currentAction', 'actionLabel']) ?? latestEvent?.action ?? actor.summary;

    return {
      id: actor.id,
      name,
      actorType: actor.actorType,
      parentActorId: actor.parentActorId,
      status: actor.status,
      summary: actor.summary,
      currentAction,
      model: actor.model ?? latestEvent?.model ?? 'unassigned',
      latestTool: actor.toolName ?? latestEvent?.toolName ?? null,
      tokenCount: actor.totalTokens,
      elapsedLabel: formatElapsedMs(actor.elapsedMs),
      updatedAt: formatClockTime(actor.lastEventAt),
    };
  });
};

const buildRunTreeNodes = (actors: AdaptedActorViewModel[], parentActorId: string | null): RunTreeNode[] =>
  actors
    .filter((actor) => actor.parentActorId === parentActorId)
    .map((actor) => ({
      id: actor.id,
      name: actor.name,
      role: actor.actorType,
      children: buildRunTreeNodes(actors, actor.id),
    }));

const buildCrewCards = (actors: AdaptedActorViewModel[], mode: BoardMode): CrewCard[] =>
  actors.map((actor) => ({
    id: actor.id,
    name: actor.name,
    role: titleCase(actor.actorType),
    status: actor.status,
    primaryDetail: mode === 'summary' ? actor.summary : `Model ${actor.model}`,
    secondaryDetail:
      mode === 'summary'
        ? `Action ${actor.currentAction}`
        : `Status ${actor.status} · Tool ${actor.latestTool ?? 'none'}`,
    metricLabel: mode === 'summary' ? `Updated ${actor.updatedAt}` : `Tokens ${actor.tokenCount}`,
  }));

const deriveHealth = (actors: AdaptedActorViewModel[]) => {
  const statuses = new Set(actors.map((actor) => actor.status));

  if (statuses.has('failed')) {
    return 'failed';
  }

  if (statuses.has('blocked')) {
    return 'blocked';
  }

  if (statuses.has('active')) {
    return 'active';
  }

  if (statuses.has('done')) {
    return 'done';
  }

  return 'idle';
};

const buildTopBarStats = (snapshot: SessionSnapshot, actors: AdaptedActorViewModel[]) => ({
  mission: snapshot.monitorSessionId,
  progress: `${snapshot.stats.activeCount}/${snapshot.actorCount} active`,
  tokens: snapshot.stats.totalTokens.toLocaleString(),
  elapsed: formatElapsedMs(snapshot.stats.elapsedMs),
  actors: String(snapshot.actorCount),
  health: deriveHealth(actors),
});

const buildTimelineEntries = (
  snapshot: SessionSnapshot,
  actors: AdaptedActorViewModel[],
  selectedActorId: string | null,
): TimelineEntry[] => {
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

  return snapshot.state.timeline
    .filter((entry) => !selectedActorId || entry.actorId === selectedActorId)
    .map((entry) => {
      const metadata = isRecord(entry.metadata) ? entry.metadata : {};
      const summary = readStringFromMetadata(metadata, ['timelineLabel', 'timelineSummary']) ?? entry.action ?? entry.summary;

      return {
        id: entry.id,
        actorId: entry.actorId,
        label: `[${formatClockTime(entry.timestamp)}] ${actorsById.get(entry.actorId)?.name ?? 'Unknown Actor'} ${summary}`,
      };
    });
};

const buildFocusDrawerViewModel = (actor: AdaptedActorViewModel | null, mode: BoardMode): FocusDrawerViewModel => {
  if (!actor) {
    return {
      title: `FOCUS ${mode === 'summary' ? 'SUMMARY' : 'METADATA'}`,
      focusLine: 'Focus: none',
      detailLines: ['Select an actor to inspect the current task lane.'],
    };
  }

  return {
    title: `FOCUS ${mode === 'summary' ? 'SUMMARY' : 'METADATA'}`,
    focusLine: `Focus: ${actor.name}`,
    detailLines:
      mode === 'summary'
        ? [actor.summary, `Action: ${actor.currentAction}`]
        : [`Model: ${actor.model}`, `Status: ${actor.status} · Tokens: ${actor.tokenCount}`],
  };
};

const isSessionSnapshot = (payload: unknown): payload is SessionSnapshot => {
  if (!isRecord(payload) || typeof payload.monitorSessionId !== 'string') {
    return false;
  }

  if (!isRecord(payload.stats) || !isRecord(payload.state)) {
    return false;
  }

  return Array.isArray(payload.state.actors) && Array.isArray(payload.state.timeline);
};

export const App = ({
  initialSnapshot = demoSnapshot,
  socketUrl = DEFAULT_SOCKET_URL,
  connectSocket = connectBoardSocket,
}: AppProps) => {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(initialSnapshot);

  const mode = useBoardStore((state) => state.mode);
  const selectedActorId = useBoardStore((state) => state.selectedActorId);
  const setMode = useBoardStore((state) => state.setMode);
  const setSelectedActorId = useBoardStore((state) => state.setSelectedActorId);

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    let socket: BoardSocketConnection | null = null;

    try {
      socket = connectSocket(socketUrl, (payload) => {
        if (isSessionSnapshot(payload)) {
          setSnapshot(payload);
        }
      });
    } catch {
      return undefined;
    }

    return () => {
      socket?.close();
    };
  }, [connectSocket, socketUrl]);

  const actors = useMemo(() => adaptActors(snapshot), [snapshot]);
  const leadActorId = actors.find((actor) => actor.actorType === 'lead')?.id ?? actors[0]?.id ?? null;
  const resolvedSelectedActorId =
    selectedActorId && actors.some((actor) => actor.id === selectedActorId) ? selectedActorId : leadActorId;

  useEffect(() => {
    if (resolvedSelectedActorId !== selectedActorId) {
      setSelectedActorId(resolvedSelectedActorId);
    }
  }, [resolvedSelectedActorId, selectedActorId, setSelectedActorId]);

  const topBarStats = useMemo(() => buildTopBarStats(snapshot, actors), [snapshot, actors]);
  const runTreeNodes = useMemo(() => buildRunTreeNodes(actors, null), [actors]);
  const crewCards = useMemo(() => buildCrewCards(actors, mode), [actors, mode]);
  const selectedActor = actors.find((actor) => actor.id === resolvedSelectedActorId) ?? null;
  const focusDrawerViewModel = useMemo(
    () => buildFocusDrawerViewModel(selectedActor, mode),
    [selectedActor, mode],
  );
  const visibleTimelineEntries = useMemo(
    () => buildTimelineEntries(snapshot, actors, resolvedSelectedActorId),
    [snapshot, actors, resolvedSelectedActorId],
  );

  return (
    <div className="board-shell" data-mode={mode} data-selected-actor-id={resolvedSelectedActorId ?? ''}>
      <TopBar mode={mode} onModeChange={setMode} stats={topBarStats} />
      <main className="board-grid board-main">
        <RunTree nodes={runTreeNodes} selectedActorId={resolvedSelectedActorId} />
        <div className="board-center-stack">
          <CrewGrid actors={crewCards} selectedActorId={resolvedSelectedActorId} onFocus={setSelectedActorId} />
          <FocusDrawer viewModel={focusDrawerViewModel} />
        </div>
        <TimelinePanel entries={visibleTimelineEntries} />
      </main>
    </div>
  );
};
