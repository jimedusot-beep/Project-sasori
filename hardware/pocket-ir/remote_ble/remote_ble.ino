// Sasori adaptation of Koontzie/ir-remote, MIT (c) 2026 Tyler Koontz.
// See ../NOTICE.md for pin, source digest, license, and patch list.
/*
 * Phase 2 — BLE GATT + programmable IR slots (ESP32-S3)
 *
 * Keeps Phase 1's IR send path (GPIO4, IRremoteESP8266) and adds a BLE GATT
 * service so a Web Bluetooth app can program and fire five IR slots.
 * Slot config persists in NVS via Preferences, so it survives a power cycle.
 *
 * GATT — service b457c32b-22b1-425f-8a88-4d6dc37ba4eb, device name "IR-Remote":
 *   config  (WRITE)  {"slot":1,"proto":"SAMSUNG","code":"0xE0E040BF","bits":32}
 *   trigger (WRITE)  {"slot":1}
 *   status  (NOTIFY) "saved:1" / "sent:1" / "err:..."
 *
 * Phase 3 hardware — NPN driver stage off the 5V rail, ~64mA through two IR
 * LEDs in series (was ~13mA on direct GPIO drive, inches of range; now 20-30ft):
 *   5V --33R--> LED1(+)-(-) --> LED2(+)-(-) --> COLLECTOR
 *   GPIO4 --1k--> BASE           EMITTER --> GND
 *
 * Phase 3 buttons: GPIO5 -> slot 1, GPIO2 -> slot 2. INPUT_PULLUP, wired
 * pin -> button -> GND, so pressed reads LOW. Fixed mapping, button N -> slot N.
 * Buttons work with no BLE client connected — the remote is standalone.
 */

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>

// ── UUIDs (generated once, hardcoded — the web app must match these) ─────────
#define SERVICE_UUID "b457c32b-22b1-425f-8a88-4d6dc37ba4eb"
#define CONFIG_UUID  "d997012d-7d2b-47de-ae87-bae14df446ef"
#define TRIGGER_UUID "58397514-04a3-4265-9590-9d910c4e99d2"
#define STATUS_UUID  "b8ddfe01-519f-430d-bd4e-aba0dd852e2c"

static const uint16_t kIrLedPin   = 4;
static const uint8_t  kMinSlot    = 1;
static const uint8_t  kMaxSlot    = 5;
static const char*    kDevName    = "IR-Remote";
static const uint32_t kDebounceMs = 30;

// Button N -> slot N, fixed mapping. Pressed = LOW (INPUT_PULLUP to GND).
struct ButtonState {
  uint8_t  pin;
  uint8_t  slot;
  int      stable;        // debounced level; HIGH = released
  int      lastRead;
  uint32_t lastChangeMs;
};

// Perf-board build: button 1 is physically wired to GPIO5 (verified on the
// bench 2026-07-26 — a GPIO6 map printed clean at boot but no press ever
// registered, because nothing is connected to pin 6; the wire is on pin 5,
// button 1's original Phase 3 pin). GPIO5 is RTC-capable (S3 RTC pins are 0-21)
// so Phase 4's EXT1 deep-sleep wake still works. The custom PCB uses its own
// pin map (see hardware/DESIGN-pcb.md).
// Button 3 on GPIO7 (RTC-capable, not a strapping pin, adjacent on the header).
static ButtonState buttons[] = {
  { 5, 1, HIGH, HIGH, 0 },
  { 2, 2, HIGH, HIGH, 0 },
  { 7, 3, HIGH, HIGH, 0 },
};
static const size_t kNumButtons = sizeof(buttons) / sizeof(buttons[0]);

IRsend      irsend(kIrLedPin);
Preferences prefs;

NimBLECharacteristic* statusChar = nullptr;
static bool clientConnected = false;

// IR sends block for ~70ms and drive the RMT peripheral. Doing that inside a
// NimBLE callback runs it on the host task's limited stack, so trigger writes
// only set this flag and loop() does the actual send.
static volatile uint8_t pendingSlot = 0;

// ── status helper ───────────────────────────────────────────────────────────
void pushStatus(const String& msg) {
  Serial.print("[status] ");
  Serial.println(msg);
  if (statusChar) {
    statusChar->setValue(msg.c_str());
    if (clientConnected) statusChar->notify();
  }
}

// ── NVS layout: per slot, keys "p<N>" proto, "c<N>" code, "b<N>" bits ────────
static String keyFor(char prefix, uint8_t slot) {
  return String(prefix) + String(slot);
}

bool slotConfigured(uint8_t slot) {
  return prefs.isKey(keyFor('p', slot).c_str());
}

void saveSlot(uint8_t slot, const String& proto, uint64_t code, uint16_t bits) {
  prefs.putString(keyFor('p', slot).c_str(), proto);
  prefs.putULong64(keyFor('c', slot).c_str(), code);
  prefs.putUShort(keyFor('b', slot).c_str(), bits);
}

// ── IR ──────────────────────────────────────────────────────────────────────
bool protoSupported(const String& p) {
  return p == "NEC" || p == "SAMSUNG" || p == "SONY";
}

bool sendIr(const String& proto, uint64_t code, uint16_t bits) {
  if (proto == "NEC")      { irsend.sendNEC(code, bits);            return true; }
  if (proto == "SAMSUNG")  { irsend.sendSAMSUNG(code, bits);        return true; }
  if (proto == "SONY")     { irsend.sendSony(code, bits, 2);        return true; }
  return false;  // Sony wants >=2 repeats to be accepted by most sets
}

// ── shared send path (BLE trigger and button presses both land here) ────────
void fireSlot(uint8_t slot) {
  String   proto = prefs.getString(keyFor('p', slot).c_str());
  uint64_t code  = prefs.getULong64(keyFor('c', slot).c_str());
  uint16_t bits  = prefs.getUShort(keyFor('b', slot).c_str());

  Serial.printf("[ir] slot %u -> %s 0x%llX (%u bits)\n",
                slot, proto.c_str(), (unsigned long long)code, bits);

  if (sendIr(proto, code, bits)) {
    pushStatus(String("sent:") + slot);
  } else {
    pushStatus(String("err:unknown proto ") + proto);
  }
}

// ── buttons ─────────────────────────────────────────────────────────────────
// Fires on the press edge only, so holding a button does not repeat.
void pollButtons() {
  const uint32_t now = millis();

  for (size_t i = 0; i < kNumButtons; i++) {
    ButtonState& b = buttons[i];
    const int level = digitalRead(b.pin);

    if (level != b.lastRead) {          // still bouncing — restart the timer
      b.lastRead = level;
      b.lastChangeMs = now;
      continue;
    }
    if (now - b.lastChangeMs < kDebounceMs) continue;   // not settled yet
    if (level == b.stable) continue;                    // no edge

    b.stable = level;
    if (level != LOW) continue;         // release edge — ignore

    Serial.printf("[btn] GPIO%u pressed -> slot %u\n", b.pin, b.slot);
    pushStatus(String("pressed:") + b.slot);

    if (!slotConfigured(b.slot)) {
      Serial.printf("[btn] slot %u is empty — nothing to send\n", b.slot);
      pushStatus(String("err:empty:") + b.slot);
      continue;
    }
    fireSlot(b.slot);
  }
}

// ── config characteristic ───────────────────────────────────────────────────
class ConfigCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& connInfo) override {
    String raw = String(c->getValue().c_str());
    Serial.print("[ble] config write: ");
    Serial.println(raw);

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, raw);
    if (err) { pushStatus(String("err:bad json (") + err.c_str() + ")"); return; }

    int slot = doc["slot"] | 0;
    if (slot < kMinSlot || slot > kMaxSlot) {
      pushStatus("err:slot must be 1-5"); return;
    }

    String proto = String((const char*)(doc["proto"] | ""));
    proto.toUpperCase();
    if (!protoSupported(proto)) {
      pushStatus("err:proto must be NEC|SAMSUNG|SONY"); return;
    }

    String codeStr = String((const char*)(doc["code"] | ""));
    codeStr.trim();
    if (codeStr.isEmpty()) { pushStatus("err:missing code"); return; }
    // base 0 so both "0xE0E040BF" and bare hex/decimal parse
    char* end = nullptr;
    uint64_t code = strtoull(codeStr.c_str(), &end, 0);
    if (end == codeStr.c_str() || *end != '\0') {
      // retry as bare hex, e.g. "E0E040BF" without the 0x
      end = nullptr;
      code = strtoull(codeStr.c_str(), &end, 16);
      if (end == codeStr.c_str() || *end != '\0') {
        pushStatus("err:bad code"); return;
      }
    }

    int bits = doc["bits"] | 32;
    if (!((proto == "SONY" && (bits == 12 || bits == 15 || bits == 20)) ||
          ((proto == "NEC" || proto == "SAMSUNG") && bits == 32)) ||
        code >= (1ULL << bits)) { pushStatus("err:invalid width"); return; }

    saveSlot(slot, proto, code, bits);
    Serial.printf("[nvs] slot %d <- %s 0x%llX (%d bits)\n",
                  slot, proto.c_str(), (unsigned long long)code, bits);
    pushStatus(String("saved:") + slot);
  }
};

// ── trigger characteristic ──────────────────────────────────────────────────
class TriggerCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& connInfo) override {
    String raw = String(c->getValue().c_str());
    Serial.print("[ble] trigger write: ");
    Serial.println(raw);

    JsonDocument doc;
    if (deserializeJson(doc, raw)) { pushStatus("err:bad json"); return; }

    int slot = doc["slot"] | 0;
    if (slot < kMinSlot || slot > kMaxSlot) {
      pushStatus("err:slot must be 1-5"); return;
    }
    if (!slotConfigured(slot)) {
      pushStatus(String("err:slot ") + slot + " empty"); return;
    }
    pendingSlot = (uint8_t)slot;  // loop() performs the send
  }
};

// ── server callbacks ────────────────────────────────────────────────────────
class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& connInfo) override {
    clientConnected = true;
    Serial.println("[ble] client connected");
  }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& connInfo, int reason) override {
    clientConnected = false;
    pendingSlot = 0;  // discard a queued request; emitted IR cannot be recalled
    Serial.printf("[ble] client disconnected (reason %d), advertising again\n", reason);
    NimBLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);
  delay(2000);                       // let USB CDC enumerate before logging
  Serial.println();
  Serial.println("=== IR-Remote Phase 3 — BLE GATT + IR + buttons ===");

  irsend.begin();
  prefs.begin("irremote", false);

  for (size_t i = 0; i < kNumButtons; i++) {
    pinMode(buttons[i].pin, INPUT_PULLUP);
    Serial.printf("[btn] GPIO%u -> slot %u (INPUT_PULLUP, pressed = LOW)\n",
                  buttons[i].pin, buttons[i].slot);
  }

  // Sasori: leave fresh NVS empty. Existing flash slots are preserved.

  NimBLEDevice::init(kDevName);
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  NimBLEService* service = server->createService(SERVICE_UUID);

  NimBLECharacteristic* configChar =
      service->createCharacteristic(CONFIG_UUID, NIMBLE_PROPERTY::WRITE);
  configChar->setCallbacks(new ConfigCallbacks());

  NimBLECharacteristic* triggerChar =
      service->createCharacteristic(TRIGGER_UUID, NIMBLE_PROPERTY::WRITE);
  triggerChar->setCallbacks(new TriggerCallbacks());

  statusChar = service->createCharacteristic(
      STATUS_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  statusChar->setValue("ready");

  service->start();

  // The advertising payload is 31 bytes and a 128-bit service UUID eats 18 of
  // them (+3 flags), leaving no room for an 11-byte name field — the name would
  // be silently dropped or truncated, so a name-based scan filter never matches.
  // Keep the UUID in the advertisement and put the name in the scan response,
  // which gets its own 31 bytes.
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();

  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  advData.addServiceUUID(SERVICE_UUID);
  adv->setAdvertisementData(advData);

  NimBLEAdvertisementData scanData;
  scanData.setName(kDevName);
  adv->setScanResponseData(scanData);
  adv->enableScanResponse(true);

  NimBLEDevice::startAdvertising();

  Serial.printf("[ble] advertising as \"%s\"\n", kDevName);
  Serial.printf("[ble] service %s\n", SERVICE_UUID);
  Serial.println("[ble] ready — waiting for a client");

  // Show what's already stored, so the serial log alone explains the state.
  for (uint8_t s = kMinSlot; s <= kMaxSlot; s++) {
    if (!slotConfigured(s)) continue;
    Serial.printf("[nvs] slot %d = %s 0x%llX (%u bits)\n", s,
                  prefs.getString(keyFor('p', s).c_str()).c_str(),
                  (unsigned long long)prefs.getULong64(keyFor('c', s).c_str()),
                  prefs.getUShort(keyFor('b', s).c_str()));
  }
}

void loop() {
  uint8_t slot = pendingSlot;
  if (slot) {
    pendingSlot = 0;
    fireSlot(slot);
  }

  pollButtons();
  delay(5);   // 5ms poll is well inside the 30ms debounce window
}
