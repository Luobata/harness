import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@monitor/protocol': fileURLToPath(new URL('./src/monitor/protocol/index.ts', import.meta.url)),
      '@monitor/runtime-store': fileURLToPath(new URL('./src/monitor/runtime-store/index.ts', import.meta.url)),
      '@monitor/monitor-gateway': fileURLToPath(new URL('./src/monitor/gateway/index.ts', import.meta.url)),
      '@monitor/monitor-skill': fileURLToPath(new URL('./src/monitor/skill/index.ts', import.meta.url)),
      '@monitor/host-coco-hook': fileURLToPath(new URL('./src/monitor/host-coco/index.ts', import.meta.url)),
      '@monitor/host-claude-code-hook': fileURLToPath(new URL('./src/monitor/host-claude/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 4173,
  },
});
