$ErrorActionPreference = "Stop"

# -----------------------------
# Settings
# -----------------------------
$ManifestName = "manifest.json"

$Items = @(
    "manifest.json",
    "html",
    "js",
    "css",
    "popup",
    "icons"
)

$ReleaseDir = "releases"
$TempDir = "temp_creation"

$ToolsDir = "tools"
$PortableNodeDir = "tools\node"
$NodeVersion = "v24.15.0"
$NodeZipName = "node-$NodeVersion-win-x64.zip"
$NodeZipUrl = "https://nodejs.org/dist/$NodeVersion/$NodeZipName"

$RequiredPackages = @(
    "html-minifier-terser",
    "terser",
    "clean-css-cli"
)

# -----------------------------
# Helpers
# -----------------------------
function Write-Step {
    param([string]$Message)

    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-ItemLog {
    param([string]$Message)

    Write-Host "   $Message" -ForegroundColor Gray
}

function Fail {
    param([string]$Message)

    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Test-CommandExists {
    param([string]$Command)

    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-LocalBin {
    param([string]$CommandName)

    return Join-Path $ProjectRoot "node_modules\.bin\$CommandName.cmd"
}

function Remove-FolderContents {
    param([string]$Folder)

    if (Test-Path -LiteralPath $Folder) {
        Get-ChildItem -LiteralPath $Folder -Force | Remove-Item -Recurse -Force
    }
}

function Safe-ZipNamePart {
    param([string]$Value)

    $invalidChars = [System.IO.Path]::GetInvalidFileNameChars()

    foreach ($char in $invalidChars) {
        $Value = $Value.Replace($char, "_")
    }

    return $Value.Trim()
}

function Download-PortableNode {
    Write-Step "Downloading portable Node.js"

    $ToolsPath = Join-Path $ProjectRoot $ToolsDir
    $PortableNodePath = Join-Path $ProjectRoot $PortableNodeDir
    $DownloadPath = Join-Path $ToolsPath $NodeZipName
    $ExtractPath = Join-Path $ToolsPath "node_extract"

    if (-not (Test-Path -LiteralPath $ToolsPath)) {
        New-Item -ItemType Directory -Path $ToolsPath | Out-Null
        Write-ItemLog "Created folder: $ToolsDir"
    }

    if (Test-Path -LiteralPath $DownloadPath) {
        Remove-Item -LiteralPath $DownloadPath -Force
    }

    if (Test-Path -LiteralPath $ExtractPath) {
        Remove-Item -LiteralPath $ExtractPath -Recurse -Force
    }

    if (Test-Path -LiteralPath $PortableNodePath) {
        Remove-Item -LiteralPath $PortableNodePath -Recurse -Force
    }

    Write-ItemLog "Downloading: $NodeZipUrl"
    Write-ItemLog "Saving to: $DownloadPath"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $NodeZipUrl -OutFile $DownloadPath
    } catch {
        Fail "Could not download portable Node.js. $($_.Exception.Message)"
    }

    Write-ItemLog "Downloaded portable Node.js ZIP"

    Write-Step "Extracting portable Node.js"

    New-Item -ItemType Directory -Path $ExtractPath | Out-Null

    Expand-Archive -LiteralPath $DownloadPath -DestinationPath $ExtractPath -Force

    $ExtractedFolder = Get-ChildItem -LiteralPath $ExtractPath -Directory | Select-Object -First 1

    if ($null -eq $ExtractedFolder) {
        Fail "Could not find extracted Node.js folder."
    }

    Move-Item -LiteralPath $ExtractedFolder.FullName -Destination $PortableNodePath -Force

    Remove-Item -LiteralPath $ExtractPath -Recurse -Force
    Remove-Item -LiteralPath $DownloadPath -Force

    Write-ItemLog "Portable Node.js installed to: $PortableNodePath"
}

function Enable-PortableNode {
    $PortableNodePath = Join-Path $ProjectRoot $PortableNodeDir
    $PortableNodeExe = Join-Path $PortableNodePath "node.exe"
    $PortableNpmCmd = Join-Path $PortableNodePath "npm.cmd"

    if (-not (Test-Path -LiteralPath $PortableNodeExe)) {
        return $false
    }

    if (-not (Test-Path -LiteralPath $PortableNpmCmd)) {
        return $false
    }

    $env:Path = "$PortableNodePath;$env:Path"

    Write-ItemLog "Using portable Node.js: $PortableNodeExe"

    return $true
}

# -----------------------------
# Start in script folder
# -----------------------------
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "Release script started" -ForegroundColor Green
Write-Host "Project folder: $ProjectRoot"

# -----------------------------
# Basic checks
# -----------------------------
Write-Step "Checking required files"

$ManifestPath = Join-Path $ProjectRoot $ManifestName

if (-not (Test-Path -LiteralPath $ManifestPath)) {
    Fail "manifest.json not found."
}

Write-ItemLog "Found manifest.json"

# -----------------------------
# Check Node/npm or install portable Node
# -----------------------------
Write-Step "Checking Node.js and npm"

$UsingSystemNode = $false
$UsingPortableNode = $false

if ((Test-CommandExists "node") -and (Test-CommandExists "npm")) {
    $UsingSystemNode = $true
    Write-ItemLog "System Node.js found"
} else {
    Write-ItemLog "System Node.js was not found"

    if (Enable-PortableNode) {
        $UsingPortableNode = $true
    } else {
        Write-ItemLog "Portable Node.js was not found in $PortableNodeDir"
        Download-PortableNode

        if (Enable-PortableNode) {
            $UsingPortableNode = $true
        } else {
            Fail "Portable Node.js was downloaded, but node.exe or npm.cmd could not be found."
        }
    }
}

if (-not (Test-CommandExists "node")) {
    Fail "Node.js is still not available."
}

if (-not (Test-CommandExists "npm")) {
    Fail "npm is still not available."
}

$DetectedNodeVersion = node --version
$DetectedNpmVersion = npm --version

Write-ItemLog "Node.js: $DetectedNodeVersion"
Write-ItemLog "npm: $DetectedNpmVersion"

if ($UsingSystemNode) {
    Write-ItemLog "Node source: system PATH"
}

if ($UsingPortableNode) {
    Write-ItemLog "Node source: local portable tools\node"
}

# -----------------------------
# Ensure package.json exists
# -----------------------------
Write-Step "Checking local npm project"

$PackageJsonPath = Join-Path $ProjectRoot "package.json"

if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
    Write-ItemLog "package.json not found. Creating one locally..."
    npm init -y
} else {
    Write-ItemLog "package.json found"
}

# -----------------------------
# Ensure local minifier packages
# -----------------------------
Write-Step "Checking local minifier packages"

$HtmlMinifier = Get-LocalBin "html-minifier-terser"
$Terser = Get-LocalBin "terser"
$CleanCss = Get-LocalBin "cleancss"

$MissingPackages = @()

if (-not (Test-Path -LiteralPath $HtmlMinifier)) {
    $MissingPackages += "html-minifier-terser"
}

if (-not (Test-Path -LiteralPath $Terser)) {
    $MissingPackages += "terser"
}

if (-not (Test-Path -LiteralPath $CleanCss)) {
    $MissingPackages += "clean-css-cli"
}

if ($MissingPackages.Count -gt 0) {
    Write-ItemLog "Missing local packages:"

    foreach ($Package in $MissingPackages) {
        Write-ItemLog "- $Package"
    }

    Write-Host ""
    Write-Host "Installing missing packages locally in this project..." -ForegroundColor Yellow

    npm install --save-dev @MissingPackages

    Write-Host ""
    Write-Host "Package installation finished" -ForegroundColor Green
} else {
    Write-ItemLog "All required minifier packages are already installed locally"
}

# Re-check after install
if (-not (Test-Path -LiteralPath $HtmlMinifier)) {
    Fail "html-minifier-terser is still missing after npm install."
}

if (-not (Test-Path -LiteralPath $Terser)) {
    Fail "terser is still missing after npm install."
}

if (-not (Test-Path -LiteralPath $CleanCss)) {
    Fail "clean-css-cli is still missing after npm install."
}

Write-ItemLog "Using: $HtmlMinifier"
Write-ItemLog "Using: $Terser"
Write-ItemLog "Using: $CleanCss"

# -----------------------------
# Read manifest
# -----------------------------
Write-Step "Reading manifest data"

try {
    $Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
} catch {
    Fail "Could not read or parse manifest.json. $($_.Exception.Message)"
}

$ExtName = [string]$Manifest.name
$ExtVersion = [string]$Manifest.version

if ([string]::IsNullOrWhiteSpace($ExtName)) {
    Fail "manifest.json does not contain a valid name."
}

if ([string]::IsNullOrWhiteSpace($ExtVersion)) {
    Fail "manifest.json does not contain a valid version."
}

$ExtNameSafe = Safe-ZipNamePart $ExtName
$ExtVersionClean = $ExtVersion.Replace(".", "")
$ZipName = "${ExtNameSafe}_${ExtVersionClean}.zip"

$ReleasePath = Join-Path $ProjectRoot $ReleaseDir
$ZipPath = Join-Path $ReleasePath $ZipName
$TempPath = Join-Path $ProjectRoot $TempDir

Write-ItemLog "Extension name: $ExtName"
Write-ItemLog "Version: $ExtVersion"
Write-ItemLog "Zip file: $ZipName"

# -----------------------------
# Create releases folder
# -----------------------------
Write-Step "Preparing release folder"

if (-not (Test-Path -LiteralPath $ReleasePath)) {
    New-Item -ItemType Directory -Path $ReleasePath | Out-Null
    Write-ItemLog "Created folder: $ReleaseDir"
} else {
    Write-ItemLog "Release folder already exists"
}

if (Test-Path -LiteralPath $ZipPath) {
    Write-Host ""
    Write-Host "Existing release zip found:" -ForegroundColor Yellow
    Write-Host $ZipPath
    Write-Host "It will be overwritten." -ForegroundColor Yellow

    Remove-Item -LiteralPath $ZipPath -Force

    Write-ItemLog "Deleted old zip"
}

# -----------------------------
# Prepare temp folder
# -----------------------------
Write-Step "Preparing temp folder"

if (Test-Path -LiteralPath $TempPath) {
    Write-ItemLog "temp_creation exists. Deleting its contents..."
    Remove-FolderContents $TempPath
} else {
    New-Item -ItemType Directory -Path $TempPath | Out-Null
    Write-ItemLog "Created temp_creation folder"
}

# -----------------------------
# Main release work
# -----------------------------
try {
    # -----------------------------
    # Copy selected files/folders
    # -----------------------------
    Write-Step "Copying release items to temp_creation"

    foreach ($Item in $Items) {
        $SourcePath = Join-Path $ProjectRoot $Item
        $DestinationPath = Join-Path $TempPath $Item

        if (Test-Path -LiteralPath $SourcePath -PathType Container) {
            Write-ItemLog "Copying folder: $Item"
            Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Recurse -Force
        }
        elseif (Test-Path -LiteralPath $SourcePath -PathType Leaf) {
            Write-ItemLog "Copying file: $Item"

            $DestinationFolder = Split-Path -Parent $DestinationPath

            if (-not (Test-Path -LiteralPath $DestinationFolder)) {
                New-Item -ItemType Directory -Path $DestinationFolder | Out-Null
            }

            Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
        }
        else {
            Write-ItemLog "Skipping missing item: $Item"
        }
    }

    # -----------------------------
    # Minify HTML
    # -----------------------------
    Write-Step "Minifying HTML files"

    $HtmlFiles = Get-ChildItem -LiteralPath $TempPath -Recurse -File -Filter "*.html"

    if ($HtmlFiles.Count -eq 0) {
        Write-ItemLog "No HTML files found"
    } else {
        foreach ($File in $HtmlFiles) {
            $TmpFile = "$($File.FullName).tmp"
            $RelativeFile = $File.FullName.Replace($TempPath, $TempDir)

            Write-ItemLog "Minifying HTML: $RelativeFile"

            & $HtmlMinifier `
                $File.FullName `
                --collapse-whitespace `
                --remove-comments `
                --remove-redundant-attributes `
                --remove-script-type-attributes `
                --remove-style-link-type-attributes `
                --minify-css true `
                --minify-js true `
                -o $TmpFile

            if ($LASTEXITCODE -ne 0) {
                throw "Failed to minify HTML file: $($File.FullName)"
            }

            Move-Item -LiteralPath $TmpFile -Destination $File.FullName -Force
        }
    }

    # -----------------------------
    # Minify JS
    # -----------------------------
    Write-Step "Minifying JavaScript files"

    $JsFiles = Get-ChildItem -LiteralPath $TempPath -Recurse -File -Filter "*.js"

    if ($JsFiles.Count -eq 0) {
        Write-ItemLog "No JavaScript files found"
    } else {
        foreach ($File in $JsFiles) {
            $TmpFile = "$($File.FullName).tmp"
            $RelativeFile = $File.FullName.Replace($TempPath, $TempDir)

            Write-ItemLog "Minifying JS: $RelativeFile"

            & $Terser `
                $File.FullName `
                --compress `
                --mangle `
                --output $TmpFile

            if ($LASTEXITCODE -ne 0) {
                throw "Failed to minify JavaScript file: $($File.FullName)"
            }

            Move-Item -LiteralPath $TmpFile -Destination $File.FullName -Force
        }
    }

    # -----------------------------
    # Minify CSS
    # -----------------------------
    Write-Step "Minifying CSS files"

    $CssFiles = Get-ChildItem -LiteralPath $TempPath -Recurse -File -Filter "*.css"

    if ($CssFiles.Count -eq 0) {
        Write-ItemLog "No CSS files found"
    } else {
        foreach ($File in $CssFiles) {
            $TmpFile = "$($File.FullName).tmp"
            $RelativeFile = $File.FullName.Replace($TempPath, $TempDir)

            Write-ItemLog "Minifying CSS: $RelativeFile"

            & $CleanCss `
                -o $TmpFile `
                $File.FullName

            if ($LASTEXITCODE -ne 0) {
                throw "Failed to minify CSS file: $($File.FullName)"
            }

            Move-Item -LiteralPath $TmpFile -Destination $File.FullName -Force
        }
    }

    # -----------------------------
    # Zip temp_creation contents
    # -----------------------------
    Write-Step "Creating release zip"

    $TempContents = Join-Path $TempPath "*"

    Compress-Archive `
        -Path $TempContents `
        -DestinationPath $ZipPath `
        -CompressionLevel Optimal `
        -Force

    Write-ItemLog "Created zip: $ZipPath"

    Write-Host ""
    Write-Host "Release created successfully:" -ForegroundColor Green
    Write-Host $ZipPath -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "Release failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    Write-Step "Cleaning up temp folder"

    if (Test-Path -LiteralPath $TempPath) {
        Remove-Item -LiteralPath $TempPath -Recurse -Force
        Write-ItemLog "Deleted temp_creation folder"
    } else {
        Write-ItemLog "temp_creation folder was already gone"
    }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green