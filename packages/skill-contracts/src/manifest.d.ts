import { z } from 'zod';
export declare const SkillManifestSchema: z.ZodObject<{
    name: z.ZodString;
    displayName: z.ZodString;
    entry: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    cocoInstallName: z.ZodString;
    version: z.ZodString;
    files: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    dev: z.ZodObject<{
        link: z.ZodBoolean;
        publishLocal: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        link: boolean;
        publishLocal: boolean;
    }, {
        link: boolean;
        publishLocal: boolean;
    }>;
    metadata: z.ZodObject<{
        description: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        description: string;
        tags: string[];
    }, {
        description: string;
        tags: string[];
    }>;
}, "strict", z.ZodTypeAny, {
    name: string;
    displayName: string;
    entry: string;
    cocoInstallName: string;
    version: string;
    files: string[];
    dev: {
        link: boolean;
        publishLocal: boolean;
    };
    metadata: {
        description: string;
        tags: string[];
    };
}, {
    name: string;
    displayName: string;
    entry: string;
    cocoInstallName: string;
    version: string;
    files: string[];
    dev: {
        link: boolean;
        publishLocal: boolean;
    };
    metadata: {
        description: string;
        tags: string[];
    };
}>;
export type SkillManifest = z.infer<typeof SkillManifestSchema>;
