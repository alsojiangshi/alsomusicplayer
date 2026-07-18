$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$productName = node .github/scripts/release-meta.mjs product-name
$bundleVersion = node .github/scripts/release-meta.mjs bundle-version
$releaseDir = Join-Path $repoRoot 'packages/gui/src-tauri/target/release'
$portableRoot = Join-Path $repoRoot 'dist/windows/portable'
$portableZip = Join-Path $repoRoot "dist/windows/$productName-gui-v$bundleVersion-windows-x64-portable.zip"
$sourceExe = Join-Path $releaseDir 'also-music-player.exe'
$portableMarker = Join-Path $portableRoot 'portable.json'

if (-not (Test-Path $sourceExe)) {
  throw "Missing $sourceExe. Run 'pnpm build:tauri:local' or 'pnpm build:tauri' first."
}

if (Test-Path $portableRoot) {
  Remove-Item -LiteralPath $portableRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $portableRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $portableRoot 'data') | Out-Null
Copy-Item -LiteralPath $sourceExe -Destination (Join-Path $portableRoot "$productName.exe") -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination (Join-Path $portableRoot 'LICENSE') -Force
Set-Content -LiteralPath $portableMarker -Value (@{
  dataDir = 'data'
} | ConvertTo-Json) -Encoding utf8

foreach ($pattern in @('*.dll', '*.pak', '*.dat', '*.bin', '*.json')) {
  Get-ChildItem -Path $releaseDir -File -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $portableRoot $_.Name) -Force
  }
}

foreach ($directoryName in @('locales', 'resources')) {
  $sourceDir = Join-Path $releaseDir $directoryName
  if (Test-Path $sourceDir) {
    Copy-Item -LiteralPath $sourceDir -Destination (Join-Path $portableRoot $directoryName) -Recurse -Force
  }
}

if (Test-Path $portableZip) {
  Remove-Item -LiteralPath $portableZip -Force
}

Compress-Archive -Path (Join-Path $portableRoot '*') -DestinationPath $portableZip -CompressionLevel Optimal

Write-Host "Portable package created at: $portableZip"
