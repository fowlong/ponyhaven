@echo off
cd /d "%~dp0"
node scripts\publish-github.mjs
echo.
pause
