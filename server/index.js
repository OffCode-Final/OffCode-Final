import http from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { FilePersistence } from './persistence.js';
import { setupWSConnection, setPersistence, docs } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createSyncServer({
  port = parseInt(process.env.PORT || '1234', 10),
  host = process.env.HOST || '0.0.0.0',
  dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'),
  verbose = true
} = {}) {
  const persistence = new FilePersistence(dataDir);
  setPersistence(persistence);

  const server = http.createServer((req, res) => {
    // Global CORS headers for cross-origin access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Health endpoint
    if (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/') {
      let totalConnections = 0;
      for (const doc of docs.values()) {
        totalConnections += doc.conns ? doc.conns.size : 0;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'offcode-sync-server',
        version: '1.0.0',
        uptime: process.uptime(),
        roomsCount: docs.size,
        activeConnections: totalConnections,
        persistenceDir: dataDir,
        timestamp: new Date().toISOString()
      }, null, 2));
      return;
    }

    // Active rooms status endpoint
    if (parsedUrl.pathname === '/rooms') {
      const roomList = [];
      for (const [name, doc] of docs.entries()) {
        roomList.push({
          room: name,
          connections: doc.conns ? doc.conns.size : 0,
          awarenessUsers: doc.awareness ? doc.awareness.getStates().size : 0
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ rooms: roomList }, null, 2));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, req) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const rawRoom = parsedUrl.pathname.slice(1);
    const roomName = decodeURIComponent(rawRoom || 'default');

    setupWSConnection(ws, req, { docName: roomName });
  });

  server.on('upgrade', (request, socket, head) => {
    const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Don't upgrade plain HTTP endpoints
    if (pathname === '/health' || pathname === '/rooms') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  let running = false;

  const start = () => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      running = true;
      if (verbose) {
        console.log(`====================================================`);
        console.log(`🚀 Offcode Yjs Sync Server running on port ${port}`);
        console.log(`📡 Local address:   ws://localhost:${port}/<roomId>`);
        console.log(`🩺 Health check:    http://localhost:${port}/health`);

        const networkInterfaces = os.networkInterfaces();
        for (const name of Object.keys(networkInterfaces)) {
          for (const iface of networkInterfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
              console.log(`🌐 LAN address:     ws://${iface.address}:${port}/<roomId>`);
            }
          }
        }
        console.log(`💾 Persistence dir: ${dataDir}`);
        console.log(`====================================================`);
      }
      resolve({ port, host, server, wss, persistence, docs });
    });
  });

  const stop = () => new Promise((resolve) => {
    if (!running) {
      resolve();
      return;
    }
    try {
      persistence.flushAll(docs);
    } catch (e) {
      console.error('Error flushing persistence:', e);
    }

    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch (_) {}
    }

    wss.close(() => {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close(() => {
        running = false;
        resolve();
      });
    });
  });

  return { server, wss, persistence, docs, start, stop, port, host };
}

// Auto-start when executed directly from CLI: `node server/index.js`
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename) ||
  process.argv[1].endsWith('server/index.js') ||
  process.argv[1].endsWith('server\\index.js')
);

if (isMain) {
  const instance = createSyncServer({ verbose: true });
  instance.start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  let isShuttingDown = false;
  const handleShutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Server] Received ${signal}. Shutting down cleanly...`);
    instance.stop().then(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}
