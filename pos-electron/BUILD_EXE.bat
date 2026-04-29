@echo off
title Lucerne POS - Build EXE
echo.
echo  ====================================
echo   Lucerne POS - Building .exe ...
echo  ====================================
echo.

IF NOT EXIST node_modules (
  echo  Installing dependencies, please wait...
  call npm install
  echo.
)

echo  Building Windows installer...
echo  This may take 2-5 minutes...
echo.
call npm run build:win

echo.
IF EXIST dist (
  echo  ====================================
  echo   SUCCESS! Your .exe is in the dist folder.
  echo   Open the dist folder and run the installer.
  echo  ====================================
  start explorer dist
) ELSE (
  echo  Build may have had an issue. Check the output above.
)
echo.
pause
