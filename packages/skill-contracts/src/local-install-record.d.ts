import { z } from 'zod';
export declare const LocalInstallStateSchema: z.ZodEnum<["linked", "published-local"]>;
export declare const LocalInstallModeSchema: z.ZodEnum<["linked", "published-local"]>;
export declare const LocalInstallRecordSchema: z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{
    name: z.ZodString;
    cocoInstallName: z.ZodString;
    version: z.ZodString;
    installedAt: z.ZodString;
} & {
    mode: z.ZodLiteral<"linked">;
    sourcePath: z.ZodEffects<z.ZodString, string, string>;
}, "strict", z.ZodTypeAny, {
    name: string;
    cocoInstallName: string;
    version: string;
    installedAt: string;
    mode: "linked";
    sourcePath: string;
}, {
    name: string;
    cocoInstallName: string;
    version: string;
    installedAt: string;
    mode: "linked";
    sourcePath: string;
}>, z.ZodObject<{
    name: z.ZodString;
    cocoInstallName: z.ZodString;
    version: z.ZodString;
    installedAt: z.ZodString;
} & {
    mode: z.ZodLiteral<"published-local">;
    packPath: z.ZodEffects<z.ZodString, string, string>;
    integrity: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    name: string;
    cocoInstallName: string;
    version: string;
    installedAt: string;
    mode: "published-local";
    packPath: string;
    integrity?: string | undefined;
}, {
    name: string;
    cocoInstallName: string;
    version: string;
    installedAt: string;
    mode: "published-local";
    packPath: string;
    integrity?: string | undefined;
}>]>;
export type LocalInstallState = z.infer<typeof LocalInstallStateSchema>;
export type LocalInstallMode = z.infer<typeof LocalInstallModeSchema>;
export type LocalInstallRecord = z.infer<typeof LocalInstallRecordSchema>;
