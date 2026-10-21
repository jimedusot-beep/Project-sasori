import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('site/app.js', 'utf8');
const SERVICE = '12345678-1234-1234-1234-123456789abc';
const NOTIFY = '87654321-4321-4321-4321-cba987654321';
function fixture() {
  const buttons = Object.create(null);
  for (const id of ['state','connect','disconnect','svc','notify','log','copy','export','clear','support']) {
    buttons[id] = {value:'',textContent:'',disabled:false,events:{},
      addEventListener(type, listener){this.events[type]=listener;}};
  }
  buttons.svc.value = SERVICE;
  buttons.notify.value = NOTIFY;
  const deviceEvents = {};
  const notificationEvents = {};
  const counts = {subscriptions:0,unsubscriptions:0,connections:0,disconnects:0};
  const characteristic = {
    properties:{notify:true},
    addEventListener(type,callback){notificationEvents[type]=callback;},
    removeEventListener(type,callback){if(notificationEvents[type]===callback)delete notificationEvents[type];},
    async startNotifications(){counts.subscriptions++;return this;},
    async stopNotifications(){counts.unsubscriptions++;return this;}
  };
  const server = {
    connected:false,
    async getPrimaryService(){return {getCharacteristic:async()=>characteristic};},
    disconnect() {
      if(!this.connected)return;
      this.connected=false;counts.disconnects++;
      deviceEvents.gattserverdisconnected?.();
    }
  };
  const device = {name:'Elmo L2L',gatt:{async connect(){counts.connections++;server.connected=true;return server;}},
    addEventListener(type,callback){deviceEvents[type]=callback;}};
  const navigator = {
    bluetooth: {requestDevice:async()=>device},
    clipboard: {writeText:async()=>{}}
  };
  const timeouts = new Map();let timerId=1;
  const context = {document:{getElementById:id=>buttons[id],createElement:()=>({click(){}})},
    navigator, TextDecoder, Uint8Array, Blob, Date, JSON, URL,
    setTimeout(fn){const id=timerId++;timeouts.set(id,fn);return id;},
    clearTimeout(id){timeouts.delete(id);}};
  vm.runInNewContext(source,context);
  return {buttons,device,server,characteristic,deviceEvents,notificationEvents,counts,timeouts};
}
test('simulated happy path subscribes then ends as timed inspection, not link loss', async () => {
  const f=fixture();
  await f.buttons.connect.events.click();
  assert.equal(f.counts.connections,1);
  assert.equal(f.counts.subscriptions,1);
  assert.equal(f.buttons.state.textContent,'Connected · read-only');
  const expire=[...f.timeouts.values()][0];
  expire();
  assert.equal(f.counts.disconnects,1);
  assert.match(f.buttons.state.textContent,/timed-inspection/);
  assert.equal(f.buttons.connect.disabled,false);
});
test('manual disconnect is separately identified and removes notification listener',async()=>{
  const f=fixture();await f.buttons.connect.events.click();
  f.buttons.disconnect.events.click();
  assert.match(f.buttons.state.textContent,/manual/);
  assert.equal(f.notificationEvents.characteristicvaluechanged,undefined);
  assert.equal(f.counts.unsubscriptions,1);
});
test('unexpected physical disconnection is not mistaken for a timed inspection',async()=>{
  const f=fixture();await f.buttons.connect.events.click();
  f.server.disconnect();
  assert.match(f.buttons.state.textContent,/unexpected-link-loss/);
  assert.equal(f.timeouts.size,0);
});
test('invalid UUID blocks Bluetooth device chooser',async()=>{
  const f=fixture();f.buttons.svc.value='not-a-real-uuid';
  await f.buttons.connect.events.click();
  assert.equal(f.counts.connections,0);
  assert.match(f.buttons.log.textContent,/ERROR Enter two verified/);
});
test('receiving a notification creates an RX log, without any BLE write',async()=>{
  const f=fixture();await f.buttons.connect.events.click();
  const buffer=Uint8Array.from([0x60,0x41,0x00]);
  f.notificationEvents.characteristicvaluechanged({target:{value:new DataView(buffer.buffer)}});
  assert.match(f.buttons.log.textContent,/RX 604100/);
  f.buttons.disconnect.events.click();
});
