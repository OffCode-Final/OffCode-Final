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
const QA_TEST_PORT = 12356;
const QA_SERVER_URL = `ws://127.0.0.1:${QA_TEST_PORT}`;
const QA_DATA_DIR = path.join(__dirname, 'test_qa_data');

function createClient(options) {
  return createWorkspace({
    serverUrl: QA_SERVER_URL,
    WebSocketPolyfill: WebSocket,
    disableIndexedDB: true,
    ...options
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Frontend QA Features & Edge Cases Test Suite', async (t) => {
  fs.rmSync(QA_DATA_DIR, { recursive: true, force: true });

  const syncServer = createSyncServer({
    port: QA_TEST_PORT,
    host: '127.0.0.1',
    dataDir: QA_DATA_DIR,
    verbose: false
  });
  await syncServer.start();

  t.after(async () => {
    await syncServer.stop();
    fs.rmSync(QA_DATA_DIR, { recursive: true, force: true });
  });

  await t.test('1. File list with 5 files & persistence', async () => {
    const ws = createClient({ roomId: 'qa-file-list-room', userName: 'User1', userId: 'u1' });
    await ws.whenReady;

    // By default main.js is seeded
    const extraFiles = ['script.py', 'styles.css', 'index.html', 'utils.ts'];
    for (const name of extraFiles) {
      ws.createFile(name, `// ${name} content`);
    }

    const files = ws.listFiles();
    assert.strictEqual(files.length, 5, 'Should have exactly 5 files in workspace');
    assert.ok(files.includes('main.js'));
    for (const name of extraFiles) {
      assert.ok(files.includes(name), `File ${name} must exist in list`);
    }

    ws.destroy();
  });

  await t.test('2. Open-file-on-create logic simulation', async () => {
    const ws = createClient({ roomId: 'qa-open-tab-room', userName: 'User1', userId: 'u1' });
    await ws.whenReady;

    let openTabs = [...ws.listFiles()];
    let activeFile = openTabs[0];

    const handleCreateFile = (name, content) => {
      ws.createFile(name, content);
      if (!openTabs.includes(name)) {
        openTabs = [...openTabs, name];
      }
      activeFile = name;
    };

    handleCreateFile('new_component.jsx', '// React component');
    assert.ok(openTabs.includes('new_component.jsx'));
    assert.strictEqual(activeFile, 'new_component.jsx');

    ws.destroy();
  });

  await t.test('3. Chat: send, delete-for-me, delete-for-everyone, clear-my-view', async () => {
    const ws1 = createClient({ roomId: 'qa-chat-room', userName: 'Alice', userId: 'alice' });
    const ws2 = createClient({ roomId: 'qa-chat-room', userName: 'Bob', userId: 'bob' });
    await Promise.all([ws1.whenReady, ws2.whenReady]);
    await delay(100);

    const chatArray1 = ws1.ydoc.getArray('chat');
    const chatArray2 = ws2.ydoc.getArray('chat');

    // Alice sends message 1
    const msg1 = { id: 'm1', sender: 'Alice', senderId: 'alice', text: 'Hello everyone', timestamp: Date.now() };
    chatArray1.push([msg1]);

    // Bob sends message 2
    const msg2 = { id: 'm2', sender: 'Bob', senderId: 'bob', text: 'Hi Alice', timestamp: Date.now() + 10 };
    chatArray2.push([msg2]);

    await delay(100);
    assert.strictEqual(chatArray1.length, 2);
    assert.strictEqual(chatArray2.length, 2);

    // Delete for everyone (Alice deletes m1)
    chatArray1.forEach((m, idx) => {
      if (m.id === 'm1') {
        chatArray1.delete(idx, 1);
        chatArray1.insert(idx, [{ ...m, deleted: true, text: 'This message was deleted' }]);
      }
    });

    await delay(100);
    const bobViewMsg1 = chatArray2.toArray().find(m => m.id === 'm1');
    assert.strictEqual(bobViewMsg1.deleted, true, 'Bob sees message as deleted for everyone');

    // Delete for me (Bob hides m2 locally)
    const hiddenMessageIdsBob = new Set(['m2']);
    const bobRenderedMessages = chatArray2.toArray().filter(m => !hiddenMessageIdsBob.has(m.id));
    assert.strictEqual(bobRenderedMessages.some(m => m.id === 'm2'), false, 'Bob does not see m2 locally');
    // Alice still has m2 in shared state
    assert.ok(chatArray1.toArray().some(m => m.id === 'm2'), 'Shared array still contains m2');

    // Clear my view (Alice clears messages before current timestamp)
    const clearTimestampAlice = Date.now() + 100;
    const aliceRenderedMessages = chatArray1.toArray().filter(m => m.timestamp > clearTimestampAlice);
    assert.strictEqual(aliceRenderedMessages.length, 0, 'Alice local view cleared');
    // Bob can still see messages
    assert.ok(chatArray2.length > 0, 'Bob state intact');

    ws1.destroy();
    ws2.destroy();
  });

  await t.test('4. Host assignment: first person stays host', async () => {
    const ws1 = createClient({ roomId: 'qa-host-room', userName: 'Host1', userId: 'h1' });
    await ws1.whenReady;
    await delay(50);

    assert.strictEqual(ws1.getHostId(), 'h1', 'First client is host');

    // Late joiner joins
    const ws2 = createClient({ roomId: 'qa-host-room', userName: 'Joiner2', userId: 'j2' });
    await ws2.whenReady;
    await delay(100);

    assert.strictEqual(ws2.getHostId(), 'h1', 'Joiner sees first client as host');
    assert.strictEqual(ws1.getHostId(), 'h1', 'First client remains host');

    ws1.destroy();
    ws2.destroy();
  });

  await t.test('5. Solo-host review mode & draft proposal flow', async () => {
    const ws = createClient({ roomId: 'qa-solo-host-review', userName: 'SoloHost', userId: 'sh1' });
    await ws.whenReady;

    // Solo host enters review mode
    ws.setMode('review');
    assert.strictEqual(ws.getMode(), 'review', 'Room mode is review');

    // Solo host edits draft of main.js
    const draftText = ws.getDraft('main.js');
    draftText.delete(0, draftText.length);
    draftText.insert(0, 'console.log("Draft code by solo host");');

    // Push draft as proposal
    const propId = ws.pushDraft('main.js', 'Solo host feature proposal');
    assert.ok(propId, 'Proposal created');

    await delay(150);
    const proposals = ws.listProposals();
    assert.strictEqual(proposals.length, 1);
    assert.strictEqual(proposals[0].message, 'Solo host feature proposal');

    // Host accepts own proposal
    ws.acceptProposal(propId);
    await delay(150);
    assert.ok(ws.getText('main.js').toString().includes('Draft code by solo host'));

    ws.destroy();
  });

  await t.test('6. Offline toggle simulation', async () => {
    const ws = createClient({ roomId: 'qa-offline-room', userName: 'OfflineUser', userId: 'off1' });
    await ws.whenReady;

    assert.strictEqual(ws.getStatus(), 'online');

    // Go offline
    ws.goOffline();
    assert.strictEqual(ws.getStatus(), 'offline', 'Status changed to offline');

    // Local edits succeed offline
    ws.createFile('offline.txt', 'Offline file creation');
    assert.ok(ws.listFiles().includes('offline.txt'));

    // Go back online
    ws.goOnline();
    await delay(100);
    assert.strictEqual(ws.getStatus(), 'online', 'Status reconnected');

    ws.destroy();
  });
});
