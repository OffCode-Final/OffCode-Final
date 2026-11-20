import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import 'fake-indexeddb/auto';

import { createSyncServer } from '../server/index.js';
import { createWorkspace, getUserId, getDefaultSyncServerUrl } from '../client/src/sync/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_PORT = 12349;
const TEST_SERVER_URL = `ws://127.0.0.1:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(__dirname, 'test_contract_data');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createClient(options) {
  return createWorkspace({
    serverUrl: TEST_SERVER_URL,
    WebSocketPolyfill: WebSocket,
    disableIndexedDB: true,
    ...options
  });
}

test('Step 1 Contract Verification Suite', async (t) => {
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

  await t.test('Contract API Surface: All contract & addendum properties exist with exact types', async () => {
    const ws = createClient({ roomId: 'contract-surface-room', userName: 'Alice', userId: 'user_alice' });
    await ws.whenReady;

    // Base contract properties
    assert.ok(ws.ydoc, 'ydoc must exist');
    assert.ok(ws.files, 'files Y.Map must exist');
    assert.ok(ws.awareness, 'awareness must exist');
    assert.strictEqual(typeof ws.getText, 'function', 'getText must be a function');
    assert.strictEqual(typeof ws.listFiles, 'function', 'listFiles must be a function');
    assert.strictEqual(typeof ws.createFile, 'function', 'createFile must be a function');
    assert.strictEqual(typeof ws.deleteFile, 'function', 'deleteFile must be a function');
    assert.strictEqual(typeof ws.onFilesChange, 'function', 'onFilesChange must be a function');
    assert.strictEqual(typeof ws.getStatus, 'function', 'getStatus must be a function');
    assert.strictEqual(typeof ws.onStatusChange, 'function', 'onStatusChange must be a function');
    assert.strictEqual(typeof ws.goOffline, 'function', 'goOffline must be a function');
    assert.strictEqual(typeof ws.goOnline, 'function', 'goOnline must be a function');
    assert.ok(ws.whenReady instanceof Promise, 'whenReady must be a Promise');
    assert.strictEqual(typeof ws.destroy, 'function', 'destroy must be a function');

    // Addendum methods
    assert.strictEqual(typeof ws.getUserId, 'function', 'getUserId must be a function');
    assert.strictEqual(typeof ws.getHostId, 'function', 'getHostId must be a function');
    assert.strictEqual(typeof ws.getHost, 'function', 'getHost must be a function');
    assert.strictEqual(typeof ws.isHost, 'function', 'isHost must be a function');
    assert.strictEqual(typeof ws.claimHost, 'function', 'claimHost must be a function');
    assert.strictEqual(typeof ws.transferHost, 'function', 'transferHost must be a function');
    assert.strictEqual(typeof ws.getMode, 'function', 'getMode must be a function');
    assert.strictEqual(typeof ws.setMode, 'function', 'setMode must be a function');
    assert.strictEqual(typeof ws.onMetaChange, 'function', 'onMetaChange must be a function');
    assert.strictEqual(typeof ws.getDraft, 'function', 'getDraft must be a function');
    assert.strictEqual(typeof ws.getDraftBase, 'function', 'getDraftBase must be a function');
    assert.strictEqual(typeof ws.pushDraft, 'function', 'pushDraft must be a function');
    assert.strictEqual(typeof ws.listProposals, 'function', 'listProposals must be a function');
    assert.strictEqual(typeof ws.onProposalsChange, 'function', 'onProposalsChange must be a function');
    assert.strictEqual(typeof ws.acceptProposal, 'function', 'acceptProposal must be a function');
    assert.strictEqual(typeof ws.rejectProposal, 'function', 'rejectProposal must be a function');
    assert.strictEqual(typeof ws.revertProposal, 'function', 'revertProposal must be a function');

    ws.destroy();
  });

  await t.test('Host & Mode Semantics: getHostId(), alias getHost(), and live/review mode mapping', async () => {
    const ws = createClient({ roomId: 'host-mode-room', userName: 'HostGuy', userId: 'host_id_123' });
    await ws.whenReady;
    await delay(100);

    // Initial host check
    assert.strictEqual(ws.getHostId(), 'host_id_123', 'getHostId() must return initial host');
    assert.strictEqual(ws.getHost(), 'host_id_123', 'getHost() alias must return initial host');
    assert.strictEqual(ws.isHost(), true, 'isHost() must be true for room creator');

    // Mode defaults to 'live'
    assert.strictEqual(ws.getMode(), 'live', 'Default mode must be "live"');

    // Host can change mode to 'review' and back to 'live'
    assert.strictEqual(ws.setMode('review'), true, 'Host can switch to review mode');
    assert.strictEqual(ws.getMode(), 'review', 'Mode must now be review');

    assert.strictEqual(ws.setMode('live'), true, 'Host can switch back to live mode');
    assert.strictEqual(ws.getMode(), 'live', 'Mode must now be live');

    // Test backward compatibility: if meta.mode was legacy 'free', it maps to 'live'
    ws.meta.set('mode', 'free');
    assert.strictEqual(ws.getMode(), 'live', 'Legacy "free" mode must map to "live"');

    ws.destroy();
  });

  await t.test('Safe User ID Generation: works without crypto.randomUUID', () => {
    const id1 = getUserId();
    const id2 = getUserId();
    assert.ok(id1.startsWith('user_'), 'User ID must start with user_');
    assert.ok(id2.startsWith('user_'), 'User ID must start with user_');
    assert.notStrictEqual(id1, id2, 'User IDs should be unique');
  });

  await t.test('Room code normalization: case-insensitive and trimmed', async () => {
    const client1 = createClient({ roomId: '  TestRoom-123  ', userName: 'Alice', userId: 'user_a' });
    await client1.whenReady;

    client1.createFile('shared.txt', 'Hello from room with spaces and capitals');
    await delay(100);

    const client2 = createClient({ roomId: 'testroom-123', userName: 'Bob', userId: 'user_b' });
    await client2.whenReady;
    await delay(150);

    assert.ok(client2.listFiles().includes('shared.txt'), 'client2 must see files created by client1 with normalized room code');
    assert.strictEqual(client2.getText('shared.txt').toString(), 'Hello from room with spaces and capitals');

    client1.destroy();
    client2.destroy();
  });
});
