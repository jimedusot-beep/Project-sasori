import { validatePocketConfig } from './pocket-ir.js';
import { POCKET_PROFILES } from './pocket-ir-profiles.js';

const fail = () => {
  throw new Error('Invalid remote setup. Use a Sasori profile with one to five named buttons.');
};
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail();
}
function text(value, max) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[<>]/u.test(value) ||
    [...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
  )
    fail();
  return value.trim();
}
export function validatePocketProfile(value) {
  exact(value, ['schema', 'id', 'name', 'source', 'buttons']);
  if (
    value.schema !== 1 ||
    typeof value.id !== 'string' ||
    !/^[a-z][a-z0-9-]{0,47}$/.test(value.id)
  )
    fail();
  if (!Array.isArray(value.buttons) || value.buttons.length < 1 || value.buttons.length > 5) fail();
  const slots = new Set(),
    ids = new Set();
  const buttons = value.buttons.map((button) => {
    exact(button, ['id', 'label', 'slot', 'proto', 'code', 'bits']);
    if (
      typeof button.id !== 'string' ||
      !/^[a-z][a-z0-9_-]{0,31}$/.test(button.id) ||
      ids.has(button.id) ||
      slots.has(button.slot)
    )
      fail();
    ids.add(button.id);
    slots.add(button.slot);
    return { id: button.id, label: text(button.label, 32), ...validatePocketConfig(button) };
  });
  return {
    schema: 1,
    id: value.id,
    name: text(value.name, 80),
    source: text(value.source, 180),
    buttons,
  };
}
export const emptyPocketData = () => ({
  schema: 1,
  revision: 0,
  selected: POCKET_PROFILES[0].id,
  profiles: [],
});
export function validatePocketData(value) {
  exact(value, ['schema', 'revision', 'selected', 'profiles']);
  if (
    value.schema !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    value.revision >= Number.MAX_SAFE_INTEGER ||
    !Array.isArray(value.profiles) ||
    value.profiles.length > 20 ||
    JSON.stringify(value).length > 64000
  )
    fail();
  const profiles = value.profiles.map(validatePocketProfile),
    ids = new Set(POCKET_PROFILES.map((p) => p.id));
  for (const profile of profiles) {
    if (ids.has(profile.id)) fail();
    ids.add(profile.id);
  }
  if (typeof value.selected !== 'string' || !ids.has(value.selected)) fail();
  return { schema: 1, revision: value.revision, selected: value.selected, profiles };
}
export function importPocketProfile(raw, data) {
  if (typeof raw !== 'string' || raw.length > 12000) fail();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail();
  }
  const profile = validatePocketProfile(parsed);
  if (POCKET_PROFILES.some((p) => p.id === profile.id))
    throw new Error('Give custom profiles their own ID; starter profiles cannot be replaced.');
  const next = validatePocketData(data);
  next.profiles = next.profiles.filter((p) => p.id !== profile.id).concat(profile);
  next.selected = profile.id;
  return validatePocketData(next);
}
