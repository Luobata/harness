import { describe, expect, it } from 'vitest';
import { openMonitorSession } from './monitor-command';

describe('openMonitorSession', () => {
  it('creates a monitor for the root actor when no monitor exists', () => {
    const result = openMonitorSession({
      rootSessionId: 'session-1',
      requesterActorId: 'lead-1',
      isRootActor: true,
      existingMonitorSessionId: null,
    });

    expect(result).toEqual({
      kind: 'create',
      monitorSessionId: 'monitor:session-1',
      message: 'Created monitor monitor:session-1 for root actor lead-1',
    });
  });

  it('attaches a child actor to an existing monitor', () => {
    const result = openMonitorSession({
      rootSessionId: 'session-1',
      requesterActorId: 'worker-1',
      isRootActor: false,
      existingMonitorSessionId: 'monitor:session-1',
    });

    expect(result).toEqual({
      kind: 'attach',
      monitorSessionId: 'monitor:session-1',
      message: 'Attached actor worker-1 to existing monitor monitor:session-1',
    });
  });

  it('prevents a child actor from creating a nested monitor when none exists locally', () => {
    const result = openMonitorSession({
      rootSessionId: 'session-1',
      requesterActorId: 'worker-2',
      isRootActor: false,
      existingMonitorSessionId: null,
    });

    expect(result).toEqual({
      kind: 'attach',
      monitorSessionId: 'monitor:session-1',
      message: 'Child actor worker-2 cannot create a nested monitor; attach to monitor:session-1',
    });
  });
});
