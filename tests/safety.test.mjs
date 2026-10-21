import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync('site/app.js','utf8');
const html=readFileSync('site/index.html','utf8');
test('no Bluetooth characteristic writes in inspection-only script',()=>assert.doesNotMatch(js,/\.writeValue|\.writeValueWithoutResponse|\.writeValueWithResponse/));
test('explicit connection and disconnection controls',()=>{assert.match(html,/Connect & inspect/);assert.match(html,/id="disconnect"/)});
test('authentication not falsely advertised as verified',()=>assert.match(html,/Authentication handshake: <b>Not verified<\/b>/));
test('web UI script exposes no passwords or credential collection',()=>{assert.doesNotMatch(html,/type="password"/);assert.doesNotMatch(js,/fetch\(|XMLHttpRequest/)});