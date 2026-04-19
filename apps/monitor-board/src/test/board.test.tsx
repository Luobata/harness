import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionSnapshot } from '@monitor/monitor-gateway';
import { App } from '../App';
import { useBoardStore } from '../store/useBoardStore';

const createSessionSnapshot = (monitorSessionId = 'monitor:gateway-demo'): SessionSnapshot => ({
  monitorSessionId,
  stats: {
    actorCount: 3,
    activeCount: 2,
    blockedCount: 1,
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
        summary: 'Lead synced gateway contract',
        model: 'gpt-5.4',
        toolName: 'planning',
        totalTokens: 640,
        elapsedMs: 734000,
        children: ['subagent-1'],
        lastEventAt: '2026-04-18T12:05:00.000Z',
        lastEventSequence: 4,
      },
      {
        id: 'subagent-1',
        parentActorId: 'lead-1',
        actorType: 'subagent',
        status: 'blocked',
        summary: 'UI adapted to gateway snapshot',
        model: 'gpt-5.4-mini',
        toolName: 'apply_patch',
        totalTokens: 420,
        elapsedMs: 511000,
        children: ['worker-1'],
        lastEventAt: '2026-04-18T12:03:00.000Z',
        lastEventSequence: 3,
      },
      {
        id: 'worker-1',
        parentActorId: 'subagent-1',
        actorType: 'worker',
        status: 'idle',
        summary: 'Timeline waiting for focused actor filter',
        model: 'gpt-5.4-nano',
        toolName: 'vitest',
        totalTokens: 220,
        elapsedMs: 260000,
        children: [],
        lastEventAt: '2026-04-18T12:08:00.000Z',
        lastEventSequence: 5,
      },
    ],
    timeline: [
      {
        id: 'evt-1',
        sessionId: 'session-1',
        rootSessionId: 'session-1',
        monitorSessionId,
        actorId: 'lead-1',
        parentActorId: null,
        actorType: 'lead',
        eventType: 'session.started',
        action: 'opened Task 8 board shell',
        status: 'active',
        timestamp: '2026-04-18T12:01:00.000Z',
        sequence: 1,
        model: 'gpt-5.4',
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
        monitorSessionId,
        actorId: 'subagent-1',
        parentActorId: 'lead-1',
        actorType: 'subagent',
        eventType: 'action.summary',
        action: 'Wiring summary and metadata variants',
        status: 'blocked',
        timestamp: '2026-04-18T12:03:00.000Z',
        sequence: 2,
        model: 'gpt-5.4-mini',
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
        monitorSessionId,
        actorId: 'lead-1',
        parentActorId: null,
        actorType: 'lead',
        eventType: 'action.summary',
        action: 'Synced focus hand-off',
        status: 'active',
        timestamp: '2026-04-18T12:05:00.000Z',
        sequence: 3,
        model: 'gpt-5.4',
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
        monitorSessionId,
        actorId: 'worker-1',
        parentActorId: 'subagent-1',
        actorType: 'worker',
        eventType: 'action.summary',
        action: 'Waiting for next actor filter update',
        status: 'idle',
        timestamp: '2026-04-18T12:08:00.000Z',
        sequence: 4,
        model: 'gpt-5.4-nano',
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
});

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useBoardStore.setState({
      mode: 'summary',
      selectedActorId: null,
    });
  });

  it('renders the board from a gateway SessionSnapshot source', () => {
    render(<App initialSnapshot={createSessionSnapshot()} connectSocket={() => { throw new Error('offline'); }} />);

    expect(screen.getByText('monitor:gateway-demo')).toBeInTheDocument();
    expect(screen.getAllByText('Lead synced gateway contract').length).toBeGreaterThan(0);
    expect(screen.getByText('TOKENS')).toBeInTheDocument();
    expect(screen.queryByText('Task 8 Board')).not.toBeInTheDocument();
  });

  it('switches to metadata mode using the adapted SessionSnapshot view-model', () => {
    render(<App initialSnapshot={createSessionSnapshot()} connectSocket={() => { throw new Error('offline'); }} />);

    expect(screen.getAllByText('Lead synced gateway contract').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Metadata' }));

    expect(screen.getByText('Mode: metadata')).toBeInTheDocument();
    expect(screen.getByText('Model gpt-5.4')).toBeInTheDocument();
    expect(screen.getByText('Status active · Tool planning')).toBeInTheDocument();
    expect(screen.queryByText('Lead synced gateway contract')).not.toBeInTheDocument();
  });

  it('keeps Lead Agent focused and links focus state across timeline and run tree', () => {
    render(<App initialSnapshot={createSessionSnapshot()} connectSocket={() => { throw new Error('offline'); }} />);

    expect(screen.getByText('Focus: Lead Agent')).toBeInTheDocument();
    expect(screen.getByText('[12:01] Lead Agent opened Task 8 board shell')).toBeInTheDocument();
    expect(screen.getByText('[12:05] Lead Agent synced focus hand-off')).toBeInTheDocument();
    expect(screen.queryByText('[12:03] UI Worker wired summary and metadata panels')).not.toBeInTheDocument();
    expect(screen.queryByText('[12:08] Timeline Worker mounted virtual rows')).not.toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /Lead Agent/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the demo fallback snapshot when the gateway socket cannot connect', () => {
    render(<App connectSocket={() => { throw new Error('offline'); }} />);

    expect(screen.getByText('Task 8 Board')).toBeInTheDocument();
    expect(screen.getAllByText('Coordinating panel focus state').length).toBeGreaterThan(0);
  });

  it('applies live SessionSnapshot updates received from the gateway socket', async () => {
    const liveSnapshot = createSessionSnapshot('monitor:gateway-live');

    render(
      <App
        initialSnapshot={createSessionSnapshot('monitor:gateway-seed')}
        connectSocket={(_url, onMessage) => {
          onMessage(liveSnapshot);
          return {
            close: () => undefined,
          } as WebSocket;
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('monitor:gateway-live')).toBeInTheDocument();
    });
  });
});
