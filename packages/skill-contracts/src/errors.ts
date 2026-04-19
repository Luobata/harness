export const SkillErrorCode = {
  INVALID_MANIFEST: 'INVALID_MANIFEST',
  INVALID_LOCAL_INSTALL_RECORD: 'INVALID_LOCAL_INSTALL_RECORD',
  INVALID_PACK_METADATA: 'INVALID_PACK_METADATA',
  INVALID_SKILL_PATH: 'INVALID_SKILL_PATH',
} as const

export type SkillErrorCode = (typeof SkillErrorCode)[keyof typeof SkillErrorCode]

export interface SkillErrorOptions extends ErrorOptions {
  details?: Record<string, unknown>
}

export class SkillError extends Error {
  readonly code: SkillErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: SkillErrorCode, message: string, options: SkillErrorOptions = {}) {
    super(message, options)

    this.name = 'SkillError'
    this.code = code
    this.details = options.details

    Object.setPrototypeOf(this, new.target.prototype)
  }
}
