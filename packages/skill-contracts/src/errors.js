export const SkillErrorCode = {
    INVALID_MANIFEST: 'INVALID_MANIFEST',
    INVALID_LOCAL_INSTALL_RECORD: 'INVALID_LOCAL_INSTALL_RECORD',
    INVALID_PACK_METADATA: 'INVALID_PACK_METADATA',
    INVALID_SKILL_PATH: 'INVALID_SKILL_PATH',
};
export class SkillError extends Error {
    code;
    details;
    constructor(code, message, options = {}) {
        super(message, options);
        this.name = 'SkillError';
        this.code = code;
        this.details = options.details;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
