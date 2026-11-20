import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import 'fake-indexeddb/auto';

import { createSyncServer } from '../server/index.js';
import { createWorkspace } from '../client/src/sync/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_PORT = 12352;
const TEST_DATA_DIR = path.join(__dirname, 'test_lan_data');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const LAN_IP = getLanIp();
const LAN_WS_URL = `ws://${LAN_IP}:${TEST_PORT}`;
const LAN_HTTP_URL = `http://${LAN_IP}:${TEST_PORT}`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createClient({ roomId, userName, userColor, userId, disableIndexedDB = true }) {
  return createWorkspace({
    roomId,
    userName,
    userColor,
    userId,
    serverUrl: LAN_WS_URL,
    WebSocketPolyfill: WebSocket,
    disableIndexedDB
  });
}

test('Step 3 & 4: LAN Simulation & Server Hardening Suite', async (t) => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });

  let syncServer = createSyncServer({
    port: TEST_PORT,
    host: '0.0.0.0', // Bind all interfaces including LAN
    dataDir: TEST_DATA_DIR,
    verbose: false
  });
  await syncServer.start();

  t.after(async () => {
    if (syncServer) {
      await syncServer.stop();
    }
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  await t.test('1. HTTP One-Link: Serves static SPA and conforms to Health API contract', async () => {
    // Check Health endpoint returns all required fields
    const healthRes = await fetch(`${LAN_HTTP_URL}/health`);
    assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200 OK');
    const health = await healthRes.json();
    assert.strictEqual(health.status, 'ok');
    assert.strictEqual(typeof health.uptime, 'number');
    assert.strictEqual(typeof health.rooms, 'number');
    assert.strictEqual(typeof health.clientsCount, 'number');
    assert.ok(health.memory && typeof health.memory.heapUsed === 'number', 'Memory usage must be reported');

    // Check Root SPA route returns index.html or fallback
    const spaRes = await fetch(`${LAN_HTTP_URL}/my-cool-room`);
    assert.strictEqual(spaRes.status, 200);
    const spaHtml = await spaRes.text();
    assert.ok(spaHtml.includes('<!DOCTYPE html>') || spaHtml.includes('<html'), 'SPA fallback must serve HTML');
  });

  await t.test('2. Real Two-Device LAN Simulation: Live Sync, Review Mode, & Offline Merge over LAN IP', async () => {
    const room = 'hackathon-lan-room-42';

    // Laptop A (Host) joins via LAN IP
    const laptopA = createClient({
      roomId: room,
      userName: 'Alice (Laptop A)',
      userColor: '#10b981',
      userId: 'user_laptop_a'
    });
    await laptopA.whenReady;
    await delay(150);

    // Laptop B (Guest) joins via LAN IP
    const laptopB = createClient({
      roomId: room,
      userName: 'Bob (Laptop B)',
      userColor: '#6366f1',
      userId: 'user_laptop_b'
    });
    await laptopB.whenReady;
    await delay(200);

    // Verify host assignment
    assert.strictEqual(laptopA.isHost(), true, 'Laptop A should be host');
    assert.strictEqual(laptopB.isHost(), false, 'Laptop B should be guest');
    assert.strictEqual(laptopB.getHostId(), 'user_laptop_a', 'Laptop B should recognise Laptop A as host');

    // 2A. Live concurrent typing over LAN
    laptopA.createFile('solution.py', 'def solve():\n');
    await delay(150);

    assert.ok(laptopB.listFiles().includes('solution.py'), 'Laptop B should see created file over LAN');
    laptopB.getText('solution.py').insert(13, '    return 42\n');
    await delay(150);

    assert.strictEqual(
      laptopA.getText('solution.py').toString(),
      'def solve():\n    return 42\n',
      'Laptop A and B must converge on live text over LAN'
    );

    // 2B. Review mode (Host Approval) over LAN
    laptopA.setMode('review');
    await delay(100);
    assert.strictEqual(laptopB.getMode(), 'review', 'Laptop B must observe review mode switch');

    const bobDraft = laptopB.getDraft('solution.py');
    bobDraft.insert(bobDraft.length, 'print(solve())\n');
    const proposalId = laptopB.pushDraft('solution.py', 'Add print statement to execute solver');
    await delay(150);

    const proposalsOnHost = laptopA.listProposals();
    assert.strictEqual(proposalsOnHost.length, 1, 'Laptop A must receive the proposal over LAN');
    assert.strictEqual(proposalsOnHost[0].id, proposalId);

    laptopA.acceptProposal(proposalId);
    await delay(150);

    const mergedContent = laptopB.getText('solution.py').toString();
    assert.ok(mergedContent.includes('print(solve())'), 'Proposal must be accepted and patched onto main text over LAN');

    // 2C. Offline merge over LAN
    laptopB.goOffline();
    assert.strictEqual(laptopB.getStatus(), 'offline');

    // Both edit concurrently while B is offline
    laptopA.getText('solution.py').insert(0, '# Author: Alice\n');
    laptopB.getText('solution.py').insert(laptopB.getText('solution.py').length, '# End of file\n');

    laptopB.goOnline();
    await delay(300);

    assert.strictEqual(laptopA.getText('solution.py').toString(), laptopB.getText('solution.py').toString());
    assert.ok(laptopA.getText('solution.py').toString().includes('# Author: Alice'));
    assert.ok(laptopA.getText('solution.py').toString().includes('# End of file'));

    laptopA.destroy();
    laptopB.destroy();
  });

  await t.test('3. Hardening: Malformed messages do not crash server', async () => {
    // Send random binary garbage to the server
    const rawWs = new WebSocket(`${LAN_WS_URL}/junk-test-room`);
    await new Promise((resolve) => rawWs.on('open', resolve));

    const garbageBuffer = Buffer.from([0xff, 0xfe, 0x01, 0x42, 0x99, 0x88]);
    rawWs.send(garbageBuffer);
    await delay(100);

    rawWs.close();
    await delay(50);

    // Verify server is still alive and answering health checks
    const res = await fetch(`${LAN_HTTP_URL}/health`);
    assert.strictEqual(res.status, 200, 'Server must remain alive after receiving malformed packet');
  });

  await t.test('4. Hardening: Host leaves and peer claims host with claimHost()', async () => {
    const room = 'host-abandonment-room';

    const originalHost = createClient({ roomId: room, userName: 'Host1', userId: 'host_one' });
    await originalHost.whenReady;
    await delay(100);

    const peer = createClient({ roomId: room, userName: 'Peer2', userId: 'peer_two' });
    await peer.whenReady;
    await delay(100);

    assert.strictEqual(peer.isHost(), false, 'Peer is initially not host');

    // Host leaves permanently
    originalHost.destroy();
    await delay(350);

    // Peer claims host
    const claimed = peer.claimHost();
    assert.strictEqual(claimed, true, 'Peer successfully claims host when host is absent');
    assert.strictEqual(peer.isHost(), true, 'Peer is now host');
    assert.strictEqual(peer.getHostId(), 'peer_two', 'HostId updated to peer');

    peer.destroy();
  });

  await t.test('5. Hardening: 4+ simultaneous clients with server restart mid-session', async () => {
    const room = 'restart-mid-session-room';
    const clientCount = 4;
    const clients = [];

    for (let i = 0; i < clientCount; i++) {
      const c = createClient({
        roomId: room,
        userName: `User_${i}`,
        userId: `uid_${i}`,
        disableIndexedDB: true
      });
      await c.whenReady;
      clients.push(c);
    }
    await delay(150);

    clients[0].createFile('collab.txt', 'Initial line\n');
    await delay(150);

    for (let i = 0; i < clientCount; i++) {
      clients[i].getText('collab.txt').insert(clients[i].getText('collab.txt').length, `Line from user ${i}\n`);
    }
    await delay(200);

    const textBeforeRestart = clients[0].getText('collab.txt').toString();

    // Restart server mid-session
    await syncServer.stop();
    await delay(150);

    // Start fresh server on same port & data directory
    syncServer = createSyncServer({
      port: TEST_PORT,
      host: '0.0.0.0',
      dataDir: TEST_DATA_DIR,
      verbose: false
    });
    await syncServer.start();
    await delay(400);

    // Connect a 5th late joiner to verify state was restored from disk
    const lateJoiner = createClient({
      roomId: room,
      userName: 'LateJoiner',
      userId: 'uid_late',
      disableIndexedDB: true
    });
    await lateJoiner.whenReady;
    await delay(250);

    assert.strictEqual(
      lateJoiner.getText('collab.txt').toString(),
      textBeforeRestart,
      'Late joiner must receive exact state restored from disk after server restart'
    );

    clients.forEach((c) => c.destroy());
    lateJoiner.destroy();
  });
});
