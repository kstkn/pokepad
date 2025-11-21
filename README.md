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

### macOS Gatekeeper Warning

If you see a "damaged and can't be opened" error on macOS, this is because the app isn't code signed. To run it:

**Terminal method (recommended):**
1. Open Terminal
2. Navigate to where you downloaded/extracted the app (usually Downloads folder)
3. Run this command (adjust the path if needed):
   ```bash
   xattr -cr pokepad.app
   ```
   Or if it's in a specific location:
   ```bash
   xattr -cr /path/to/pokepad.app
   ```
4. Try opening the app again

**Alternative method:**
If the above doesn't work, you may need to disable Gatekeeper temporarily (not recommended for security):
```bash
sudo spctl --master-disable
```
Then re-enable it after:
```bash
sudo spctl --master-disable
```

**Note:** Once code signing is set up, this warning will no longer appear.

## Continuous Integration

This project uses GitHub Actions to automatically build packages for macOS and Windows:

- **Build workflow**: Runs on pull requests and can be triggered manually
- **Release workflow**: Automatically creates GitHub releases when you push a version tag (e.g., `v1.0.0`)

### Creating a Release

To create a new release:

1. Update the version in `package.json`
2. Commit your changes
3. Create and push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

The GitHub Actions workflow will automatically:
- Build macOS (DMG) and Windows (NSIS installer) packages
- Create a GitHub release with the built packages
- Upload artifacts for download

## Requirements

- Node.js (v16 or higher recommended)
- npm or yarn

## Supported Platforms

- macOS (Apple Silicon - arm64)
- Windows (x64)

## Code Signing Policy

Free code signing provided by SignPath.io, certificate by SignPath Foundation. See [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Packaged with [electron-builder](https://www.electron.build/)
