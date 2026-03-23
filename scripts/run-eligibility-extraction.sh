#!/bin/bash
# Batch eligibility extraction runner
# Calls POST /api/cron/extract-eligibility repeatedly to process all grants

BASE_URL="http://localhost:5000"
ENDPOINT="/api/cron/extract-eligibility"
BATCH_SIZE=5
DELAY_BETWEEN_AI_BATCHES=2000
MAX_PER_CALL=50
PRIORITY_SOURCES='["Vinnova","Energimyndigheten","Tillväxtverket","EU Funding"]'
DELAY_BETWEEN_CALLS=2

TOTAL_PROCESSED=0
TOTAL_SUCCESSFUL=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
ITERATION=0

echo "==========================================="
echo "Eligibility Extraction Batch Runner"
echo "==========================================="
echo "Batch size: $BATCH_SIZE per AI call"
echo "Max per API call: $MAX_PER_CALL"
echo "Delay between AI batches: ${DELAY_BETWEEN_AI_BATCHES}ms"
echo "Delay between API calls: ${DELAY_BETWEEN_CALLS}s"
echo "Priority sources: $PRIORITY_SOURCES"
echo "==========================================="

while true; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "--- Iteration $ITERATION (total processed so far: $TOTAL_PROCESSED) ---"

  RESPONSE=$(curl -s -X POST "$BASE_URL$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{
      \"apiKey\": \"$CRON_API_KEY\",
      \"batchSize\": $BATCH_SIZE,
      \"delayBetweenBatchesMs\": $DELAY_BETWEEN_AI_BATCHES,
      \"maxGrants\": $MAX_PER_CALL,
      \"prioritySources\": $PRIORITY_SOURCES
    }" \
    --max-time 600)

  if [ $? -ne 0 ]; then
    echo "ERROR: curl failed"
    break
  fi

  SUCCESS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success', False))" 2>/dev/null)
  
  if [ "$SUCCESS" != "True" ]; then
    echo "ERROR: API returned error: $RESPONSE"
    break
  fi

  PROCESSED=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['processed'])" 2>/dev/null)
  SUCCESSFUL=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['successful'])" 2>/dev/null)
  FAILED=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['failed'])" 2>/dev/null)
  SKIPPED=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['skipped'])" 2>/dev/null)

  TOTAL_PROCESSED=$((TOTAL_PROCESSED + PROCESSED))
  TOTAL_SUCCESSFUL=$((TOTAL_SUCCESSFUL + SUCCESSFUL))
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + SKIPPED))

  echo "Batch result: processed=$PROCESSED, successful=$SUCCESSFUL, failed=$FAILED, skipped=$SKIPPED"
  echo "Running totals: processed=$TOTAL_PROCESSED, successful=$TOTAL_SUCCESSFUL, failed=$TOTAL_FAILED, skipped=$TOTAL_SKIPPED"

  if [ "$PROCESSED" -eq 0 ] || [ "$PROCESSED" -lt "$MAX_PER_CALL" ]; then
    echo ""
    echo "==========================================="
    echo "ALL GRANTS PROCESSED"
    echo "Total: processed=$TOTAL_PROCESSED, successful=$TOTAL_SUCCESSFUL, failed=$TOTAL_FAILED, skipped=$TOTAL_SKIPPED"
    echo "==========================================="
    break
  fi

  echo "Waiting ${DELAY_BETWEEN_CALLS}s before next batch..."
  sleep $DELAY_BETWEEN_CALLS
done
