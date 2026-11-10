#!/bin/sh
# Entrypoint for the n8n container: import the committed workflow, publish it
# so its webhook is live, then start n8n. Re-importing on every start keeps the
# running workflow in sync with workflows/library-chat.json.
set -e

WORKFLOW_FILE=/workflows/library-chat.json
WORKFLOW_ID=$(node -e "process.stdout.write(require('$WORKFLOW_FILE').id)")

echo "Importing $WORKFLOW_FILE (id $WORKFLOW_ID)"
n8n import:workflow --input="$WORKFLOW_FILE"

echo "Publishing workflow $WORKFLOW_ID"
n8n publish:workflow --id="$WORKFLOW_ID"

exec n8n start
