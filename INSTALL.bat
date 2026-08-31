@echo off
title Segmenta - One-Click Installer
echo ======================================================
echo   SEGMENTA - One-Click Windows Installer & Setup
echo ======================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "BIN_DIR=%SCRIPT_DIR%bin"
set "HOST_MANIFEST=%SCRIPT_DIR%crates\segmenta-host\manifest-chrome.json"
set "EXT_DIR=%SCRIPT_DIR%apps\extension\dist"

echo [1/3] Checking pre-compiled binary...
if exist "%BIN_DIR%\Segmenta.exe" (
    echo [OK] Segmenta.exe is ready in bin\ folder.
) else (
    echo [INFO] Compiling Segmenta binary...
    powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install-windows.ps1"
)

echo.
echo [2/3] Registering Browser Native Messaging Host...
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.segmenta.downloader" /ve /t REG_SZ /d "%HOST_MANIFEST%" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.segmenta.downloader" /ve /t REG_SZ /d "%HOST_MANIFEST%" /f >nul 2>&1
echo [OK] Browser integration registered successfully.

echo.
echo [3/3] Creating Desktop Shortcut...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Segmenta.lnk')); $Shortcut.TargetPath = '%BIN_DIR%\Segmenta.exe'; $Shortcut.WorkingDirectory = '%BIN_DIR%'; $Shortcut.IconLocation = '%BIN_DIR%\Segmenta.exe,0'; $Shortcut.Save()"
echo [OK] Desktop shortcut created.

echo.
echo ======================================================
echo   Setup Complete! Launching Segmenta...
echo ======================================================
start "" "%BIN_DIR%\Segmenta.exe"
exit /b 0
