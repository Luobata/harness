export interface OpenMonitorSessionInput {
  rootSessionId: string
  requesterActorId: string
  isRootActor: boolean
  existingMonitorSessionId: string | null
}

export interface OpenMonitorSessionResult {
  kind: 'create' | 'attach'
  monitorSessionId: string
  message: string
}

export const deriveMonitorSessionId = (rootSessionId: string): string => `monitor:${rootSessionId}`

export const openMonitorSession = (input: OpenMonitorSessionInput): OpenMonitorSessionResult => {
  const monitorSessionId = input.existingMonitorSessionId ?? deriveMonitorSessionId(input.rootSessionId)

  if (input.existingMonitorSessionId) {
    return {
      kind: 'attach',
      monitorSessionId,
      message: `Attached actor ${input.requesterActorId} to existing monitor ${monitorSessionId}`,
    }
  }

  if (!input.isRootActor) {
    return {
      kind: 'attach',
      monitorSessionId,
      message: `Child actor ${input.requesterActorId} cannot create a nested monitor; attach to ${monitorSessionId}`,
    }
  }

  return {
    kind: 'create',
    monitorSessionId,
    message: `Created monitor ${monitorSessionId} for root actor ${input.requesterActorId}`,
  }
}
