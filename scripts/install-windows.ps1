# Segmenta — One-Click Automated Setup for Windows
# Run via: powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  ⚡ SEGMENTA — One-Click Installer & Configuration  " -ForegroundColor White
Write-Host "======================================================" -ForegroundColor Cyan

$RepoRoot = Split-Path -Parent $PSScriptRoot
$HostBin = "$RepoRoot\target\release\segmenta-host.exe"
$HostManifest = "$RepoRoot\crates\segmenta-host\manifest-chrome.json"

Write-Host "`n[1/3] Compiling Native Messaging Host (Release mode)..." -ForegroundColor Yellow
Set-Location $RepoRoot
cargo build --release -p segmenta-host

if (-not (Test-Path $HostBin)) {
    Write-Host "❌ Failed to compile segmenta-host.exe. Please ensure Rust is installed." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Host binary compiled at: $HostBin" -ForegroundColor Green

Write-Host "`n[2/3] Registering Native Messaging Host to Windows Registry..." -ForegroundColor Yellow
# Register Chrome
New-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.segmenta.downloader" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.segmenta.downloader" -Name "(Default)" -Value $HostManifest

# Register Edge
New-Item -Path "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.segmenta.downloader" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.segmenta.downloader" -Name "(Default)" -Value $HostManifest

Write-Host "✓ Registry keys registered for Chrome and Edge." -ForegroundColor Green

Write-Host "`n[3/3] Building Manifest V3 Browser Extension..." -ForegroundColor Yellow
npm --prefix "$RepoRoot\apps\extension" run build
Write-Host "✓ Extension built in: $RepoRoot\apps\extension\dist" -ForegroundColor Green

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  🎉 Segmenta is fully configured and ready to run!   " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "To launch Segmenta Desktop:" -ForegroundColor White
Write-Host "  npm run dev:desktop" -ForegroundColor Yellow
Write-Host "`nTo load extension into Chrome/Edge:" -ForegroundColor White
Write-Host "  1. Open chrome://extensions" -ForegroundColor Gray
Write-Host "  2. Enable 'Developer mode'" -ForegroundColor Gray
Write-Host "  3. Click 'Load unpacked' -> $RepoRoot\apps\extension\dist" -ForegroundColor Gray
