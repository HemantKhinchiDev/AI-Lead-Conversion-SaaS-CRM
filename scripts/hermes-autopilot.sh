#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/ubuntu/AI-Lead-Conversion-SaaS-CRM"
TASKS_FILE="$REPO_DIR/specs/002-universal-voice-sheets/tasks.md"
LOG_FILE="/tmp/hermes-autopilot.log"

cd "$REPO_DIR"

NEXT_TASK=$(grep -m 1 "^- \[ \]" "$TASKS_FILE" || true)

if [ -z "$NEXT_TASK" ]; then
  echo "ALL_TASKS_COMPLETED"
  exit 0
fi

echo "NEXT_TASK: $NEXT_TASK"

PROMPT="Read memory/constitution.md, docs/PRD.md, and specs/002-universal-voice-sheets/tasks.md.
Execute ONLY the first unchecked task:
$NEXT_TASK

Rules:
1. Write all required code/migrations directly in the repo.
2. Run the Verify command for this task. If build or tests fail, inspect the error and fix it automatically (up to 3 self-heal attempts) until it passes.
3. If the task requires running SQL in Supabase or adding a missing API key in apps/web/.env.local, output [ACTION_REQUIRED: RUN_SQL_IN_SUPABASE] or [ACTION_REQUIRED: ADD_ENV_KEY] clearly and stop.
4. Once the Verify command passes, mark the task [x] in specs/002-universal-voice-sheets/tasks.md, output [READY_FOR_PUSH] with a concise summary, and ask the user for approval before running git commit & push."

if opencode run --help >/dev/null 2>&1; then
  opencode run "$PROMPT" | tee "$LOG_FILE"
else
  opencode -p "$PROMPT" | tee "$LOG_FILE"
fi
