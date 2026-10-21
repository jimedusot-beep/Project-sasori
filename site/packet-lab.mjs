import {analyzeElmoNotification} from './elmo-packets.mjs';
const hexInput = document.getElementById('packet-hex');
const output = document.getElementById('packet-result');
const sample = document.getElementById('packet-sample');
if (hexInput && output) {
  document.getElementById('packet-decode').addEventListener('click', () => {
    try {
      output.textContent = JSON.stringify(analyzeElmoNotification(hexInput.value), null, 2);
    } catch (error) {
      output.textContent = 'Cannot decode: ' + error.message;
    }
  });
  sample.addEventListener('click', () => {
    hexInput.value = '604e65774d6f64654964783a313200';
    document.getElementById('packet-decode').click();
  });
}
