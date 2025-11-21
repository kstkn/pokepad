# Pokepad

A simple Electron app for organizing and playing audio files as cards in a grid layout.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- Select multiple audio files using a file picker
- Files are displayed as cards in an evenly distributed grid
- Play, pause, and control audio playback
- Set cue points for quick access to specific positions
- Organize files into multiple tabs
- Rename cards with custom names
- Move or copy cards between tabs
- Drag and drop to reorder cards
- Modern, clean UI with hover effects

## Installation

1. Install dependencies:
```bash
npm install
```

## Running

Start the app:
```bash
npm start
```

## Usage

1. Click the "Select Files" button
2. Choose one or more audio files from the file picker
3. Files will be displayed as cards in a grid layout
4. Click a card to play/pause the audio
5. Use the controls on each card to:
   - Rename cards (✎ button)
   - Set cue points (C button)
   - Play from cue point (▶C button)
   - Move/copy to another tab (⇆ button)
   - Remove cards (× button)
6. Click "Edit" to enable drag-and-drop reordering
7. Add new tabs using the "+" button to organize your sounds

## Building

To compile the app:

1. Install dependencies (if not already done):
```bash
npm install
```

2. Build for Mac:
```bash
npm run build:mac
```

This will create a DMG file in the `dist` folder that you can distribute. The Mac build includes Apple Silicon (arm64) support.

Alternatively, you can build for all platforms:
```bash
npm run build
```

**Note:** The first build may take a while as electron-builder downloads the necessary Electron binaries for packaging.

## Requirements

- Node.js (v16 or higher recommended)
- npm or yarn

## Supported Platforms

- macOS (Apple Silicon - arm64)
- Windows (x64)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Packaged with [electron-builder](https://www.electron.build/)
