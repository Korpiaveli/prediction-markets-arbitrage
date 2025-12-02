# PowerShell version for Windows
# Automation script to fetch historical data for all Kalshi-PredictIt matched pairs
# Usage: .\scripts\fetch-all-historical.ps1 [-Days 30]

param(
    [int]$Days = 30  # Default to 30 days if not specified
)

$DATA_DIR = "./data/historical"
$CLI_PATH = "./apps/cli/dist/index.js"

# Create historical data directory
New-Item -ItemType Directory -Force -Path $DATA_DIR | Out-Null

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Historical Data Collection Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Fetching $Days days of history..."
Write-Host "Output directory: $DATA_DIR"
Write-Host ""

# 8 Kalshi-PredictIt matched pairs from predictit-matches.json
$MARKETS = @(
    "POWER-28-RH-RS-RP",    # Republican trifecta 2028
    "HOUSE-26",             # House control 2026
    "HOUSE-28",             # House control 2028
    "SENATE-26",            # Senate control 2026
    "SENATE-28",            # Senate control 2028
    "PRES-28"               # Presidential election 2028
)

$SUCCESS_COUNT = 0
$FAIL_COUNT = 0

foreach ($MARKET in $MARKETS) {
    Write-Host "-----------------------------------" -ForegroundColor Yellow
    Write-Host "Fetching: $MARKET" -ForegroundColor Yellow
    Write-Host "-----------------------------------" -ForegroundColor Yellow

    $timestamp = Get-Date -Format "yyyyMMdd"
    $outputPath = "$DATA_DIR/historical_${MARKET}_${timestamp}.json"

    try {
        & node $CLI_PATH fetch-historical `
            --market $MARKET `
            --days $Days `
            --data-dir $DATA_DIR `
            --output $outputPath

        if ($LASTEXITCODE -eq 0) {
            $SUCCESS_COUNT++
            Write-Host "✓ Success: $MARKET" -ForegroundColor Green
        } else {
            $FAIL_COUNT++
            Write-Host "✗ Failed: $MARKET (may not exist or have trades)" -ForegroundColor Red
        }
    } catch {
        $FAIL_COUNT++
        Write-Host "✗ Failed: $MARKET - $_" -ForegroundColor Red
    }

    Write-Host ""

    # Rate limiting: small delay between requests
    Start-Sleep -Seconds 2
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Collection Complete" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Successful: $SUCCESS_COUNT markets" -ForegroundColor Green
Write-Host "Failed: $FAIL_COUNT markets" -ForegroundColor $(if ($FAIL_COUNT -gt 0) { "Red" } else { "Green" })
Write-Host "Data saved to: $DATA_DIR"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. View collected data: Get-ChildItem $DATA_DIR"
Write-Host "2. Analyze patterns: node $CLI_PATH patterns --data-dir $DATA_DIR"
Write-Host "3. Run backtest (when opportunities found): node $CLI_PATH backtest --data-dir ./data"
Write-Host ""
