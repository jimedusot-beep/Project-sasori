#!/bin/bash
set -eu
task_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$task_dir"
exec python3 sasori_hub.py --listen 0.0.0.0 --allow-lan --open
