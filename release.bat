@echo off
setlocal enabledelayedexpansion

set "MANIFEST=manifest.json"
set "ITEMS=manifest.json html js css popup icons"
set "RELEASE_DIR=releases"

if not exist "%MANIFEST%" (
    echo Error: manifest.json not found.
    pause
    exit /b 1
)

if not exist "%RELEASE_DIR%" (
    mkdir "%RELEASE_DIR%"
)

for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-Content '%MANIFEST%' -Raw | ConvertFrom-Json).name"`) do set "EXT_NAME=%%A"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-Content '%MANIFEST%' -Raw | ConvertFrom-Json).version"`) do set "EXT_VERSION=%%A"

set "EXT_VERSION_CLEAN=%EXT_VERSION:.=%"
set "ZIP_NAME=%EXT_NAME%_%EXT_VERSION_CLEAN%.zip"
set "ZIP_PATH=%RELEASE_DIR%\%ZIP_NAME%"

set "FILE_ALREADY_EXISTED=0"

if exist "%ZIP_PATH%" (
    set "FILE_ALREADY_EXISTED=1"
    echo File already exists:
    echo %ZIP_PATH%
    echo.
    echo It will be overwritten.
    echo.
    pause
    del "%ZIP_PATH%"
)

powershell -NoProfile -Command ^
    "$ErrorActionPreference = 'Stop';" ^
    "Add-Type -AssemblyName System.IO.Compression;" ^
    "Add-Type -AssemblyName System.IO.Compression.FileSystem;" ^
    "$zipPath = '%ZIP_PATH%';" ^
    "if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }" ^
    "$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create);" ^
    "try {" ^
    "  $items = @('manifest.json','html','js','css','popup','icons') | Where-Object { Test-Path -LiteralPath $_ };" ^
    "  foreach ($item in $items) {" ^
    "    $resolved = Resolve-Path -LiteralPath $item;" ^
    "    if (Test-Path -LiteralPath $resolved.Path -PathType Leaf) {" ^
    "      $entryName = $item.Replace('\', '/');" ^
    "      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $resolved.Path, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null;" ^
    "    } else {" ^
    "      Get-ChildItem -LiteralPath $resolved.Path -Recurse -File | ForEach-Object {" ^
    "        $relativePath = Join-Path $item $_.FullName.Substring($resolved.Path.Length).TrimStart('\', '/');" ^
    "        $entryName = $relativePath.Replace('\', '/');" ^
    "        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null;" ^
    "      }" ^
    "    }" ^
    "  }" ^
    "} finally { $zip.Dispose() }"

if errorlevel 1 (
    echo Error: Failed to create zip.
    pause
    exit /b 1
)

echo Created: %ZIP_PATH%
