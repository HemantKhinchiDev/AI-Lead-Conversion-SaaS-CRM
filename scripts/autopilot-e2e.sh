#!/usr/bin/env bash
set -uo pipefail

REPO_DIR="$HOME/AI-Lead-Conversion-SaaS-CRM"
WEB_DIR="$REPO_DIR/apps/web"
LIVE_URL="${LIVE_URL:-https://web-olive-delta-41.vercel.app}"
TARGET_PHONE="${TARGET_PHONE:-8264692424}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-4}"

cd "$REPO_DIR"
if [ -f "$WEB_DIR/.env.local" ]; then
  set -a
  source "$WEB_DIR/.env.local"
  set +a
fi

notify_hermes() {
  local msg="$1"
  local token="${TELEGRAM_BOT_TOKEN:-${HERMES_BOT_TOKEN:-${BOT_TOKEN:-}}}"
  local chat_id="${TELEGRAM_CHAT_ID:-${HERMES_CHAT_ID:-${ADMIN_CHAT_ID:-}}}"

  for env_file in "$HOME/hermes/.env" "$HOME/.env" "$REPO_DIR/.env"; do
    if [ -f "$env_file" ]; then
      if [ -z "$token" ]; then
        token=$(grep -E '^(TELEGRAM_BOT_TOKEN|HERMES_BOT_TOKEN|BOT_TOKEN)=' "$env_file" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
      fi
      if [ -z "$chat_id" ]; then
        chat_id=$(grep -E '^(TELEGRAM_CHAT_ID|HERMES_CHAT_ID|ADMIN_CHAT_ID|ALLOWED_USERS)=' "$env_file" | head -n1 | cut -d= -f2- | cut -d, -f1 | tr -d '"' | tr -d "'")
      fi
    fi
  done

  if [ -f "$HOME/hermes/hermes.py" ]; then
    eval "$(python3 -c '
import re
try:
    txt = open("/home/ubuntu/hermes/hermes.py", "r", encoding="utf-8", errors="ignore").read()
    tm = re.search(r"([0-9]{8,12}:[A-Za-z0-9_-]{30,})", txt)
    cm = re.search(r"(?:CHAT_ID|ADMIN_ID|ALLOWED_USERS)[^0-9]*([0-9]{6,15})", txt)
    if tm: print(f"token=\"{tm.group(1)}\"")
    if cm: print(f"chat_id=\"{cm.group(1)}\"")
except Exception:
    pass
')"
  fi

  if [ -n "$token" ] && [ -n "$chat_id" ]; then
    curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" \
      -d "chat_id=${chat_id}" \
      --data-urlencode "text=${msg}" >/dev/null
    echo "[HERMES] Telegram notification sent to chat_id=${chat_id}."
  else
    echo "[HERMES] Warning: Telegram token/chat_id not found. Message:"
    echo "$msg"
  fi
}

auto_fix_from_log() {
  local log_file="$1"
  local fixed=1

  if grep -q "is not assignable to type '\"edge-tts\" | \"unavailable\"'" "$log_file"; then
    node -e '
      const fs = require("fs");
      const p = "apps/web/src/app/api/voice/respond/route.ts";
      if (fs.existsSync(p)) {
        const s = fs.readFileSync(p, "utf8").replaceAll("\"edge-tts\" | \"unavailable\"", "\"sarvam\" | \"edge-tts\" | \"unavailable\"");
        fs.writeFileSync(p, s, "utf8");
      }
    '
    echo "[AUTO-FIX] Updated ttsProvider union type."
    fixed=0
  fi

  if grep -q "llama-3.3-70b-versatile" "$log_file"; then
    sed -i 's/llama-3.3-70b-versatile/qwen\/qwen3.8-27b/g' "$WEB_DIR/src/lib/knowledgeBase.ts"
    echo "[AUTO-FIX] Switched Groq model to qwen/qwen3.8-27b."
    fixed=0
  fi

  return "$fixed"
}

run_e2e_checks() {
  local log_file="$1"
  : > "$log_file"

  echo ">>> [1/4] TypeScript type check (tsc --noEmit)..."
  (cd "$WEB_DIR" && npx tsc --noEmit) 2>&1 | tee -a "$log_file"
  [ "${PIPESTATUS[0]}" -eq 0 ] || return 1

  echo ">>> [2/4] Unit & bridge tests (apps/web)..."
  if grep -q '"test"' "$WEB_DIR/package.json"; then
    (cd "$WEB_DIR" && env -u VOBIZ_AUTH_ID -u VOBIZ_AUTH_TOKEN -u VOBIZ_FROM_NUMBER -u VOBIZ_API_KEY -u VOBIZ_ACCOUNT_ID -u VOBIZ_ANSWER_URL npm test) 2>&1 | tee -a "$log_file"
    [ "${PIPESTATUS[0]}" -eq 0 ] || return 1
  fi

  echo ">>> [3/4] Sarvam TTS + Groq live check..."
  (cd "$WEB_DIR" && npx --yes tsx -e '
    process.loadEnvFile(".env.local");
    import { synthesizeSpeech } from "./src/lib/edgeTts";
    (async () => {
      const t0 = performance.now();
      const tts = await synthesizeSpeech("नमस्ते, अहमदाबाद में 3BHK विकल्प उपलब्ध हैं।", "hi-IN", { gender: "female" });
      const ms = Math.round(performance.now() - t0);
      if (!tts.audioBase64 || tts.audioBase64.length < 1000) {
        throw new Error("TTS audio missing: " + (tts.warning || tts.provider));
      }
      console.log("TTS_OK provider=" + tts.provider + " voice=" + tts.voice + " ms=" + ms + " bytes=" + tts.audioBase64.length);
    })().catch((e) => { console.error(e); process.exit(1); });
  ') 2>&1 | tee -a "$log_file"
  [ "${PIPESTATUS[0]}" -eq 0 ] || return 1

  echo ">>> [4/4] Next.js production build..."
  (cd "$WEB_DIR" && npm run build) 2>&1 | tee -a "$log_file"
  [ "${PIPESTATUS[0]}" -eq 0 ] || return 1

  return 0
}

LOG_FILE="/tmp/autopilot-e2e.log"
PASSED=0

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "=== AUTOPILOT E2E ATTEMPT $attempt / $MAX_ATTEMPTS ==="
  if run_e2e_checks "$LOG_FILE"; then
    PASSED=1
    break
  fi
  echo "[FAIL] Attempt $attempt failed."
  if auto_fix_from_log "$LOG_FILE"; then
    echo "[RETRY] Applied auto-fix..."
  else
    echo "[STOP] Fix manually and re-run."
    break
  fi
done

if [ "$PASSED" -ne 1 ]; then
  echo "AUTOPILOT_STATUS=BLOCKED"
  exit 1
fi

echo "=== ALL E2E CHECKS PASSED — PUSHING & DEPLOYING ==="
git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore(autopilot): pass E2E gate with Groq qwen3.8-27b and Sarvam TTS"
fi
git push origin master
(cd "$REPO_DIR" && npx vercel --prod --yes)

echo "=== POST-DEPLOY LIVE ROUTE CHECK (NO CALL) ==="
XML_STATUS=$(curl -s -o /tmp/vobiz-xml-check.txt -w "%{http_code}" "${LIVE_URL}/api/voice/vobiz-xml?lang=hi-IN&leadName=Rohan")
echo "VOBIZ_XML_HTTP=$XML_STATUS"
if [ "$XML_STATUS" -lt 200 ] || [ "$XML_STATUS" -ge 300 ]; then
  echo "POST_DEPLOY_CHECK_FAILED: vobiz-xml returned $XML_STATUS"
  exit 1
fi

MSG="✅ Autopilot E2E & Vercel Deploy PASSED!
🌐 URL: ${LIVE_URL}
📞 Test Call Target: ${TARGET_PHONE}
⏳ Call ABHI NAHI KI GAYI HAI. Reply 'OK' or 'CALL ${TARGET_PHONE}' to trigger the live test call."

notify_hermes "$MSG"
echo "AUTOPILOT_STATUS=READY_FOR_CALL_CONFIRMATION (Target: ${TARGET_PHONE})"
