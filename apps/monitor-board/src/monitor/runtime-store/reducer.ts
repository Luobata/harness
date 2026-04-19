import type { BoardEvent } from '@monitor/protocol';
import type { ActorNode, BoardState } from './state';

const compareEventOrder = (left: Pick<BoardEvent, 'timestamp' | 'sequence'>, right: Pick<BoardEvent, 'timestamp' | 'sequence'>) => {
  if (left.timestamp === right.timestamp) {
    return left.sequence - right.sequence;
  }

  return left.timestamp.localeCompare(right.timestamp);
};

const insertTimelineEvent = (timeline: BoardEvent[], event: BoardEvent): BoardEvent[] => {
  const nextTimeline = [...timeline, event];
  nextTimeline.sort(compareEventOrder);
  return nextTimeline;
};

const isEventNewer = (previous: ActorNode | undefined, event: BoardEvent) => {
  if (!previous) {
    return true;
  }

  return (
    compareEventOrder(
      { timestamp: previous.lastEventAt, sequence: previous.lastEventSequence },
      { timestamp: event.timestamp, sequence: event.sequence },
    ) <= 0
  );
};

const mergeChildren = (actors: Map<string, ActorNode>, actorId: string, currentChildren: string[]) => {
  const discoveredChildren = [...actors.values()]
    .filter((node) => node.parentActorId === actorId)
    .map((node) => node.id);

  return Array.from(new Set([...currentChildren, ...discoveredChildren]));
};

const updateParentChildLink = (
  actors: Map<string, ActorNode>,
  actorId: string,
  previousParentActorId: string | null,
  nextParentActorId: string | null,
) => {
  if (previousParentActorId && previousParentActorId !== nextParentActorId) {
    const previousParent = actors.get(previousParentActorId);

    if (previousParent) {
      actors.set(previousParentActorId, {
        ...previousParent,
        children: previousParent.children.filter((childId) => childId !== actorId),
      });
    }
  }

  if (nextParentActorId) {
    const nextParent = actors.get(nextParentActorId);

    if (nextParent && !nextParent.children.includes(actorId)) {
      actors.set(nextParentActorId, {
        ...nextParent,
        children: [...nextParent.children, actorId],
      });
    }
  }
};

export const reduceBoardEvent = (state: BoardState, event: BoardEvent): BoardState => {
  const actors = new Map(state.actors);
  const previous = actors.get(event.actorId);
  const eventIsNewest = isEventNewer(previous, event);

  const parentActorId = eventIsNewest ? event.parentActorId : (previous?.parentActorId ?? event.parentActorId);
  const children = mergeChildren(actors, event.actorId, previous?.children ?? []);

  const nextNode: ActorNode = {
    id: event.actorId,
    parentActorId,
    actorType: eventIsNewest ? event.actorType : (previous?.actorType ?? event.actorType),
    status: eventIsNewest ? event.status : (previous?.status ?? event.status),
    summary: eventIsNewest ? event.summary : (previous?.summary ?? event.summary),
    model: eventIsNewest ? event.model : (previous?.model ?? event.model),
    toolName: eventIsNewest ? event.toolName : (previous?.toolName ?? event.toolName),
    totalTokens: (previous?.totalTokens ?? 0) + event.tokenIn + event.tokenOut,
    elapsedMs: Math.max(previous?.elapsedMs ?? 0, event.elapsedMs),
    children,
    lastEventAt: eventIsNewest ? event.timestamp : (previous?.lastEventAt ?? event.timestamp),
    lastEventSequence: eventIsNewest ? event.sequence : (previous?.lastEventSequence ?? event.sequence),
  };

  actors.set(event.actorId, nextNode);
  updateParentChildLink(actors, event.actorId, previous?.parentActorId ?? null, nextNode.parentActorId);

  return {
    actors,
    timeline: insertTimelineEvent(state.timeline, event),
  };
};
