@echo off
echo Building Soundboard for Windows...
go mod download
go build -o soundboard.exe .
if %ERRORLEVEL% EQU 0 (
    echo Build successful! Run soundboard.exe to start the app.
) else (
    echo Build failed. Make sure you have Go installed and CGO enabled.
    pause
)

