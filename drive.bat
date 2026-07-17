@echo off
cd /d "%~dp0"

:: ============================================================
::  drive.bat - Cyber Vault CLI  v1.1
::  Secure Cloud Storage Control System
:: ============================================================

set "PS_CMD=powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0src\cli.ps1""
set "ARG1=%~1"
set "ARG2=%~2"

if "%ARG1%"=="" goto :help
if "%ARG1%"=="-h" goto :help
if "%ARG1%"=="--help" goto :help
if "%ARG1%"=="-v" goto :version
if "%ARG1%"=="--version" goto :version
if "%ARG1%"=="push" goto :push
if "%ARG1%"=="get"  goto :get

%PS_CMD% -Action error-unknown -Arg1 "%ARG1%"
exit /b 1

:help
%PS_CMD% -Action help
exit /b 0

:version
%PS_CMD% -Action version
exit /b 0

:push
if "%~2"=="" (
  %PS_CMD% -Action error-msg -Arg1 "Missing commit message" -Arg2 "Usage: drive push \"message\""
  exit /b 1
)

%PS_CMD% -Action push-header

%PS_CMD% -Action step -Arg1 "[1/3]" -Arg2 "Git workflow" -Arg3 "commit & push"
git add .
if errorlevel 1 (
  %PS_CMD% -Action fail -Arg1 "Git add failed"
  exit /b 1
)
git commit -m "%~2"
git push origin main
%PS_CMD% -Action ok -Arg1 "Git push complete"

echo.
%PS_CMD% -Action step -Arg1 "[2/3]" -Arg2 "Packaging" -Arg3 "compress snapshot"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path . -Recurse | Where-Object { $_.FullName -notmatch '\\\\.git($|\\\\)' -and $_.FullName -notmatch '\\\\node_modules($|\\\\)' -and $_.Name -ne 'project_snapshot.zip' -and $_.Name -ne 'download_hasil.zip' } | Compress-Archive -DestinationPath project_snapshot.zip -Force"
if errorlevel 1 (
  %PS_CMD% -Action fail -Arg1 "Packaging failed"
  exit /b 1
)
%PS_CMD% -Action ok -Arg1 "Snapshot created: project_snapshot.zip"

echo.
%PS_CMD% -Action step -Arg1 "[3/3]" -Arg2 "Uploading" -Arg3 "sending to Google Drive"
curl -L -X POST "https://script.google.com/macros/s/AKfycbwpvYldyYfEuZrHxZx0R1oCDB1UgA2zbu55DZ5dQ06MZF_7mnxaVpOEAzmz5OQrEWU7/exec" -F "file=@project_snapshot.zip" -F "message=%~2" -F "token=fadhli10124832"

del project_snapshot.zip >nul 2>&1

echo.
%PS_CMD% -Action push-success
exit /b 0

:get
if "%~2"=="" (
  %PS_CMD% -Action error-msg -Arg1 "Missing download URL!" -Arg2 "Usage: drive get <url>"
  exit /b 1
)

%PS_CMD% -Action get-header

%PS_CMD% -Action step -Arg1 "[1/2]" -Arg2 "Downloading" -Arg3 "fetching snapshot"
curl -L -o download_hasil.zip "%~2"
if errorlevel 1 (
  %PS_CMD% -Action fail -Arg1 "Download failed"
  exit /b 1
)
%PS_CMD% -Action ok -Arg1 "Download complete"

echo.
%PS_CMD% -Action step -Arg1 "[2/2]" -Arg2 "Extracting" -Arg3 "unpacking snapshot"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path download_hasil.zip -DestinationPath . -Force"
if errorlevel 1 (
  %PS_CMD% -Action fail -Arg1 "Extraction failed"
  exit /b 1
)
%PS_CMD% -Action ok -Arg1 "Extraction complete"

del download_hasil.zip >nul 2>&1

echo.
%PS_CMD% -Action get-success
exit /b 0
