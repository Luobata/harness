import type { ActorType, BoardEvent, BoardStatus } from '@monitor/protocol';

export interface ActorNode {
  id: string;
  parentActorId: string | null;
  actorType: ActorType;
  status: BoardStatus;
  summary: string;
  model: string | null;
  toolName: string | null;
  totalTokens: number;
  elapsedMs: number;
  children: string[];
  lastEventAt: string;
  lastEventSequence: number;
}

export interface BoardState {
  actors: Map<string, ActorNode>;
  timeline: BoardEvent[];
}

export const createInitialBoardState = (): BoardState => ({
  actors: new Map(),
  timeline: [],
});
