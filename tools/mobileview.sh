#!/usr/bin/env bash
set -euo pipefail

# Open the landing page in an Android emulator, on a real phone browser.
#
#   pnpm mobileview              # Pixel_5
#   pnpm mobileview Pixel_9_Pro  # any AVD from `emulator -list-avds`
#
# Every step checks before it starts something, so a second run reuses the
# dev server, the display and the booted emulator and only re-opens the page.
#
# WHY THERE IS A DISPLAY STEP
#
# The emulator's bundled Qt ships xcb and no wayland plugin. On a Wayland-only
# session with DISPLAY unset it dies at launch with "no Qt platform plugin
# could be initialized". niri 26.04 starts xwayland-satellite itself and sets
# DISPLAY -- but only if the binary was on PATH when niri STARTED, and a lock
# and unlock is not a restart. So when DISPLAY is empty this script runs
# xwayland-satellite on :1 itself instead of failing.
#
# WHY adb reverse
#
# `localhost` on the phone is the phone. `adb reverse` points its :3001 (web)
# and :3000 (server) back at this machine, so the page loads from the same
# URL as on the desktop and NEXT_PUBLIC_SERVER_URL needs no LAN address. The
# mapping does not survive an emulator restart, so it is re-applied every run.

AVD="${1:-Pixel_5}"
WEB_PORT=3001
SERVER_PORT=3000
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
EMULATOR="$SDK/emulator/emulator"
ADB="$SDK/platform-tools/adb"
LOGS="${XDG_RUNTIME_DIR:-/tmp}/mobileview"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$LOGS"

listening() { ss -ltn "sport = :$1" | grep -q LISTEN; }

[[ -x "$EMULATOR" ]] || { echo "No emulator at $EMULATOR (set ANDROID_HOME)." >&2; exit 1; }
"$EMULATOR" -list-avds | grep -qx "$AVD" \
  || { echo "No AVD named $AVD. Have: $("$EMULATOR" -list-avds | tr '\n' ' ')" >&2; exit 1; }

# 1. Dev server.
if listening "$WEB_PORT"; then
  echo "dev server: already on :$WEB_PORT"
else
  echo "dev server: starting (log: $LOGS/dev.log)"
  (cd "$ROOT" && nohup pnpm dev >"$LOGS/dev.log" 2>&1 &)
fi

# 2. X display for the emulator.
if [[ -z "${DISPLAY:-}" ]]; then
  if [[ ! -S /tmp/.X11-unix/X1 ]]; then
    command -v xwayland-satellite >/dev/null \
      || { echo "DISPLAY is unset and xwayland-satellite is not installed." >&2; exit 1; }
    echo "display: starting xwayland-satellite on :1"
    nohup xwayland-satellite :1 >"$LOGS/xwayland-satellite.log" 2>&1 &
    for _ in $(seq 1 20); do [[ -S /tmp/.X11-unix/X1 ]] && break; sleep 0.25; done
  fi
  export DISPLAY=:1
fi
echo "display: $DISPLAY"

# 3. Emulator.
"$ADB" start-server >/dev/null 2>&1
if "$ADB" devices | grep -q '^emulator-.*device$'; then
  echo "emulator: already running"
else
  echo "emulator: starting $AVD (log: $LOGS/emulator.log)"
  EMU_LAUNCHER=()
  if command -v prime-run >/dev/null 2>&1; then
    EMU_LAUNCHER+=(prime-run)
  fi
  nohup "${EMU_LAUNCHER[@]}" "$EMULATOR" -avd "$AVD" -no-snapshot-save -memory 4096 >"$LOGS/emulator.log" 2>&1 &
fi
"$ADB" wait-for-device
echo -n "emulator: booting"
until [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; do
  echo -n .; sleep 2
done
echo " done"

# 4. Wait for the site, so Chrome does not open on a connection error while
#    Next is still starting.
echo -n "site: waiting for :$WEB_PORT"
until listening "$WEB_PORT"; do echo -n .; sleep 1; done
echo " up"

# 5. Ports and page.
"$ADB" reverse "tcp:$WEB_PORT" "tcp:$WEB_PORT" >/dev/null
"$ADB" reverse "tcp:$SERVER_PORT" "tcp:$SERVER_PORT" >/dev/null
"$ADB" shell am start -a android.intent.action.VIEW \
  -d "http://localhost:$WEB_PORT" com.android.chrome >/dev/null
echo "opened http://localhost:$WEB_PORT on $AVD"
