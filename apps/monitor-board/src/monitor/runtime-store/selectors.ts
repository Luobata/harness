import type { BoardState } from './state';

export interface TopBarStats {
  actorCount: number;
  activeCount: number;
  blockedCount: number;
  totalTokens: number;
  elapsedMs: number;
}

export const selectTopBarStats = (state: BoardState): TopBarStats => {
  const actors = [...state.actors.values()];

  return {
    actorCount: actors.length,
    activeCount: actors.filter((actor) => actor.status === 'active').length,
    blockedCount: actors.filter((actor) => actor.status === 'blocked').length,
    totalTokens: actors.reduce((total, actor) => total + actor.totalTokens, 0),
    elapsedMs: actors.reduce((longest, actor) => Math.max(longest, actor.elapsedMs), 0),
  };
};

export const selectVisibleTimeline = (state: BoardState, actorId?: string | null) => {
  if (!actorId) {
    return state.timeline;
  }

  return state.timeline.filter((event) => event.actorId === actorId);
};
