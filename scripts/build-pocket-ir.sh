#!/usr/bin/env bash
set -euo pipefail
# Reproducible version selection; builds only, never discovers ports or flashes.
SASORI_IR_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SASORI_IR_TMP="$(mktemp -d)"
trap 'rm -rf "$SASORI_IR_TMP"' EXIT
curl --fail --location --retry 3 https://github.com/arduino/arduino-cli/releases/download/v1.5.1/arduino-cli_1.5.1_Linux_64bit.tar.gz -o "$SASORI_IR_TMP/cli.tar.gz"
(cd "$SASORI_IR_TMP" && echo '28a8e119c498a25607821c36cb2dc49e8463941b261a0d99091baa7bc692dd2b  cli.tar.gz' | sha256sum --check)
tar -xzf "$SASORI_IR_TMP/cli.tar.gz" -C "$SASORI_IR_TMP"
SASORI_IR_CLI="$SASORI_IR_TMP/arduino-cli"
export ARDUINO_DIRECTORIES_DATA="$SASORI_IR_TMP/data"
export ARDUINO_DIRECTORIES_DOWNLOADS="$SASORI_IR_TMP/downloads"
export ARDUINO_DIRECTORIES_USER="$SASORI_IR_TMP/user"
"$SASORI_IR_CLI" core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
"$SASORI_IR_CLI" core install esp32:esp32@3.3.10 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
"$SASORI_IR_CLI" lib install 'IRremoteESP8266@2.9.0' 'NimBLE-Arduino@2.5.0' 'ArduinoJson@7.4.3'
"$SASORI_IR_CLI" compile --fqbn esp32:esp32:esp32s3:CDCOnBoot=cdc --warnings all --output-dir "$SASORI_IR_ROOT/build/pocket-ir" "$SASORI_IR_ROOT/hardware/pocket-ir/remote_ble"
(cd "$SASORI_IR_ROOT/build/pocket-ir" && sha256sum ./*.bin > SHA256SUMS)
