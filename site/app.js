'use strict';
// Project Sasori 001: read-only BLE feasibility lab. Never implement protocol writes here.
const $ = id => document.getElementById(id);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let device=null,server=null,notifyCharacteristic=null,busy=false, timer=null;
let lines=[];
function state(s){$('state').textContent=s;}
function log(s){const timestamp=new Date().toISOString();lines.push(`${timestamp} ${s}`);if(lines.length>500)lines=lines.slice(-500);$('log').textContent=lines.join('\n');$('log').scrollTop=$('log').scrollHeight;}
function hex(bytes){return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');}
function onNotification(event){const value=event.target.value;const bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);log(`RX ${hex(bytes)} | TEXT ${JSON.stringify(new TextDecoder().decode(bytes))}`);}
function disconnected(){clearTimeout(timer);state('Disconnected');$('disconnect').disabled=true;$('connect').disabled=false;notifyCharacteristic=null;server=null;busy=false;log('STATE disconnected');}
function validUUID(t){return UUID.test(t.trim());}
async function connect(){
 if(busy)return;
 const service=$('svc').value.trim(),characteristic=$('notify').value.trim();
 if(!validUUID(service)||!validUUID(characteristic)){log('ERROR Enter both verified 128-bit service and notification UUIDs.');return;}
 if(!navigator.bluetooth){log('ERROR Web Bluetooth unavailable here. Use Bluefy on iOS.');return;}
 busy=true;$('connect').disabled=true;state('Selecting device');
 try{
  log('MODE inspect-only; no application command writes');
  device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[service]});
  log(`Selected ${JSON.stringify(device.name||'Unnamed device')}`);
  device.addEventListener('gattserverdisconnected',disconnected,{once:true});
  state('Connecting');server=await device.gatt.connect();log('GATT connected');
  const svc=await server.getPrimaryService(service);log('Verified custom service present');
  notifyCharacteristic=await svc.getCharacteristic(characteristic);
  if(!notifyCharacteristic.properties.notify){throw Error('Characteristic does not support notifications');}
  notifyCharacteristic.addEventListener('characteristicvaluechanged',onNotification);
  await notifyCharacteristic.startNotifications();log('Notifications subscribed; inspection active');
  state('Connected · inspection');$('disconnect').disabled=false;
  timer=setTimeout(()=>{if(server?.connected){log('Timed inspection complete; disconnecting');disconnect();}},15000);
 }catch(e){log(`ERROR ${e?.name||'Error'}: ${e?.message||String(e)}`);state('Error');if(device?.gatt?.connected)device.gatt.disconnect();$('connect').disabled=false;}
 finally{busy=false;}
}
function disconnect(){clearTimeout(timer);if(server?.connected)server.disconnect();else disconnected();}
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('connect').addEventListener('click',connect);$('disconnect').addEventListener('click',disconnect);
$('copy').addEventListener('click',()=>{navigator.clipboard.writeText(lines.join('\n')).then(()=>log('Log copied'),e=>log(`Copy unavailable: ${e.message}`));});
$('export').addEventListener('click',()=>download('sasori-elmo-log.txt',lines.join('\n')+'\n','text/plain'));
$('clear').addEventListener('click',()=>{lines=[];$('log').textContent='';log('Log cleared locally');});
$('support').textContent=navigator.bluetooth?'Web Bluetooth API available. Discovery still requires user permission.':'Web Bluetooth API unavailable here. On iPhone, open this page in Bluefy.';
log('Project Sasori 001 loaded; read-only; no Bluetooth commands before Connect.');