@echo off
:: drive.bat - Proyek CLI Control System

:: Logika Navigasi
if "%1"=="push" goto push
if "%1"=="get" goto get

echo Penggunaan: drive [push ^| get] [argumen]
echo Contoh:
echo   drive push "pesan commit"
echo   drive get "https://link-ke-file-zip"
exit /b

:push
:: Cek apakah pesan commit ada (%2)
if "%~2"=="" (
    echo Error: Masukkan pesan commit untuk push!
    echo Penggunaan: drive push "pesan commit"
    exit /b
)

:: 1. Git Execution
echo === [GIT WORKFLOW] ===
git add .
git commit -m "%~2"
git push origin main

:: 2. Zip Compression (Mengecualikan .git, node_modules, dan file zip)
echo.
echo === [PACKAGING SNAPSHOT] ===
echo Mengemas project...
powershell -Command "Get-ChildItem -Path . -Recurse | Where-Object { $_.FullName -notmatch '\\\.git($|\\)' -and $_.FullName -notmatch '\\node_modules($|\\)' -and $_.Name -ne 'project_snapshot.zip' -and $_.Name -ne 'download_hasil.zip' } | Compress-Archive -DestinationPath project_snapshot.zip -Force"

:: 3. Send to Google Drive
echo.
echo === [UPLOADING TO DRIVE] ===
curl -L -X POST "https://script.google.com/macros/s/AKfycbwpvYldyYfEuZrHxZx0R1oCDB1UgA2zbu55DZ5dQ06MZF_7mnxaVpOEAzmz5OQrEWU7/exec" ^
     -F "file=@project_snapshot.zip" ^
     -F "message=%~2" ^
     -F "token=fadhli10124832"

:: Cleanup
del project_snapshot.zip
echo.
echo Selesai! Push berhasil dieksekusi.
exit /b

:get
:: Cek apakah URL zip ada (%2)
if "%~2"=="" (
    echo Error: Masukkan URL unduhan file ZIP!
    echo Penggunaan: drive get "URL_ZIP"
    exit /b
)

:: 1. Download
echo === [DOWNLOADING SNAPSHOT] ===
curl -L -o download_hasil.zip "%~2"

:: 2. Extract
echo.
echo === [EXTRACTING SNAPSHOT] ===
powershell -Command "Expand-Archive -Path download_hasil.zip -DestinationPath . -Force"

:: 3. Cleanup
del download_hasil.zip
echo.
echo Selesai! Kode berhasil diperbarui dari cloud.
exit /b
