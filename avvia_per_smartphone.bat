@echo off
chcp 65001 >nul
title MedLogix - Server Smartphone & PC
cd /d "%~dp0"

echo ===================================================================
echo     🏥 MEDLOGIX - ACCESSO DA SMARTPHONE, TABLET E PC
echo ===================================================================
echo.
echo Ricerca dell'indirizzo IP locale del tuo computer...

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "127.0.0.1"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
set IP=%IP: =%

if "%IP%"=="" set IP=localhost

echo.
echo ===================================================================
echo   📱 PER ACCEDERE DAL TUO SMARTPHONE (iPhone o Android):
echo.
echo   1. Assicurati che lo smartphone sia connesso allo STESSO Wi-Fi
echo   2. Apri il browser del telefono (Safari o Chrome)
echo   3. Digita questo indirizzo:
echo.
echo        http://%IP%:8080
echo.
echo ===================================================================
echo   💻 PER ACCEDERE DA QUESTO PC:
echo        http://localhost:8080
echo ===================================================================
echo.
echo Avvio del server web locale in corso...
echo (Lascia questa finestra aperta finche' usi l'app dallo smartphone)
echo.

where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    python -m http.server 8080
    goto :end
)

where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    py -m http.server 8080
    goto :end
)

where npx >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    npx serve -l 8080
    goto :end
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = 8080; $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://*:' + $port + '/'); try { $listener.Start(); } catch { $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:' + $port + '/'); $listener.Start(); } Write-Host 'Server PowerShell attivo su porta ' $port; while ($listener.IsListening) { $context = $listener.GetContext(); $req = $context.Request; $res = $context.Response; $urlPath = $req.Url.LocalPath.TrimStart('/'); if ([string]::IsNullOrEmpty($urlPath)) { $urlPath = 'index.html' }; $filePath = Join-Path (Get-Location) $urlPath; if (Test-Path $filePath -PathType Leaf) { $bytes = [System.IO.File]::ReadAllBytes($filePath); $ext = [System.IO.Path]::GetExtension($filePath).ToLower(); if ($ext -eq '.html') { $res.ContentType = 'text/html; charset=utf-8' } elseif ($ext -eq '.js') { $res.ContentType = 'application/javascript; charset=utf-8' } elseif ($ext -eq '.css') { $res.ContentType = 'text/css' } elseif ($ext -eq '.json') { $res.ContentType = 'application/json' }; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length); } else { $res.StatusCode = 404 }; $res.OutputStream.Close(); }"

:end
pause
