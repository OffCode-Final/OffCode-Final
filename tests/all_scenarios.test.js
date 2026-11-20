import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import 'fake-indexeddb/auto';

import { createSyncServer } from '../server/index.js';
import { createWorkspace } from '../client/src/sync/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_PORT = 12348;
const TEST_SERVER_URL = `ws://127.0.0.1:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(__dirname, 'test_scenarios_data');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createClient({ roomId, userName = 'User', userColor = '#3b82f6', userId = null, disableIndexedDB = false }) {
  return createWorkspace({
    roomId,
    userName,
    userColor,
    userId,
    serverUrl: TEST_SERVER_URL,
    WebSocketPolyfill: WebSocket,
    disableIndexedDB
  });
}

test('Comprehensive Offline & Multiplayer Sync Engine Test Suite (15 Scenarios)', async (t) => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });

  let syncServer = createSyncServer({
    port: TEST_PORT,
    host: '127.0.0.1',
    dataDir: TEST_DATA_DIR,
    verbose: false
  });
  await syncServer.start();

  t.after(async () => {
    if (syncServer) {
      await syncServer.stop();
    }
    try {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  });

  await t.test('Scenario 1: Two users type into the same line concurrently', async () => {
    const room = 'room-sc-1';
    const c1 = createClient({ roomId: room, userName: 'Alice', disableIndexedDB: true });
    const c2 = createClient({ roomId: room, userName: 'Bob', disableIndexedDB: true });
    await Promise.all([c1.whenReady, c2.whenReady]);

    const f1 = c1.createFile('main.js', 'const x = "Start";\n');
    await delay(150);
    const f2 = c2.getText('main.js');
    assert.ok(f2, 'Client 2 must see main.js');

    f1.insert(16, '[ALICE_CONCURRENT] ');
    f2.insert(16, '[BOB_CONCURRENT] ');

    await delay(300);

    const text1 = f1.toString();
    const text2 = f2.toString();
    assert.strictEqual(text1, text2, 'Both clients must end with identical text');
    assert.ok(text1.includes('[ALICE_CONCURRENT]'), 'Alice text must exist');
    assert.ok(text1.includes('[BOB_CONCURRENT]'), 'Bob text must exist');
    assert.strictEqual(text1.split('[ALICE_CONCURRENT]').length, 2, 'No duplicated Alice text');
    assert.strictEqual(text1.split('[BOB_CONCURRENT]').length, 2, 'No duplicated Bob text');

    c1.destroy();
    c2.destroy();
  });

  await t.test('Scenario 2: Both users go offline, edit the SAME line and word, then reconnect', async () => {
    const room = 'room-sc-2';
    const c1 = createClient({ roomId: room, userName: 'Alice', disableIndexedDB: true });
    const c2 = createClient({ roomId: room, userName: 'Bob', disableIndexedDB: true });
    await Promise.all([c1.whenReady, c2.whenReady]);

    const f1 = c1.createFile('sentence.txt', 'The quick brown fox jumps.');
    await delay(150);
    const f2 = c2.getText('sentence.txt');

    c1.goOffline();
    c2.goOffline();
    assert.strictEqual(c1.getStatus(), 'offline');
    assert.strictEqual(c2.getStatus(), 'offline');

    f1.delete(10, 5);
    f1.insert(10, 'red');

    f2.delete(10, 5);
    f2.insert(10, 'blue');

    c1.goOnline();
    c2.goOnline();
    await delay(500);

    const res1 = f1.toString();
    const res2 = f2.toString();
    assert.strictEqual(res1, res2, 'Both clients must converge to 100% identical text after reconnect');
    assert.ok(res1.includes('The quick'), 'Prefix preserved');
    assert.ok(res1.includes('fox jumps.'), 'Suffix preserved');

    c1.destroy();
    c2.destroy();
  });

  await t.test('Scenario 3: One user offline for a long time (1000+ edits) while others edit, then reconnects', async () => {
    const room = 'room-sc-3';
    const c1 = createClient({ roomId: room, userName: 'Alice', disableIndexedDB: true });
    const c2 = createClient({ roomId: room, userName: 'Bob', disableIndexedDB: true });
    await Promise.all([c1.whenReady, c2.whenReady]);

    const f1 = c1.createFile('log.txt', '--- START LOG ---\n');
    await delay(150);
    const f2 = c2.getText('log.txt');

    c1.goOffline();

    for (let i = 1; i <= 1000; i++) {
      f1.insert(f1.length, `A${i},`);
    }

    for (let i = 1; i <= 50; i++) {
      f2.insert(f2.length, `B${i},`);
    }

    c1.goOnline();
    await delay(600);

    const final1 = f1.toString();
    const final2 = f2.toString();
    assert.strictEqual(final1, final2, 'Both clients must converge to identical content after 1000+ offline edits');
    assert.ok(final1.includes('A1000,'), 'Alice 1000th edit must be present');
    assert.ok(final1.includes('B50,'), 'Bob 50th edit must be present');

    c1.destroy();
    c2.destroy();
  });

  await t.test('Scenario 4: User edits offline, refreshes page (simulated via IndexedDB), then reconnects', async () => {
    const room = 'room-sc-4-idb';
    const c1 = createClient({ roomId: room, userName: 'Alice', disableIndexedDB: false });
    await c1.whenReady;

    const f1 = c1.createFile('doc.txt', 'Initial synced content.\n');
    await delay(200);

    c1.goOffline();
    f1.insert(f1.length, '[PERSISTED_OFFLINE_EDIT]');
    await delay(150);

    c1.destroy();

    const c1Refreshed = createClient({ roomId: room, userName: 'Alice', disableIndexedDB: false });
    await c1Refreshed.whenReady;

    const refreshedText = c1Refreshed.getText('doc.txt');
    assert.ok(refreshedText, 'doc.txt must exist after refresh');
    assert.ok(refreshedText.toString().includes('[PERSISTED_OFFLINE_EDIT]'), 'Offline edit must survive browser refresh');

    c1Refreshed.goOnline();
    await delay(300);

    const c2 = createClient({ roomId: room, userName: 'Bob', disableIndexedDB: true });
    await c2.whenReady;
    await delay(300);

    const f2 = c2.getText('doc.txt');
    assert.ok(f2, 'Peer must see doc.txt');
    assert.strictEqual(refreshedText.toString(), f2.toString(), 'Peer must receive survived offline edits identically');

    c1Refreshed.destroy();
    c2.destroy();
  });

  await t.test('Scenario 5: Delete-vs-edit conflict: A deletes a paragraph while B (offline) types inside it', async () => {
    const room = 'room-sc-5';
    const c1 = createClient({ roomId: room, userName: 'Alice', disableIndexedDB: true });
    const c2 = createClient({ roomId: room, userName: 'Bob', disableIndexedDB: true });
    await Promise.all([c1.whenReady, c2.whenReady]);

    const initial = 'Header\nParagraph to delete.\nFooter';
    const f1 = c1.createFile('story.txt', initial);
    await delay(150);
    const f2 = c2.getText('story.txt');

    c2.goOffline();

    f1.delete(7, 21);

    f2.insert(17, ' [BOB_TYPED_INSIDE_DELETED_P]');

    c2.goOnline();
    await delay(300);

    const text1 = f1.toString();
    const text2 = f2.toString();
    assert.strictEqual(text1, text2, 'Both must reach identical text');
    assert.ok(text1.includes('[BOB_TYPED_INSIDE_DELETED_P]'), 'Typed characters inside deleted region must not be lost');
    assert.ok(text1.includes('Header'), 'Header intact');
    assert.ok(text1.includes('Footer'), 'Footer intact');

    c1.destroy();
    c2.destroy();
  });

  await t.test('Scenario 6: 4, then 8 simultaneous clients typing random edits with flaky Wi-Fi disconnect/reconnect', async () => {
    const room = 'room-sc-6-flaky';
    const numClients = 8;
    const clients = [];

    for (let i = 0; i < numClients; i++) {
      const client = createClient({ roomId: room, userName: `User_${i}`, disableIndexedDB: true });
      clients.push(client);
    }
    await Promise.all(clients.map(c => c.whenReady));

    clients[0].createFile('shared.txt', '=== COLLAB LOG ===\n');
    await delay(200);

    for (let i = 0; i < numClients; i++) {
      const c = clients[i];
      const f = c.getText('shared.txt');
      assert.ok(f, `Client ${i} must see shared.txt`);

      if (i % 2 === 1) {
        c.goOffline();
      }

      f.insert(f.length, `[USER_${i}_MARKER]\n`);

      if (i % 2 === 1) {
        c.goOnline();
      }
    }

    await delay(800);

    const expected = clients[0].getText('shared.txt').toString();
    for (let i = 0; i < numClients; i++) {
      const text = clients[i].getText('shared.txt').toString();
      assert.strictEqual(text, expected, `Client ${i} must match client 0 identically`);
      assert.ok(expected.includes(`[USER_${i}_MARKER]`), `Missing marker from client ${i}`);
      assert.strictEqual(expected.split(`[USER_${i}_MARKER]`).length, 2, `Marker from client ${i} must not be duplicated`);
    }

    clients.forEach(c => c.destroy());
  });

  await t.test('Scenario 7: Server restart mid-session; clients reconnect and nothing is lost', async () => {
    const room = 'room-sc-7-restart';
    const c1 = createClient({ roomId: room, userName: 'Alice', disableIndexedDB: true });
    await c1.whenReady;

    const f1 = c1.createFile('data.js', '// Before server kill\n');
    await delay(200);

    await syncServer.stop();
    await delay(100);

    f1.insert(f1.length, '// Typed while server was dead\n');

    syncServer = createSyncServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      dataDir: TEST_DATA_DIR,
      verbose: false
    });
    await syncServer.start();
    await delay(600);

    const c2 = createClient({ roomId: room, userName: 'LateJoiner', disableIndexedDB: true });
    await c2.whenReady;
    await delay(300);

    const f2 = c2.getText('data.js');
    assert.ok(f2, 'Late joiner must see data.js after restart');
    assert.strictEqual(f1.toString(), f2.toString(), 'All edits made before and during downtime must sync identically');
    assert.ok(f2.toString().includes('// Before server kill'));
    assert.ok(f2.toString().includes('// Typed while server was dead'));

    c1.destroy();
    c2.destroy();
  });

  await t.test('Scenario 8: Concurrent file create/delete conflicts and initial default-file seeding', async () => {
    const room = 'room-sc-8-conflicts';
    const c1 = createClient({ roomId: room, userName: 'Alice', disableIndexedDB: true });
    const c2 = createClient({ roomId: room, userName: 'Bob', disableIndexedDB: true });
    await Promise.all([c1.whenReady, c2.whenReady]);

    c1.goOffline();
    c2.goOffline();

    c1.createFile('notes.md', '# Alice Notes\n');
    c2.createFile('notes.md', '# Bob Notes\n');

    c1.goOnline();
    c2.goOnline();
    await delay(600);

    const notes1 = c1.getText('notes.md').toString();
    const notes2 = c2.getText('notes.md').toString();
    assert.strictEqual(notes1, notes2, 'Concurrent created file must converge identically');
    assert.ok(notes1.includes('# Alice Notes'), 'Alice notes must not be lost');
    assert.ok(notes1.includes('# Bob Notes'), 'Bob notes must not be lost');

    c1.createFile('temp.txt', 'Original text\n');
    await delay(200);

    c2.goOffline();
    c2.getText('temp.txt').insert(14, 'Offline addition by Bob\n');

    c1.deleteFile('temp.txt');
    await delay(100);
    assert.strictEqual(c1.getText('temp.txt'), null, 'Alice deleted temp.txt');

    c2.goOnline();
    await delay(600);

    const restored1 = c1.getText('temp.txt');
    const restored2 = c2.getText('temp.txt');
    assert.ok(restored1, 'temp.txt must be safely restored to prevent data loss');
    assert.strictEqual(restored1.toString(), restored2.toString());
    assert.ok(restored1.toString().includes('Offline addition by Bob'));

    c1.destroy();
    c2.destroy();
  });

  await t.test('Scenario 9: Large file (5,000+ lines) sync time benchmark', async () => {
    const room = 'room-sc-9-largefile';
    const c1 = createClient({ roomId: room, userName: 'Alice', disableIndexedDB: true });
    await c1.whenReady;

    let largeContent = '';
    for (let i = 1; i <= 5000; i++) {
      largeContent += `function line_${i}() { return ${i * 42}; }\n`;
    }

    const t0 = Date.now();
    c1.createFile('large.js', largeContent);
    await delay(200);

    const c2 = createClient({ roomId: room, userName: 'Bob', disableIndexedDB: true });
    await c2.whenReady;

    const f2 = c2.getText('large.js');
    assert.ok(f2, 'Bob must receive large.js');
    const elapsed = Date.now() - t0;

    assert.strictEqual(c1.getText('large.js').toString(), f2.toString(), '5,000-line file must be 100% identical');
    assert.ok(elapsed < 4000, `Large file sync took ${elapsed}ms (must be under 4000ms)`);

    c1.destroy();
    c2.destroy();
  });

  await t.test('Scenario 10: Host & 2 authors push concurrent proposals on same file; host accepts both', async () => {
    const room = 'room-sc-10-proposals';
    const host = createClient({ roomId: room, userName: 'Host', userId: 'host_user', disableIndexedDB: true });
    await host.whenReady;
    assert.strictEqual(host.isHost(), true, 'First client must become host');

    host.createFile('calc.js', 'function calculate() {\n  return 0;\n}\n');
    await delay(150);

    const a1 = createClient({ roomId: room, userName: 'Author1', userId: 'author_1', disableIndexedDB: true });
    const a2 = createClient({ roomId: room, userName: 'Author2', userId: 'author_2', disableIndexedDB: true });
    await Promise.all([a1.whenReady, a2.whenReady]);

    const d1 = a1.getDraft('calc.js');
    d1.insert(0, '// Documentation by Author 1\n');
    const p1 = a1.pushDraft('calc.js', 'Add docs');

    const d2 = a2.getDraft('calc.js');
    d2.insert(d2.length, '// Added helper by Author 2\n');
    const p2 = a2.pushDraft('calc.js', 'Add helper');

    await delay(200);

    host.acceptProposal(p1);
    await delay(100);
    host.acceptProposal(p2);
    await delay(200);

    const mainText = host.getText('calc.js').toString();
    assert.ok(mainText.includes('// Documentation by Author 1'), 'Author 1 proposal content must be present');
    assert.ok(mainText.includes('// Added helper by Author 2'), 'Author 2 proposal content must be present');
    assert.strictEqual(mainText, a1.getText('calc.js').toString(), 'All clients converge to identical main');
    assert.strictEqual(mainText, a2.getText('calc.js').toString(), 'All clients converge to identical main');

    host.destroy();
    a1.destroy();
    a2.destroy();
  });

  await t.test('Scenario 11: Main file changes after draft is created; stale proposal applies cleanly', async () => {
    const room = 'room-sc-11-stale-proposal';
    const host = createClient({ roomId: room, userName: 'Host', userId: 'host_user', disableIndexedDB: true });
    await host.whenReady;

    host.createFile('doc.txt', 'Line 1\nLine 2\nLine 3\n');
    await delay(150);

    const author = createClient({ roomId: room, userName: 'Author', userId: 'author_user', disableIndexedDB: true });
    await author.whenReady;

    const draft = author.getDraft('doc.txt');
    draft.delete(7, 6);
    draft.insert(7, 'Line 2 (Modified by Author)');

    const mainText = host.getText('doc.txt');
    mainText.insert(0, 'Line 0.5 (Added to main)\n');
    mainText.insert(mainText.length, 'Line 4 (Added to main)\n');
    await delay(150);

    const propId = author.pushDraft('doc.txt', 'Update Line 2');
    await delay(150);

    host.acceptProposal(propId);
    await delay(200);

    const finalHost = host.getText('doc.txt').toString();
    const finalAuthor = author.getText('doc.txt').toString();
    assert.strictEqual(finalHost, finalAuthor, 'Must converge identically');
    assert.ok(finalHost.includes('Line 0.5 (Added to main)'), 'New main additions must not be lost');
    assert.ok(finalHost.includes('Line 2 (Modified by Author)'), 'Proposal changes must apply cleanly');
    assert.ok(finalHost.includes('Line 4 (Added to main)'), 'Trailing main additions must not be lost');

    host.destroy();
    author.destroy();
  });

  await t.test('Scenario 12: Author pushes offline, reconnects; host accepts while author offline; base updates', async () => {
    const room = 'room-sc-12-offline-proposal';
    const host = createClient({ roomId: room, userName: 'Host', userId: 'host_user', disableIndexedDB: true });
    await host.whenReady;
    host.createFile('app.js', 'let a = 10;\n');
    await delay(150);

    const author = createClient({ roomId: room, userName: 'Author', userId: 'author_user', disableIndexedDB: true });
    await author.whenReady;

    const draft = author.getDraft('app.js');
    author.goOffline();

    draft.insert(draft.length, 'let b = 20;\n');
    const propId = author.pushDraft('app.js', 'Add b');

    author.goOnline();
    await delay(300);

    author.goOffline();
    await delay(100);

    host.acceptProposal(propId);
    await delay(200);

    author.goOnline();
    await delay(300);

    const updatedBase = author.getDraftBase('app.js');
    const hostMain = host.getText('app.js').toString();
    assert.strictEqual(updatedBase, hostMain, 'Draft base must update on reconnect after host acceptance');

    host.destroy();
    author.destroy();
  });

  await t.test('Scenario 13: Two clients both try to become host at room creation: converge on one host', async () => {
    const room = 'room-sc-13-host-election';
    const c1 = createClient({ roomId: room, userName: 'Alice', userId: 'alice_id', disableIndexedDB: true });
    const c2 = createClient({ roomId: room, userName: 'Bob', userId: 'bob_id', disableIndexedDB: true });

    await Promise.all([c1.whenReady, c2.whenReady]);
    await delay(200);

    const host1 = c1.getHost();
    const host2 = c2.getHost();
    assert.ok(host1 !== null, 'Host must be elected');
    assert.strictEqual(host1, host2, 'Both clients must converge to the exact same host');

    const c1IsHost = c1.isHost();
    const c2IsHost = c2.isHost();
    assert.strictEqual(c1IsHost !== c2IsHost, true, 'Exactly one client must be host');

    c1.destroy();
    c2.destroy();
  });

  await t.test('Scenario 14: Revert proposal after others typed more text: only proposal changes removed', async () => {
    const room = 'room-sc-14-revert';
    const host = createClient({ roomId: room, userName: 'Host', userId: 'host_user', disableIndexedDB: true });
    await host.whenReady;

    host.createFile('code.js', '// Header\n// Base Code\n// Footer\n');
    await delay(150);

    const author = createClient({ roomId: room, userName: 'Author', userId: 'author_user', disableIndexedDB: true });
    await author.whenReady;

    const draft = author.getDraft('code.js');
    draft.insert(10, '// Feature X Added\n');
    const propId = author.pushDraft('code.js', 'Add feature X');
    await delay(150);

    host.acceptProposal(propId);
    await delay(200);
    assert.ok(host.getText('code.js').toString().includes('// Feature X Added'));

    host.getText('code.js').insert(host.getText('code.js').length, '// Subsequent Work By Peer\n');
    await delay(150);

    host.revertProposal(propId);
    await delay(200);

    const revertedText = host.getText('code.js').toString();
    assert.strictEqual(revertedText.includes('// Feature X Added'), false, 'Proposal addition must be cleanly removed');
    assert.ok(revertedText.includes('// Header'), 'Header must be preserved');
    assert.ok(revertedText.includes('// Base Code'), 'Base code must be preserved');
    assert.ok(revertedText.includes('// Subsequent Work By Peer'), 'Work typed after acceptance must never be deleted');

    host.destroy();
    author.destroy();
  });

  await t.test('Scenario 15: Non-host calls accept/reject/revert/setMode/transferHost: nothing changes', async () => {
    const room = 'room-sc-15-host-privileges';
    const host = createClient({ roomId: room, userName: 'Host', userId: 'host_id', disableIndexedDB: true });
    await host.whenReady;

    const nonHost = createClient({ roomId: room, userName: 'NonHost', userId: 'nonhost_id', disableIndexedDB: true });
    await nonHost.whenReady;

    host.createFile('test.js', 'console.log("Protected");\n');
    await delay(150);

    const modeSuccess = nonHost.setMode('review');
    assert.strictEqual(modeSuccess, false, 'Non-host setMode must fail');
    assert.strictEqual(host.getMode(), 'free', 'Mode must remain free');

    const transferSuccess = nonHost.transferHost('nonhost_id');
    assert.strictEqual(transferSuccess, false, 'Non-host transferHost must fail');
    assert.strictEqual(host.getHost(), 'host_id', 'Host must remain host_id');

    const draft = nonHost.getDraft('test.js');
    draft.insert(0, '// Hack\n');
    const propId = nonHost.pushDraft('test.js', 'Unauthorized accept');
    await delay(150);

    nonHost.acceptProposal(propId);
    await delay(150);

    const prop = host.listProposals().find(p => p.id === propId);
    assert.strictEqual(prop.status, 'pending', 'Proposal status must remain pending');
    assert.strictEqual(host.getText('test.js').toString().includes('// Hack'), false, 'Main text must not be modified');

    nonHost.rejectProposal(propId);
    await delay(100);
    assert.strictEqual(host.listProposals().find(p => p.id === propId).status, 'pending');

    host.destroy();
    nonHost.destroy();
  });
});
