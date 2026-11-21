import http from 'node:http';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import qrcode from 'qrcode-terminal';
import { FilePersistence } from './persistence.js';
import { setupWSConnection, setPersistence, docs } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  if (filePath.includes(path.sep + 'assets' + path.sep)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }

  res.writeHead(200, { 'Content-Type': contentType });
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });
  stream.pipe(res);
}

export function createSyncServer({
  port = parseInt(process.env.PORT || '1234', 10),
  host = process.env.HOST || '0.0.0.0',
  dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'),
  clientDir = process.env.CLIENT_DIR || path.resolve(__dirname, '../client/dist'),
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
    const pathname = parsedUrl.pathname;

    // Health endpoint
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime()
      }));
      return;
    }

    // Active rooms status endpoint
    if (pathname === '/rooms') {
      if (process.env.NODE_ENV === 'production') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

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

    // Static Client Assets & SPA Fallback
    if (req.method === 'GET' || req.method === 'HEAD') {
      const decodedPath = decodeURIComponent(pathname);
      const filePath = path.resolve(clientDir, '.' + decodedPath);

      // Prevent directory traversal attacks
      if (filePath.startsWith(clientDir) && fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          serveFile(res, filePath);
          return;
        }
      }

      // SPA fallback: any route without matching file serves index.html
      const indexPath = path.join(clientDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        serveFile(res, indexPath);
        return;
      }

      // Friendly fallback if client is not built yet
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>OffCode Sync Server</title></head>
<body style="font-family:sans-serif;padding:2rem;">
  <h2>OffCode Sync Server Running</h2>
  <p>To view the web editor, run <code>npm run build</code> in the root folder to build the client.</p>
  <p>WebSocket sync endpoint: <code>ws://&lt;host&gt;:${port}/&lt;roomId&gt;</code></p>
  <p>Health check: <a href="/health">/health</a></p>
</body>
</html>`);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  // WebSocket Server for Yjs Sync with 10MB payload limit
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 10 * 1024 * 1024
  });

  wss.on('connection', (ws, req) => {
    ws.on('error', (err) => {
      if (verbose) {
        console.warn('[Yjs Server] Client socket warning:', err.message);
      }
    });

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const rawRoom = parsedUrl.pathname.slice(1);
    // Room codes are case-insensitive and trimmed
    const roomName = decodeURIComponent(rawRoom || 'default').trim().toLowerCase();

    setupWSConnection(ws, req, { docName: roomName });
  });

  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {
      try {
        socket.destroy();
      } catch (_) {}
    });

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
        const networkInterfaces = os.networkInterfaces();
        const lanIps = [];
        for (const name of Object.keys(networkInterfaces)) {
          for (const iface of networkInterfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
              lanIps.push(iface.address);
            }
          }
        }

        console.log(`====================================================`);
        console.log(`🚀 OffCode All-in-One Server running on port ${port}`);
        console.log(`💻 Local URL:        http://localhost:${port}`);
        console.log(`📡 WebSocket URL:    ws://localhost:${port}/<roomId>`);
        console.log(`🩺 Health check:     http://localhost:${port}/health`);

        if (lanIps.length > 0) {
          console.log(`\n🌐 Share these link(s) with your friend on the same Wi-Fi:`);
          lanIps.forEach((ip) => {
            console.log(`   👉 http://${ip}:${port}`);
          });

          const primaryUrl = `http://${lanIps[0]}:${port}`;
          console.log(`\n📱 Scan this QR code on a phone or second device:`);
          try {
            qrcode.generate(primaryUrl, { small: true });
          } catch (_) {}
        }
        console.log(`💾 Persistence dir: ${dataDir}`);
        console.log(`📦 Serving SPA from: ${clientDir}`);
        console.log(`====================================================\n`);
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
