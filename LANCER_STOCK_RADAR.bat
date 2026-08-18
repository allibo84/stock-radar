@echo off
setlocal
cd /d "%~dp0"

echo ======================================
echo        STOCK RADAR - MODE LOCAL
echo ======================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    start "" http://127.0.0.1:8080
    echo Stock Radar est disponible sur http://127.0.0.1:8080
    echo Ferme cette fenetre pour arreter le serveur local.
    py -m http.server 8080 --bind 127.0.0.1
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" http://127.0.0.1:8080
    echo Stock Radar est disponible sur http://127.0.0.1:8080
    echo Ferme cette fenetre pour arreter le serveur local.
    python -m http.server 8080 --bind 127.0.0.1
    goto :eof
)

echo Python n'est pas installe ou n'est pas accessible dans le PATH.
echo Installe Python 3 puis relance ce fichier.
echo.
pause
