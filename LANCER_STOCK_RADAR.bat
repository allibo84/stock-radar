@echo off
setlocal
cd /d "%~dp0"

set "PORT=8080"
set "URL=http://127.0.0.1:%PORT%"

echo ======================================
echo        STOCK RADAR - MODE LOCAL
echo ======================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    start "" %URL%
    echo Stock Radar est disponible sur %URL%
    echo Ferme cette fenetre pour arreter le serveur local.
    py -3 -m http.server %PORT% --bind 127.0.0.1
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" %URL%
    echo Stock Radar est disponible sur %URL%
    echo Ferme cette fenetre pour arreter le serveur local.
    python -m http.server %PORT% --bind 127.0.0.1
    goto :eof
)

echo Python n'est pas installe ou n'est pas accessible dans le PATH.
echo Installe Python 3 puis relance ce fichier.
echo Pendant l'installation, coche Add Python to PATH.
echo.
pause
