#!/bin/bash
# Automation script to fetch historical data for all Kalshi-PredictIt matched pairs
# Usage: bash scripts/fetch-all-historical.sh [days]

DAYS=${1:-30}  # Default to 30 days if not specified
DATA_DIR="./data/historical"
CLI_PATH="./apps/cli/dist/index.js"

# Create historical data directory
mkdir -p "$DATA_DIR"

echo "========================================="
echo "  Historical Data Collection Script"
echo "========================================="
echo "Fetching $DAYS days of history..."
echo "Output directory: $DATA_DIR"
echo ""

# 8 Kalshi-PredictIt matched pairs from predictit-matches.json
# These are political markets about 2026/2028 House control

MARKETS=(
  "POWER-28-RH-RS-RP"    # Republican trifecta 2028
  "HOUSE-26"             # House control 2026
  "HOUSE-28"             # House control 2028
  "SENATE-26"            # Senate control 2026
  "SENATE-28"            # Senate control 2028
  "PRES-28"              # Presidential election 2028
)

SUCCESS_COUNT=0
FAIL_COUNT=0

for MARKET in "${MARKETS[@]}"; do
  echo "-----------------------------------"
  echo "Fetching: $MARKET"
  echo "-----------------------------------"

  if node "$CLI_PATH" fetch-historical \
    --market "$MARKET" \
    --days "$DAYS" \
    --data-dir "$DATA_DIR" \
    --output "$DATA_DIR/historical_${MARKET}_$(date +%Y%m%d).json"; then

    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    echo "✓ Success: $MARKET"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "✗ Failed: $MARKET (may not exist or have trades)"
  fi

  echo ""

  # Rate limiting: small delay between requests
  sleep 2
done

echo "========================================="
echo "  Collection Complete"
echo "========================================="
echo "Successful: $SUCCESS_COUNT markets"
echo "Failed: $FAIL_COUNT markets"
echo "Data saved to: $DATA_DIR"
echo ""
echo "Next steps:"
echo "1. View collected data: ls -lh $DATA_DIR"
echo "2. Analyze patterns: node $CLI_PATH patterns --data-dir $DATA_DIR"
echo "3. Run backtest (when opportunities found): node $CLI_PATH backtest --data-dir ./data"
echo ""
