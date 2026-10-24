import { TVRemote } from './lib/tv-remote.js';
import { hubFailure } from './lib/hub-records.js';
const $ = (id) => document.getElementById(id);
const local = document.querySelector('meta[name="sasori-runtime"]')?.content === 'local-helper';
const service = new TVRemote({ companion: local });
const fields = ['setup-pin', 'ha-url', 'ha-token', 'ha-remember', 'save-ha'];
function disable(value) {
  for (const id of fields) $(id).disabled = value;
}
async function init() {
  if (!local) {
    $('setup-message').textContent =
      'Open this setup on the companion computer at http://127.0.0.1:8765/companion.html. Credentials cannot be entered on the hosted site.';
    return;
  }
  const state = await service.request('/api/bootstrap');
  if (!state.canConfigure) {
    $('setup-message').textContent =
      'Configuration is available only on the companion computer at localhost. Your phone uses the Device hub after setup.';
    return;
  }
  disable(false);
  $('ha-remember').checked = state.remembered === true;
  $('setup-message').textContent = state.homeAssistant
    ? 'Home Assistant is already configured. You can replace its settings here.'
    : 'Enter the local URL and token from your Home Assistant account.';
}
$('save-ha').addEventListener('click', () => {
  const pin = $('setup-pin').value,
    url = $('ha-url').value.trim(),
    token = $('ha-token').value,
    remember = $('ha-remember').checked;
  $('setup-pin').value = '';
  $('ha-token').value = '';
  disable(true);
  (async () => {
    try {
      await service.authorize(pin);
      const result = await service.configureHomeAssistant(url, token, remember);
      $('setup-message').textContent = result.remembered
        ? 'Connection checked and saved privately on this computer. Return to the Device hub and select a configured media player or IR remote.'
        : 'Connection checked for this companion session. Return to the Device hub to select your device.';
    } catch (error) {
      const info = hubFailure(error);
      $('setup-message').textContent = info.title + '. ' + info.hint;
    } finally {
      disable(false);
    }
  })();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    $('setup-pin').value = '';
    $('ha-token').value = '';
  }
});
init().catch((error) => {
  const info = hubFailure(error);
  $('setup-message').textContent = info.title + '. ' + info.hint;
});
