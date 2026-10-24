import {
  MAX_IR_BYTES,
  parseFlipperIR,
  profileFromFlipperIR,
} from './lib/flipper-ir.js?v=ir-import-20261024';
import {
  IR_EXAMPLE_NAME,
  IR_EXAMPLE_SOURCE,
  IR_EXAMPLE_TEXT,
} from './lib/flipper-ir-example.js?v=ir-import-20261024';
import { recordId } from './lib/records.js';

export function setupIRImport({ canUse, canSave, saveProfile }) {
  const $ = (id) => document.getElementById(id);
  let draft = null,
    reader = null,
    timer = null,
    generation = 0,
    savedSignature = '';
  const selected = () =>
    [...$('ir-signals').querySelectorAll('input:checked')].map((input) => Number(input.value));
  const signature = () => JSON.stringify([$('ir-name').value.trim(), selected()]);
  function refresh() {
    const free = canUse(),
      choices = selected();
    for (const id of [
      'ir-file',
      'ir-example',
      'ir-preview',
      'ir-paste-toggle',
      'ir-name',
      'ir-text',
    ])
      $(id).disabled = !free;
    for (const input of $('ir-signals').querySelectorAll('input'))
      input.disabled = !free || input.dataset.supported !== 'yes';
    $('ir-save').disabled =
      !canSave() ||
      !!reader ||
      !draft ||
      choices.length < 1 ||
      choices.length > 5 ||
      savedSignature === signature();
    $('ir-count').textContent = choices.length + ' / 5 buttons selected';
  }
  function cancelRead() {
    generation++;
    clearTimeout(timer);
    timer = null;
    if (reader) {
      const pending = reader;
      reader = null;
      pending.abort();
      $('ir-status').textContent = 'File read cancelled. Saved setups are unchanged.';
    }
    refresh();
  }
  function clear() {
    cancelRead();
    draft = null;
    savedSignature = '';
    $('ir-signals').replaceChildren();
    $('ir-picker').hidden = true;
    $('ir-file').value = '';
    $('ir-text').value = '';
    $('ir-name').value = '';
    $('ir-status').textContent =
      'No file loaded. Previewing does not connect, store buttons, or emit IR.';
    $('ir-example-credit').hidden = true;
    refresh();
  }
  function show(raw, label, example = false) {
    const parsed = parseFlipperIR(raw); // Parse completely before changing the current draft.
    $('ir-text').value = raw;
    draft = { parsed, id: 'ir-' + recordId() };
    savedSignature = '';
    $('ir-name').value = label.replace(/[<>]/g, '').trim().slice(0, 80) || 'Imported remote';
    let picked = 0;
    $('ir-signals').replaceChildren(
      ...parsed.signals.map((item) => {
        const row = document.createElement('label');
        row.className = 'ir-choice';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = String(item.index);
        input.dataset.supported = item.supported ? 'yes' : 'no';
        input.checked = item.supported && picked++ < 5;
        const caption = document.createElement('span'),
          title = document.createElement('strong'),
          detail = document.createElement('small');
        title.textContent = item.name;
        detail.textContent = item.supported
          ? item.protocol + ' → ' + item.proto + ' / ' + item.bits + ' bits'
          : item.reason;
        caption.append(title, detail);
        row.append(input, caption);
        input.addEventListener('change', refresh);
        return row;
      }),
    );
    const supported = parsed.signals.filter((item) => item.supported).length;
    $('ir-status').textContent =
      supported +
      ' convertible, ' +
      (parsed.signals.length - supported) +
      ' unsupported. Up to five supported buttons are preselected; review before saving. Physical behavior is unverified.';
    $('ir-picker').hidden = false;
    $('ir-example-credit').hidden = !example;
    refresh();
  }
  function preview(raw, label, example = false) {
    try {
      show(raw, label, example);
    } catch (error) {
      // Never leave a previous draft enabled under a new file/error message.
      draft = null;
      savedSignature = '';
      $('ir-signals').replaceChildren();
      $('ir-picker').hidden = true;
      $('ir-example-credit').hidden = true;
      $('ir-status').textContent = error.message;
      refresh();
    }
  }
  $('ir-file').addEventListener('change', () => {
    const file = $('ir-file').files?.[0];
    $('ir-file').value = '';
    cancelRead();
    if (!file || !canUse()) return;
    draft = null;
    savedSignature = '';
    $('ir-signals').replaceChildren();
    $('ir-picker').hidden = true;
    $('ir-example-credit').hidden = true;
    if (!Number.isInteger(file.size) || file.size < 1 || file.size > MAX_IR_BYTES) {
      $('ir-status').textContent = 'Choose a nonempty .ir file no larger than 128 KB.';
      refresh();
      return;
    }
    const token = generation,
      current = new FileReader();
    reader = current;
    $('ir-status').textContent = 'Reading local file… Nothing is uploaded.';
    refresh();
    const finish = () => {
      clearTimeout(timer);
      timer = null;
      reader = null;
    };
    current.onload = () => {
      if (token !== generation) return;
      finish();
      try {
        preview(
          new TextDecoder('utf-8', { fatal: true }).decode(current.result),
          file.name.replace(/\.ir$/i, ''),
        );
      } catch {
        $('ir-status').textContent = 'The file must be UTF-8 text. No setup was changed.';
        refresh();
      }
    };
    current.onerror = () => {
      if (token === generation) {
        finish();
        $('ir-status').textContent = 'Could not read the local file. Try a downloaded copy.';
        refresh();
      }
    };
    current.onabort = () => {
      if (token === generation) {
        finish();
        $('ir-status').textContent = 'File read cancelled.';
        refresh();
      }
    };
    timer = setTimeout(() => {
      if (token === generation) {
        cancelRead();
        $('ir-status').textContent = 'File read timed out. Try a local downloaded copy.';
      }
    }, 15000);
    try {
      current.readAsArrayBuffer(file);
    } catch {
      finish();
      $('ir-status').textContent = 'Could not open the local file.';
      refresh();
    }
  });
  $('ir-example').addEventListener('click', () => {
    if (!canUse()) return;
    cancelRead();
    preview(IR_EXAMPLE_TEXT, IR_EXAMPLE_NAME, true);
  });
  $('ir-preview').addEventListener('click', () => {
    if (!canUse()) return;
    cancelRead();
    preview($('ir-text').value, $('ir-name').value.trim() || 'Imported remote');
  });
  $('ir-clear').addEventListener('click', clear);
  $('ir-name').addEventListener('input', refresh);
  $('ir-text').addEventListener('input', () => {
    cancelRead();
    draft = null;
    savedSignature = '';
    $('ir-signals').replaceChildren();
    $('ir-picker').hidden = true;
    $('ir-example-credit').hidden = true;
    $('ir-status').textContent = 'Text changed. Preview file text before saving.';
    refresh();
  });
  $('ir-paste-toggle').addEventListener('click', () => {
    $('ir-paste').hidden = !$('ir-paste').hidden;
    $('ir-paste-toggle').setAttribute('aria-expanded', String(!$('ir-paste').hidden));
  });
  $('ir-example-credit').href = IR_EXAMPLE_SOURCE;
  $('ir-save').addEventListener('click', async () => {
    if (!canSave() || !draft || reader || $('ir-save').disabled) return;
    try {
      const profile = profileFromFlipperIR(draft.parsed, selected(), {
        id: draft.id,
        name: $('ir-name').value.trim(),
      });
      const result = await saveProfile(profile);
      if (result?.ok) {
        savedSignature = signature();
        $('ir-status').textContent =
          'Saved ' +
          profile.buttons.length +
          ' named buttons. Choose demo or connect your bridge, then Prepare remote. No IR was sent.';
      } else
        $('ir-status').textContent =
          result?.message || 'Setup was not saved. Check storage and try again.';
    } catch (error) {
      $('ir-status').textContent = error.message;
    }
    refresh();
  });
  clear();
  return { refresh, cancelRead, clear };
}
