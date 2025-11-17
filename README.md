# Soundboard App

A simple soundboard application for Windows built with Go. This app allows you to select audio files (MP3, WAV, OGG) and assign them to buttons for quick playback.

## Features

- Select audio files (MP3, WAV, OGG formats)
- Assign audio files to buttons with custom labels
- Click buttons to play sounds
- Remove sounds from the board
- Clean, simple GUI interface

## Requirements

- Go 1.21 or later
- Windows OS (tested on Windows 10/11)

## Building

**Important:** This app must be built on Windows, or cross-compiled with CGO enabled.

### On Windows:

1. Open Command Prompt or PowerShell in the project directory
2. Run:
   ```bash
   go mod download
   go build -o soundboard.exe .
   ```

Or simply run the provided batch file:
```bash
build-windows.bat
```

### Cross-compiling from macOS/Linux:

Cross-compiling GUI apps with Fyne requires CGO and a Windows C compiler toolchain. It's recommended to build directly on Windows instead.

If you must cross-compile, you'll need:
- CGO enabled
- MinGW-w64 or similar Windows C compiler toolchain
- Then run: `CGO_ENABLED=1 GOOS=windows GOARCH=amd64 go build -o soundboard.exe .`

## Running

After building, run the executable:
```bash
./soundboard.exe
```

Or on Windows, double-click `soundboard.exe`.

## Usage

1. Click the "Add Sound" button
2. Select an audio file (MP3, WAV, or OGG format)
3. The file will appear as a button with the filename as the label
4. Click any button to play its sound
5. Click the "×" button next to a sound to remove it

## Supported Formats

- MP3 (.mp3)
- WAV (.wav)
- OGG (.ogg) - Note: Full OGG support may require additional decoders

## Notes

- The app creates a new audio stream for each playback, allowing multiple sounds to play simultaneously
- Audio files are loaded from disk each time they're played, so make sure the files remain accessible
- The app uses a 44.1kHz sample rate for audio playback

## License

This is a simple example application. Feel free to modify and use as needed.

