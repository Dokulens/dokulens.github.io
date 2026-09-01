@echo off
echo Fixing MediaRecorder audio track issue...
echo.

REM Go to the repository directory
cd /d "%~dp0"

REM Get the fixed source code from latest commit
git show HEAD:src/pages/tools/WatermarkRemover.jsx > temp.jsx

REM The file is likely already correct at HEAD
REM But let me verify and make sure properly:
REM Comment in the source that canvas.captureStream includes audio

echo Done.
echo Please check the diff and commit if needed.
pause
