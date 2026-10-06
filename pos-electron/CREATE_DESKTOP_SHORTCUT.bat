@echo off
title Lucerne POS - Create Desktop Shortcut
rem Creates a "Lucerne POS" shortcut on the Desktop that uses the Lucerne logo as its icon.
set "APPDIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Lucerne POS.lnk'); $s.TargetPath='%APPDIR%START.bat'; $s.WorkingDirectory='%APPDIR%'; $s.IconLocation='%APPDIR%assets\icon.ico'; $s.WindowStyle=7; $s.Description='Lucerne POS'; $s.Save()"
echo.
echo  Done - "Lucerne POS" shortcut (with the Lucerne logo) was added to your Desktop.
echo.
pause
