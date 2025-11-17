# Building for Windows

## Option 1: Build on Windows (Recommended)

If you're on Windows, simply run:

```bash
go mod download
go build -o soundboard.exe .
```

Or use the provided batch file:
```bash
build-windows.bat
```

## Option 2: Cross-compile from macOS/Linux

Cross-compiling GUI applications with Fyne requires CGO and a Windows C compiler toolchain. This is complex to set up.

**Recommended approach:** Build directly on Windows, or use a Windows virtual machine/CI service.

## Requirements for Windows Build

- Go 1.21 or later
- CGO enabled (usually enabled by default)
- GCC compiler (MinGW-w64) - usually comes with Go installation on Windows

## Troubleshooting

If you get "diese app kann auf dem PC nicht ausgeführt werden" (this app cannot be executed on this PC):

1. Make sure you built the executable on Windows, or
2. Make sure you're using the correct architecture (amd64 for Intel/AMD processors)
3. Try building with: `CGO_ENABLED=1 GOOS=windows GOARCH=amd64 go build -o soundboard.exe .`

## Verifying the Build

After building, you can verify the executable is for Windows:
- On Windows: Right-click → Properties → should show "Windows Application"
- On Linux/Mac: Run `file soundboard.exe` - should show "PE32+ executable"

