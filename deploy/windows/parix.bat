@echo off
setlocal

if defined PARIX_HOME (
    set "ROOT=%PARIX_HOME%"
) else (
    set "ROOT=%~dp0..\.."
)

set "LAUNCHER=%ROOT%\bin\parix.ps1"
if not exist "%LAUNCHER%" (
    echo [parix] Missing launcher: %LAUNCHER%
    exit /b 1
)

if "%1"=="--stop" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%" stop
) else if "%1"=="status" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%" status
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%" start
)
