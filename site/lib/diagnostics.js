const secretKey = /password|credential|secret|token|challenge|response|deviceId|serial|macAddress/i;
export function sanitizeText(value) {
  return String(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]')
    .replace(/\b(?:[a-f0-9]{2}:){5}[a-f0-9]{2}\b/gi, '[address redacted]')
    .replace(
      /((?:password|secret|token|credential|challenge|response)\s*[:=]\s*)[^\s,;]+/gi,
      '$1[redacted]',
    )
    .replace(
      /\b(?:gh[pousr]_[a-zA-Z0-9_]{16,}|github_pat_[a-zA-Z0-9_]{16,})\b/g,
      '[token redacted]',
    );
}
export function sanitize(value, key = '') {
  if (secretKey.test(key)) return '[redacted]';
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map((v) => sanitize(v));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]));
  return value;
}
export function explainError(error) {
  const name = error?.name || 'Error';
  const explanations = {
    NotFoundError:
      'No device or service was selected/found. Check power, proximity, and the profile UUIDs, then retry manually.',
    SecurityError:
      'Bluetooth permission was denied or the service was not granted. Use HTTPS and select the device again.',
    NotSupportedError:
      'This browser or characteristic does not support the requested Bluetooth feature. On iPhone, try Bluefy.',
    NetworkError:
      'The Bluetooth link failed. Close other apps connected to Elmo, keep it nearby, and retry manually.',
    InvalidStateError:
      'The device is disconnected or busy. Disconnect, wait for idle, and start a new inspection.',
    TimeoutError:
      'An operation exceeded its time limit. Any late connection will be disconnected; retry manually.',
    AbortError:
      'The inspection was cancelled. A pending device chooser may still need to be closed.',
  };
  return {
    name,
    message: sanitizeText(error?.message || error || 'Unknown error'),
    nextStep:
      explanations[name] ||
      'Check profile UUIDs and the technical log. Stop if the toy moves unexpectedly or becomes hot.',
  };
}
export class Diagnostics {
  constructor(limit = 400) {
    this.limit = limit;
    this.events = [];
    this.dropped = 0;
  }
  add(level, message, details = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizeText(message),
      details: sanitize(details),
    };
    this.events.push(event);
    if (this.events.length > this.limit) {
      this.events.shift();
      this.dropped++;
    }
    return event;
  }
  text() {
    return this.events
      .map((e) => e.timestamp + ' ' + e.level.toUpperCase() + ' ' + e.message)
      .join('\n');
  }
}
