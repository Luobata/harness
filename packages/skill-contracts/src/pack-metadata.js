import path from 'node:path';
import { z } from 'zod';
const nonEmptyString = z.string().trim().min(1);
const semverLikeVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*))*))?(?:\+([\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?$/;
const integrityPattern = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
const semverLikeVersionString = nonEmptyString.regex(semverLikeVersionPattern, 'version must be a semver-like string');
const integrityString = nonEmptyString.regex(integrityPattern, 'integrity must be a structured integrity string');
const isAbsolutePath = (value) => {
    const normalized = value.replaceAll('\\', '/');
    return path.posix.isAbsolute(normalized) || path.win32.isAbsolute(value);
};
const absolutePathString = (fieldName) => nonEmptyString.refine(isAbsolutePath, `${fieldName} must be an absolute path`);
export const PackMetadataSchema = z.object({
    name: nonEmptyString,
    cocoInstallName: nonEmptyString,
    version: semverLikeVersionString,
    artifactPath: absolutePathString('artifactPath'),
    packedAt: z.string().datetime(),
    integrity: integrityString,
    fileCount: z.number().int().nonnegative(),
    unpackedSize: z.number().int().nonnegative(),
}).strict();
