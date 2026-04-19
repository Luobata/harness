import { z } from 'zod';
export declare const PackMetadataSchema: z.ZodObject<{
    name: z.ZodString;
    cocoInstallName: z.ZodString;
    version: z.ZodString;
    artifactPath: z.ZodEffects<z.ZodString, string, string>;
    packedAt: z.ZodString;
    integrity: z.ZodString;
    fileCount: z.ZodNumber;
    unpackedSize: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    name: string;
    cocoInstallName: string;
    version: string;
    integrity: string;
    artifactPath: string;
    packedAt: string;
    fileCount: number;
    unpackedSize: number;
}, {
    name: string;
    cocoInstallName: string;
    version: string;
    integrity: string;
    artifactPath: string;
    packedAt: string;
    fileCount: number;
    unpackedSize: number;
}>;
export type PackMetadata = z.infer<typeof PackMetadataSchema>;
