@echo off
REM Automation script to fetch historical data for all Kalshi-PredictIt matched pairs
REM Usage: scripts\fetch-all-k-p-pairs.bat [days]

SET DAYS=%1
IF "%DAYS%"=="" SET DAYS=30

SET DATA_DIR=./data/historical
SET CLI_PATH=./apps/cli/dist/index.js

echo =========================================
echo   Historical Data Collection Script
echo =========================================
echo Fetching %DAYS% days of history...
echo Output directory: %DATA_DIR%
echo.

mkdir %DATA_DIR% 2>nul

REM 8 Kalshi markets (matched with PredictIt)
SET MARKETS=POWER-28-RH-RS-RP HOUSE-26 HOUSE-28 SENATE-26 SENATE-28 PRES-28

FOR %%M IN (%MARKETS%) DO (
    echo -----------------------------------
    echo Fetching: %%M
    echo -----------------------------------

    node %CLI_PATH% fetch-historical --market %%M --days %DAYS% --data-dir %DATA_DIR%

    echo.
    timeout /t 2 /nobreak >nul
)

echo =========================================
echo   Collection Complete
echo =========================================
echo Data saved to: %DATA_DIR%
echo.
echo Next steps:
echo 1. View: dir %DATA_DIR%
echo 2. Patterns: node %CLI_PATH% patterns --data-dir %DATA_DIR%
echo 3. Backtest: node %CLI_PATH% backtest --data-dir ./data
echo.
