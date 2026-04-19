import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import type { BoardEvent } from '@monitor/protocol';
import { SessionRegistry } from './session-registry';

interface GatewayClient {
  readyState: number;
  send(payload: string): void;
}

interface GatewayWebSocketServer {
  clients: Set<GatewayClient>;
  address(): AddressInfo | string | null;
  close(callback: (error?: Error) => void): void;
  on(event: 'connection', listener: (client: GatewayClient) => void): void;
}

type WebSocketServerConstructor = new (options: { port: number }) => GatewayWebSocketServer;

const require = createRequire(import.meta.url);
const wsModule = require('ws') as {
  WebSocket: { OPEN: number };
  WebSocketServer: WebSocketServerConstructor;
};

export const createGatewayServer = (port = 8787) => {
  const registry = new SessionRegistry();
  const server = new wsModule.WebSocketServer({ port });

  const sendSnapshot = (client: GatewayClient, payload: string) => {
    if (client.readyState === wsModule.WebSocket.OPEN) {
      client.send(payload);
    }
  };

  server.on('connection', (client) => {
    registry.listSnapshots().forEach((snapshot) => {
      sendSnapshot(client, JSON.stringify(snapshot));
    });
  });

  const publish = (event: BoardEvent) => {
    const snapshot = registry.append(event);
    const payload = JSON.stringify(snapshot);

    server.clients.forEach((client) => {
      sendSnapshot(client, payload);
    });

    return snapshot;
  };

  return {
    server,
    registry,
    publish,
  };
};
