import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { PrivacyNotebook } from '../site/lib/privacy-notebook.js';

async function interfaceFixture(t) {
  const saved = new Map(
    ['document', 'window', 'navigator', 'indexedDB', 'SasoriNativeSurvey'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const nodes = new Map(),
    events = {},
    streams = [];
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        value: '',
        style: {},
        handlers: {},
        children: [],
        addEventListener(type, fn) {
          this.handlers[type] = fn;
        },
        replaceChildren() {
          this.children = [];
        },
        append(...values) {
          this.children.push(...values);
        },
      });
    return nodes.get(id);
  };
  const document = {
    hidden: false,
    getElementById: node,
    createElement: () => node(crypto.randomUUID()),
    createTextNode: (text) => text,
    addEventListener: (type, fn) => {
      events[type] = fn;
    },
  };
  const mediaDevices = {
    getUserMedia: async () => {
      const track = new EventTarget();
      track.stopped = false;
      track.stop = () => {
        track.stopped = true;
      };
      const stream = { track, getTracks: () => [track], getVideoTracks: () => [track] };
      streams.push(stream);
      return stream;
    },
  };
  const plugin = {
    startSurvey: async ({ sessionId }) => ({
      sessionId,
      state: 'stopped',
      durationMs: 100,
      devices: [{ alias: 'signal-1', samples: 1, rssi: -88, minRssi: -88, maxRssi: -88 }],
    }),
    stopSurvey: async () => {},
  };
  const values = {
    document,
    window: {
      addEventListener: (type, fn) => {
        events[type] = fn;
      },
    },
    navigator: { mediaDevices },
    indexedDB: new IDBFactory(),
    SasoriNativeSurvey: plugin,
  };
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  node('observation-label').value = 'Test observation';
  node('inspection-video').play = async () => {};
  await import(new URL('../site/privacy-ui.js?fixture=' + crypto.randomUUID(), import.meta.url));
  for (
    let attempt = 0;
    attempt < 50 && !node('notebook-status').textContent?.includes('local observations');
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 2));
  assert.match(node('notebook-status').textContent, /local observations/);
  t.after(() => {
    events.pagehide();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { node, events, streams, document };
}
test('an old rejected preview cannot stop a restarted camera session or overwrite its status', async (t) => {
  const { node, streams } = await interfaceFixture(t);
  let rejectOld,
    calls = 0;
  node('inspection-video').play = () =>
    ++calls === 1
      ? new Promise((_, reject) => {
          rejectOld = reject;
        })
      : Promise.resolve();
  const old = node('camera-start').handlers.click();
  await new Promise((resolve) => setImmediate(resolve));
  node('camera-stop').handlers.click();
  await node('camera-start').handlers.click();
  rejectOld(new Error('old preview cancelled'));
  await old;
  assert.equal(streams[1].track.stopped, false);
  assert.match(node('camera-status').textContent, /LIVE/);
});
test('a current preview failure stops its own stream and presents recovery guidance', async (t) => {
  const { node, streams } = await interfaceFixture(t);
  node('inspection-video').play = async () => {
    throw new Error('preview failed');
  };
  await node('camera-start').handlers.click();
  assert.equal(streams[0].track.stopped, true);
  assert.match(node('camera-status').textContent, /permission/);
});
for (const earlierLive of [false, true])
  test(`background Stop preserves synthetic survey data and provenance (earlier live=${earlierLive})`, async (t) => {
    const { node, events, document } = await interfaceFixture(t);
    if (earlierLive) await node('ble-start').handlers.click();
    node('ble-demo').handlers.click();
    document.hidden = true;
    events.visibilitychange();
    assert.equal(node('ble-results').children.length, 1, 'synthetic observation must survive Stop');
    assert.match(node('ble-results').children[0].textContent, /-55/);
    await node('save-survey').handlers.click();
    const records = await new PrivacyNotebook().list();
    assert.equal(records.length, 1);
    assert.equal(records[0].source, 'synthetic');
    assert.equal(records[0].measurements.devices[0].rssi, -55);
  });
