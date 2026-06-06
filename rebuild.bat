@echo off
echo ===================================================
echo   Tablecast Update and Rebuild Script
echo ===================================================

echo.
echo [1/4] Checking for local changes...
git diff --quiet
set GIT_DIFF_ERR=%errorlevel%
git diff --cached --quiet
set GIT_DIFF_CACHED_ERR=%errorlevel%

set HAS_CHANGES=0
if %GIT_DIFF_ERR% neq 0 set HAS_CHANGES=1
if %GIT_DIFF_CACHED_ERR% neq 0 set HAS_CHANGES=1

if %HAS_CHANGES%==1 (
    echo Local changes detected. Stashing local changes...
    git stash save "rebuild.bat auto-stash"
    set STASHED=1
) else (
    echo No local changes to stash.
    set STASHED=0
)

echo.
echo [2/4] Pulling latest updates from repository...
git pull
if %errorlevel% neq 0 (
    echo Warning: git pull failed.
    if %STASHED%==1 (
        echo Restoring stashed local changes...
        git stash pop
    )
    echo Aborting Docker rebuild due to git pull failure.
    exit /b 1
)

if %STASHED%==1 (
    echo.
    echo Restoring stashed local changes...
    git stash pop
)

echo.
echo [3/4] Rebuilding and starting Docker containers...
docker compose up --build -d
if %errorlevel% neq 0 (
    echo Error: Docker build/startup failed.
    exit /b %errorlevel%
)

echo.
echo [4/4] Cleaning up unused intermediate Docker images...
docker image prune -f

echo.
echo ===================================================
echo   Containers rebuilt successfully!
echo   Recent diagnostic logs (last 20 lines):
echo ===================================================
docker compose logs --tail=20

echo.
echo Update and rebuild process completed.
