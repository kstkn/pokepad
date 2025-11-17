# Soundboard App

A simple cross-platform soundboard application built with Go. This app allows you to select audio files (MP3, WAV, OGG) and assign them to buttons for quick playback. Works on Windows, macOS, and Linux.

## Features

- Select audio files (MP3, WAV, OGG formats)
- Assign audio files to buttons with custom labels
- Click buttons to play sounds
- Remove sounds from the board
- Clean, simple GUI interface

## Requirements

- Go 1.21 or later
- Windows, macOS, or Linux (tested on Windows 10/11 and macOS)

## Building

### On macOS:

```bash
go mod download
go build -o soundboard .
```

Then run: `./soundboard`

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

### On Linux:

```bash
go mod download
go build -o soundboard .
```

### Cross-compiling:

Cross-compiling GUI apps with Fyne requires CGO enabled. For Windows from macOS/Linux, you'll need:
- CGO enabled
- MinGW-w64 or similar Windows C compiler toolchain
- Then run: `CGO_ENABLED=1 GOOS=windows GOARCH=amd64 go build -o soundboard.exe .`

## Running

After building, run the executable:
- **macOS/Linux:** `./soundboard`
- **Windows:** `./soundboard.exe` or double-click `soundboard.exe`

## Usage

1. Click the "Add Sound" button
2. Select an audio file (MP3, WAV, or OGG format)
3. The file will appear as a button with the filename as the label
4. Click any button to play its sound
5. Click the "×" button next to a sound to remove it

## Supported Formats

- MP3 (.mp3)
- WAV (.wav)
- M4A (.m4a) - Requires ffmpeg to be installed (see below)
- OGG (.ogg) - Note: Full OGG support may require additional decoders

### M4A Support

M4A files are supported through automatic conversion using ffmpeg. To use M4A files:

1. Install ffmpeg:
   - **macOS:** `brew install ffmpeg`
   - **Windows:** Download from https://ffmpeg.org/download.html or use `choco install ffmpeg`
   - **Linux:** `sudo apt-get install ffmpeg` or `sudo yum install ffmpeg`

2. Make sure ffmpeg is in your system PATH

3. The app will automatically convert M4A files to WAV when loading them

## Notes

- The app creates a new audio stream for each playback, allowing multiple sounds to play simultaneously
- Audio files are loaded from disk each time they're played, so make sure the files remain accessible
- The app uses a 44.1kHz sample rate for audio playback

## License

This is a simple example application. Feel free to modify and use as needed.

