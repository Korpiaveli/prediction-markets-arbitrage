@echo off
REM Kill background processes on common dev ports
REM Usage: kill-background-processes.bat

echo Checking for processes on ports 3000, 3001...

REM Find and kill processes on port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing process on port 3000 (PID: %%a)
    taskkill //F //PID %%a
)

REM Find and kill processes on port 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo Killing process on port 3001 (PID: %%a)
    taskkill //F //PID %%a
)

echo Done.
