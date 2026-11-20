import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import WebSocket from 'ws';
import { createSyncServer } from '../server/index.js';

const require = createRequire(import.meta.url);
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_PORT = 12345;
const TEST_DATA_DIR = path.join(__dirname, 'test_server_data');

function waitForSync(provider) {
  return new Promise((resolve) => {
    if (provider.synced) {
      resolve();
    } else {
      provider.once('synced', () => resolve());
    }
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Phase 1: Server and Core Persistence Verification', async (t) => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });

  const syncServer = createSyncServer({
    port: TEST_PORT,
    host: '127.0.0.1',
    dataDir: TEST_DATA_DIR,
    verbose: false
  });

  await syncServer.start();

  t.after(async () => {
    await syncServer.stop();
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  await t.test('1. Health check endpoint responds with 200 OK and valid JSON + CORS', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');

    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.service, 'offcode-sync-server');
    assert.strictEqual(typeof body.uptime, 'number');
    assert.strictEqual(typeof body.roomsCount, 'number');
  });

  await t.test('2. 4+ simultaneous users can connect to the same room and edit concurrently', async () => {
    const roomId = 'hackathon-collab-room';
    const numClients = 5;
    const clients = [];

    for (let i = 0; i < numClients; i++) {
      const doc = new Y.Doc();
      const provider = new WebsocketProvider(
        `ws://127.0.0.1:${TEST_PORT}`,
        roomId,
        doc,
        { WebSocketPolyfill: WebSocket }
      );
      clients.push({ id: i, doc, provider });
    }

    await Promise.all(clients.map(c => waitForSync(c.provider)));

    // Client 0 creates 'main.js'
    const client0Files = clients[0].doc.getMap('files');
    const client0Text = new Y.Text();
    client0Files.set('main.js', client0Text);

    await delay(100);

    // All 5 clients insert unique lines concurrently
    for (let i = 0; i < numClients; i++) {
      const filesMap = clients[i].doc.getMap('files');
      const text = filesMap.get('main.js');
      assert.ok(text, `Client ${i} must see main.js`);
      text.insert(text.length, `// Client ${i} edit\n`);
    }

    await delay(300);

    const expected = clients[0].doc.getMap('files').get('main.js').toString();
    for (let i = 1; i < numClients; i++) {
      const clientText = clients[i].doc.getMap('files').get('main.js').toString();
      assert.strictEqual(clientText, expected, `Client ${i} text must match Client 0`);
    }

    for (let i = 0; i < numClients; i++) {
      assert.ok(expected.includes(`// Client ${i} edit`), `Missing edit from client ${i}`);
    }

    clients.forEach(c => {
      c.provider.destroy();
      c.doc.destroy();
    });
  });

  await t.test('3. Multi-room isolation', async () => {
    const roomA = 'room-alpha';
    const roomB = 'room-beta';

    const docA = new Y.Doc();
    const providerA = new WebsocketProvider(`ws://127.0.0.1:${TEST_PORT}`, roomA, docA, { WebSocketPolyfill: WebSocket });

    const docB = new Y.Doc();
    const providerB = new WebsocketProvider(`ws://127.0.0.1:${TEST_PORT}`, roomB, docB, { WebSocketPolyfill: WebSocket });

    await Promise.all([waitForSync(providerA), waitForSync(providerB)]);

    docA.getMap('files').set('alpha.txt', new Y.Text('Only in Alpha'));
    docB.getMap('files').set('beta.txt', new Y.Text('Only in Beta'));

    await delay(200);

    assert.ok(docA.getMap('files').has('alpha.txt'), 'Room A must have alpha.txt');
    assert.strictEqual(docA.getMap('files').has('beta.txt'), false, 'Room A must NOT have beta.txt');

    assert.ok(docB.getMap('files').has('beta.txt'), 'Room B must have beta.txt');
    assert.strictEqual(docB.getMap('files').has('alpha.txt'), false, 'Room B must NOT have alpha.txt');

    providerA.destroy();
    docA.destroy();
    providerB.destroy();
    docB.destroy();
  });

  await t.test('4. Disk persistence survives server restart and late joiners get full state', async () => {
    const roomId = 'persistent-hackathon-room';
    const doc1 = new Y.Doc();
    const provider1 = new WebsocketProvider(`ws://127.0.0.1:${TEST_PORT}`, roomId, doc1, { WebSocketPolyfill: WebSocket });
    await waitForSync(provider1);

    const files = doc1.getMap('files');
    const text = new Y.Text();
    text.insert(0, 'console.log("Persisted across server restart!");');
    files.set('app.js', text);

    await delay(300);

    provider1.destroy();
    doc1.destroy();

    const expectedFilePath = syncServer.persistence.getFilePath(roomId);
    assert.ok(fs.existsSync(expectedFilePath), `Persistence file must exist at ${expectedFilePath}`);
    assert.ok(fs.statSync(expectedFilePath).size > 0, 'Persistence file must not be empty');

    // Evict room from in-memory cache to simulate server restart
    if (syncServer.docs.has(roomId)) {
      syncServer.docs.delete(roomId);
    }

    // Late joiner connects
    const docLate = new Y.Doc();
    const providerLate = new WebsocketProvider(`ws://127.0.0.1:${TEST_PORT}`, roomId, docLate, { WebSocketPolyfill: WebSocket });
    await waitForSync(providerLate);

    const lateFiles = docLate.getMap('files');
    const lateText = lateFiles.get('app.js');
    assert.ok(lateText, 'Late joiner must see app.js restored from disk');
    assert.strictEqual(lateText.toString(), 'console.log("Persisted across server restart!");');

    providerLate.destroy();
    docLate.destroy();
  });
});
