# File Cards Viewer

A simple Electron app that lets you select files and displays them as evenly distributed cards in a grid layout (minimum 4x4).

## Features

- Select multiple files using a file picker
- Files are displayed as cards in an evenly distributed grid
- Minimum 4x4 grid (16 cards) - empty slots are shown if fewer files are selected
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
2. Choose one or more files from the file picker
3. Files will be displayed as cards in a grid layout
4. If you select fewer than 16 files, empty placeholder cards will fill the grid to maintain the 4x4 minimum

## Building for Mac

To compile the app for Mac:

1. Install dependencies (if not already done):
```bash
npm install
```

2. Build for Mac:
```bash
npm run build:mac
```

This will create a DMG file in the `dist` folder that you can distribute. The build includes both Intel (x64) and Apple Silicon (arm64) versions.

Alternatively, you can build for all platforms:
```bash
npm run build
```

**Note:** The first build may take a while as electron-builder downloads the necessary Electron binaries for packaging.
