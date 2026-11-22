#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/ubuntu/.local/bin:$PATH"
REPO="/home/ubuntu/AI-Lead-Conversion-SaaS-CRM"
LOG_FILE="/tmp/hermes-autopilot.log"
PROMPT_FILE="/tmp/hermes-prompt.txt"
cd "$REPO"

NEXT_TASK=$(grep -m1 '^- \[ \]' specs/002-universal-voice-sheets/tasks.md || true)
if [ -z "$NEXT_TASK" ]; then
  echo "ALL_TASKS_COMPLETED"
  exit 0
fi

cat << EOP > "$PROMPT_FILE"
Read memory/constitution.md and specs/002-universal-voice-sheets/tasks.md.
Execute ONLY the first unchecked task:
${NEXT_TASK}

Rules:
1. Write all required code directly in the repo (reuse existing partial files if valid).
2. Run the Verify command for this task and self-heal up to 3 attempts until it passes.
3. If SQL in Supabase or a missing API key in apps/web/.env.local is needed, output [ACTION_REQUIRED: RUN_SQL_IN_SUPABASE] or [ACTION_REQUIRED: ADD_ENV_KEY] and stop.
4. Once Verify passes, mark the task [x] in specs/002-universal-voice-sheets/tasks.md and output [READY_FOR_PUSH] with a concise summary.
EOP

: > "$LOG_FILE"
timeout 420s script -q -f -c 'opencode run "$(cat /tmp/hermes-prompt.txt)"' "$LOG_FILE" >/dev/null 2>&1 || true
cat "$LOG_FILE"
