export declare const SkillErrorCode: {
    readonly INVALID_MANIFEST: "INVALID_MANIFEST";
    readonly INVALID_LOCAL_INSTALL_RECORD: "INVALID_LOCAL_INSTALL_RECORD";
    readonly INVALID_PACK_METADATA: "INVALID_PACK_METADATA";
    readonly INVALID_SKILL_PATH: "INVALID_SKILL_PATH";
};
export type SkillErrorCode = (typeof SkillErrorCode)[keyof typeof SkillErrorCode];
export interface SkillErrorOptions extends ErrorOptions {
    details?: Record<string, unknown>;
}
export declare class SkillError extends Error {
    readonly code: SkillErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: SkillErrorCode, message: string, options?: SkillErrorOptions);
}
