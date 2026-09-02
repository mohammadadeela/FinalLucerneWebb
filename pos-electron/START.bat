@echo off
title Lucerne POS
echo.
echo  ====================================
echo   Lucerne POS - Starting...
echo  ====================================
echo.

IF NOT EXIST node_modules (
  echo  Installing dependencies, please wait...
  call npm install
  echo.
)

echo  Opening Lucerne POS...
call npm start
