package main

import (
	"encoding/json"
	"fmt"
	"image/color"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
	"github.com/faiface/beep"
	"github.com/faiface/beep/mp3"
	"github.com/faiface/beep/speaker"
	"github.com/faiface/beep/wav"
)

type SoundButton struct {
	button         *widget.Button
	buttonBg       *canvas.Rectangle
	progressBar    *widget.ProgressBar
	container      *fyne.Container
	filePath       string
	format         beep.Format
	color          color.RGBA
	isPlaying      bool
	isPaused       bool
	ctrl           *beep.Ctrl
	streamer       beep.StreamSeekCloser
	pausedPos      int
	totalLength    int
	totalDuration  time.Duration
	startTime      time.Time
	pausedDuration time.Duration
	stopProgress   chan bool
	progressChan   chan float64
}

type SavedSound struct {
	FilePath string `json:"filePath"`
	Color    string `json:"color,omitempty"` // Store color as hex string
}

// CustomTheme removes rounded corners from buttons
type CustomTheme struct {
	fyne.Theme
}

func (c CustomTheme) Size(name fyne.ThemeSizeName) float32 {
	if name == fyne.ThemeSizeName("cornerRadius") {
		return 0 // Remove rounded corners
	}
	return c.Theme.Size(name)
}

type Soundboard struct {
	app       fyne.App
	window    fyne.Window
	sounds    []*SoundButton
	container *container.Scroll
	grid      *fyne.Container
	storage   fyne.Storage
}

func NewSoundboard() *Soundboard {
	myApp := app.NewWithID("com.soundboard.app")
	// Apply custom theme to remove rounded corners
	myApp.Settings().SetTheme(&CustomTheme{theme.DefaultTheme()})

	window := myApp.NewWindow("Soundboard")
	window.Resize(fyne.NewSize(800, 600))
	window.CenterOnScreen()

	sb := &Soundboard{
		app:     myApp,
		window:  window,
		sounds:  make([]*SoundButton, 0),
		storage: myApp.Storage(),
	}

	// Create add button
	addButton := widget.NewButton("Add Sound", sb.addSound)

	// Create grid container for sound buttons - use 2 columns for larger buttons
	sb.grid = container.NewGridWithColumns(2)
	sb.container = container.NewScroll(sb.grid)

	// Create main content with border layout to maximize space
	content := container.NewBorder(
		addButton,
		nil,
		nil,
		nil,
		sb.container,
	)

	window.SetContent(content)

	// Load saved sounds
	sb.loadSavedSounds()

	return sb
}

func (sb *Soundboard) addSound() {
	dialog.ShowFileOpen(func(reader fyne.URIReadCloser, err error) {
		if err != nil {
			dialog.ShowError(err, sb.window)
			return
		}
		if reader == nil {
			return
		}
		defer reader.Close()

		// Get file path - handle both file:// and direct paths
		uri := reader.URI()
		filePath := uri.Path()

		// On Windows, handle file:// URLs properly
		uriStr := uri.String()
		if strings.HasPrefix(uriStr, "file://") {
			filePath = strings.TrimPrefix(uriStr, "file://")
			// Remove leading slash on Windows (file:///C:/path -> C:/path)
			if len(filePath) > 0 && filePath[0] == '/' && len(filePath) > 2 && filePath[2] == ':' {
				filePath = filePath[1:]
			}
		}

		// Check if file has a valid audio extension
		ext := strings.ToLower(filepath.Ext(filePath))
		validExts := map[string]bool{
			".mp3": true,
			".wav": true,
			".m4a": true,
			".ogg": true,
		}

		if !validExts[ext] {
			dialog.ShowError(fmt.Errorf("unsupported audio format: %s (supported: .mp3, .wav, .m4a, .ogg)", ext), sb.window)
			return
		}

		// Check for ffmpeg if M4A file
		if ext == ".m4a" {
			if _, err := exec.LookPath("ffmpeg"); err != nil {
				dialog.ShowError(fmt.Errorf("M4A support requires ffmpeg to be installed.\n\nPlease install ffmpeg:\n• macOS: brew install ffmpeg\n• Windows: Download from https://ffmpeg.org/download.html\n• Linux: sudo apt-get install ffmpeg\n\nAfter installing, restart the application."), sb.window)
				return
			}
		}

		// Load and decode audio file to verify it's valid
		streamer, format, err := sb.loadAudioFile(filePath)
		if err != nil {
			// Provide more helpful error message for M4A files
			if ext == ".m4a" {
				if strings.Contains(err.Error(), "ffmpeg") {
					dialog.ShowError(fmt.Errorf("M4A file requires ffmpeg.\n\nError: %v\n\nPlease ensure ffmpeg is installed and in your PATH.", err), sb.window)
				} else {
					dialog.ShowError(fmt.Errorf("failed to load M4A file: %v\n\nMake sure ffmpeg is installed and the file is not corrupted.", err), sb.window)
				}
			} else {
				dialog.ShowError(fmt.Errorf("failed to load audio: %v", err), sb.window)
			}
			return
		}

		// Close the initial streamer as we'll create new ones for each playback
		streamer.Close()

		// Get filename without extension for button label
		fileName := filepath.Base(filePath)
		fileName = strings.TrimSuffix(fileName, filepath.Ext(fileName))

		// Create sound button
		soundBtn := &SoundButton{
			filePath:     filePath,
			format:       format,
			isPlaying:    false,
			isPaused:     false,
			pausedPos:    0,
			stopProgress: make(chan bool),
			progressChan: make(chan float64, 10),
		}

		// Create progress bar with custom text formatter for time display
		soundBtn.progressBar = widget.NewProgressBar()
		soundBtn.progressBar.SetValue(0)
		// Set custom text formatter to show elapsed/total time instead of percentage
		soundBtn.progressBar.TextFormatter = func() string {
			total := soundBtn.totalDuration
			if total <= 0 {
				return "0:00.000 / 0:00.000"
			}

			var elapsed time.Duration
			if soundBtn.isPlaying {
				elapsed = time.Since(soundBtn.startTime) + soundBtn.pausedDuration
			} else {
				// When not playing, use the accumulated paused duration
				elapsed = soundBtn.pausedDuration
			}

			if elapsed < 0 {
				elapsed = 0
			}
			if elapsed > total {
				elapsed = total
			}

			elapsedStr := sb.formatTime(elapsed)
			totalStr := sb.formatTime(total)
			return fmt.Sprintf("%s / %s", elapsedStr, totalStr)
		}

		// Create button
		soundBtn.button = widget.NewButton(fileName, func() {
			sb.toggleSound(soundBtn)
		})
		soundBtn.button.Importance = widget.HighImportance

		// Initialize color (default white) - stored but not visually applied
		soundBtn.color = color.RGBA{R: 255, G: 255, B: 255, A: 255}
		soundBtn.buttonBg = nil // Not using background rectangle
		coloredButton := soundBtn.button

		// Create restart button (small square) with themed icon
		restartBtn := widget.NewButtonWithIcon("", theme.MediaReplayIcon(), func() {
			sb.restartSound(soundBtn)
		})
		restartBtn.Importance = widget.MediumImportance
		restartBtnContainer := container.NewWithoutLayout(restartBtn)
		restartBtnContainer.Resize(fyne.NewSize(40, 40))
		restartBtn.Resize(fyne.NewSize(40, 40))

		// Create remove button (small square)
		removeBtn := widget.NewButton("×", func() {
			sb.confirmRemoveSound(soundBtn)
		})
		removeBtn.Importance = widget.LowImportance
		removeBtnContainer := container.NewWithoutLayout(removeBtn)
		removeBtnContainer.Resize(fyne.NewSize(40, 40))
		removeBtn.Resize(fyne.NewSize(40, 40))

		// Create color picker button (small square)
		colorBtn := widget.NewButtonWithIcon("", theme.ColorPaletteIcon(), func() {
			sb.showColorPicker(soundBtn)
		})
		colorBtn.Importance = widget.MediumImportance
		colorBtnContainer := container.NewWithoutLayout(colorBtn)
		colorBtnContainer.Resize(fyne.NewSize(40, 40))
		colorBtn.Resize(fyne.NewSize(40, 40))

		// Create container for control buttons at the bottom (small squares)
		buttonRow := container.NewHBox(restartBtnContainer, removeBtnContainer, colorBtnContainer)

		// Create bottom section with progress bar and control buttons
		bottomSection := container.NewVBox(
			soundBtn.progressBar,
			buttonRow,
		)

		// Create container with main button filling center and bottom section at bottom
		// The main button will expand to fill all available vertical space
		btnContainer := container.NewBorder(nil, bottomSection, nil, nil, coloredButton)
		soundBtn.container = btnContainer

		sb.sounds = append(sb.sounds, soundBtn)
		sb.grid.Add(soundBtn.container)
		sb.grid.Refresh()

		// Save sounds to storage
		sb.saveSounds()
	}, sb.window)
}

func (sb *Soundboard) loadAudioFile(filePath string) (beep.StreamSeekCloser, beep.Format, error) {
	ext := strings.ToLower(filepath.Ext(filePath))

	// Handle M4A files by converting to WAV using ffmpeg
	if ext == ".m4a" {
		return sb.loadM4AFile(filePath)
	}

	file, err := os.Open(filePath)
	if err != nil {
		return nil, beep.Format{}, err
	}

	var streamer beep.StreamSeekCloser
	var format beep.Format

	switch ext {
	case ".mp3":
		streamer, format, err = mp3.Decode(file)
	case ".wav":
		streamer, format, err = wav.Decode(file)
	case ".ogg":
		// OGG support requires additional decoder
		// For now, try WAV as fallback
		streamer, format, err = wav.Decode(file)
	default:
		// Try WAV as fallback
		streamer, format, err = wav.Decode(file)
	}

	if err != nil {
		file.Close()
		return nil, beep.Format{}, err
	}

	return streamer, format, nil
}

func (sb *Soundboard) loadM4AFile(filePath string) (beep.StreamSeekCloser, beep.Format, error) {
	// Check if ffmpeg is available (should already be checked before calling this, but double-check)
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return nil, beep.Format{}, fmt.Errorf("ffmpeg not found in PATH. M4A support requires ffmpeg to be installed")
	}

	// Create a temporary WAV file
	tmpFile, err := os.CreateTemp("", "soundboard_*.wav")
	if err != nil {
		return nil, beep.Format{}, fmt.Errorf("failed to create temp file: %v", err)
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()

	// Convert M4A to WAV using ffmpeg
	cmd := exec.Command("ffmpeg", "-i", filePath, "-y", "-acodec", "pcm_s16le", "-ar", "44100", tmpPath)
	if err := cmd.Run(); err != nil {
		os.Remove(tmpPath)
		return nil, beep.Format{}, fmt.Errorf("failed to convert M4A file (ffmpeg error): %v", err)
	}

	// Decode the converted WAV file
	file, err := os.Open(tmpPath)
	if err != nil {
		os.Remove(tmpPath)
		return nil, beep.Format{}, err
	}

	streamer, format, err := wav.Decode(file)
	if err != nil {
		file.Close()
		os.Remove(tmpPath)
		return nil, beep.Format{}, err
	}

	// Store the temp file path so we can clean it up later
	// For now, we'll keep it and clean up on app exit or when streamer is closed
	// Note: In a production app, you'd want better temp file management

	return streamer, format, nil
}

func (sb *Soundboard) toggleSound(soundBtn *SoundButton) {
	if soundBtn.isPlaying {
		// Pause the sound
		sb.pauseSound(soundBtn)
	} else if soundBtn.isPaused {
		// Resume the sound
		sb.resumeSound(soundBtn)
	} else {
		// Play the sound from beginning
		sb.playSound(soundBtn)
	}
}

func (sb *Soundboard) pauseSound(soundBtn *SoundButton) {
	if soundBtn.ctrl != nil {
		// Pause the control
		soundBtn.ctrl.Paused = true
	}
	if soundBtn.streamer != nil {
		// Save current position
		soundBtn.pausedPos = soundBtn.streamer.Position()
		// Accumulate paused duration
		if !soundBtn.startTime.IsZero() {
			soundBtn.pausedDuration += time.Since(soundBtn.startTime)
		}
	}
	// Stop progress updates
	if soundBtn.stopProgress != nil {
		select {
		case soundBtn.stopProgress <- true:
		default:
		}
	}
	soundBtn.isPlaying = false
	soundBtn.isPaused = true
	// Update button text to show it's paused
	fileName := filepath.Base(soundBtn.filePath)
	fileName = strings.TrimSuffix(fileName, filepath.Ext(fileName))
	soundBtn.button.SetText("⏸ " + fileName)
}

func (sb *Soundboard) resumeSound(soundBtn *SoundButton) {
	if soundBtn.streamer == nil {
		// Need to reload from paused position
		sb.playSoundFromPosition(soundBtn, soundBtn.pausedPos)
		return
	}
	if soundBtn.ctrl != nil {
		// Resume playback - reset start time but keep paused duration
		soundBtn.startTime = time.Now()
		soundBtn.ctrl.Paused = false
		soundBtn.isPlaying = true
		soundBtn.isPaused = false
		// Start progress updates
		sb.updateProgress(soundBtn)
		// Update button text
		fileName := filepath.Base(soundBtn.filePath)
		fileName = strings.TrimSuffix(fileName, filepath.Ext(fileName))
		soundBtn.button.SetText("▶ " + fileName)
	}
}

func (sb *Soundboard) stopSound(soundBtn *SoundButton) {
	// Stop progress updates
	if soundBtn.stopProgress != nil {
		select {
		case soundBtn.stopProgress <- true:
		default:
		}
	}
	if soundBtn.ctrl != nil {
		soundBtn.ctrl.Paused = true
	}
	if soundBtn.streamer != nil {
		soundBtn.streamer.Close()
		soundBtn.streamer = nil
	}
	soundBtn.isPlaying = false
	soundBtn.isPaused = false
	soundBtn.pausedPos = 0
	soundBtn.ctrl = nil
	soundBtn.startTime = time.Time{}
	soundBtn.pausedDuration = 0
	soundBtn.progressBar.SetValue(0)
	soundBtn.progressBar.Refresh() // TextFormatter will reset the display
	// Update button text to show it's stopped
	fileName := filepath.Base(soundBtn.filePath)
	fileName = strings.TrimSuffix(fileName, filepath.Ext(fileName))
	soundBtn.button.SetText(fileName)
}

func (sb *Soundboard) playSound(soundBtn *SoundButton) {
	sb.playSoundFromPosition(soundBtn, 0)
}

func (sb *Soundboard) restartSound(soundBtn *SoundButton) {
	// Stop playback if playing or paused
	if soundBtn.isPlaying || soundBtn.isPaused {
		sb.stopSound(soundBtn)
	}

	// Reset all progress-related state
	soundBtn.pausedPos = 0
	soundBtn.pausedDuration = 0
	soundBtn.startTime = time.Time{}
	soundBtn.progressBar.SetValue(0)
	soundBtn.progressBar.Refresh()
}

func (sb *Soundboard) confirmRemoveSound(soundBtn *SoundButton) {
	// Get filename for confirmation dialog
	fileName := filepath.Base(soundBtn.filePath)
	fileName = strings.TrimSuffix(fileName, filepath.Ext(fileName))

	// Show confirmation dialog
	dialog.ShowConfirm(
		"Remove Sound",
		fmt.Sprintf("Are you sure you want to remove '%s'?", fileName),
		func(confirmed bool) {
			if confirmed {
				sb.removeSound(soundBtn)
			}
		},
		sb.window,
	)
}

func (sb *Soundboard) showColorPicker(soundBtn *SoundButton) {
	// Material Design color palette (500 shades)
	colors := []color.RGBA{
		{R: 244, G: 67, B: 54, A: 255},   // Red
		{R: 233, G: 30, B: 99, A: 255},   // Pink
		{R: 156, G: 39, B: 176, A: 255},  // Purple
		{R: 103, G: 58, B: 183, A: 255},  // Deep Purple
		{R: 63, G: 81, B: 181, A: 255},   // Indigo
		{R: 33, G: 150, B: 243, A: 255},  // Blue
		{R: 3, G: 169, B: 244, A: 255},   // Light Blue
		{R: 0, G: 188, B: 212, A: 255},   // Cyan
		{R: 0, G: 150, B: 136, A: 255},   // Teal
		{R: 76, G: 175, B: 80, A: 255},   // Green
		{R: 139, G: 195, B: 74, A: 255},  // Light Green
		{R: 205, G: 220, B: 57, A: 255},  // Lime
		{R: 255, G: 235, B: 59, A: 255},  // Yellow
		{R: 255, G: 193, B: 7, A: 255},   // Amber
		{R: 255, G: 152, B: 0, A: 255},   // Orange
		{R: 255, G: 87, B: 34, A: 255},   // Deep Orange
		{R: 121, G: 85, B: 72, A: 255},   // Brown
		{R: 158, G: 158, B: 158, A: 255}, // Grey
		{R: 96, G: 125, B: 139, A: 255},  // Blue Grey
		{R: 255, G: 255, B: 255, A: 255}, // White
	}

	// Create color swatches in a grid
	colorButtons := container.NewGridWithColumns(5)
	for i := range colors {
		c := colors[i] // Capture loop variable
		// Create a colored rectangle to show the color
		colorRect := canvas.NewRectangle(c)
		colorRect.SetMinSize(fyne.NewSize(40, 40))
		colorRect.StrokeColor = color.RGBA{R: 150, G: 150, B: 150, A: 255}
		colorRect.StrokeWidth = 2

		// Create a button with no text and low importance to minimize hover effect
		colorBtn := widget.NewButton("", func() {
			sb.setCardColor(soundBtn, c)
		})
		colorBtn.Importance = widget.LowImportance

		// Use Max container to make button fill the rectangle area
		// Stack rectangle behind button - button will be mostly transparent
		colorContainer := container.NewMax(colorRect, colorBtn)
		colorButtons.Add(colorContainer)
	}

	// Create dialog content
	content := container.NewVBox(
		widget.NewLabel("Select a color:"),
		colorButtons,
	)

	// Show dialog
	dialog.ShowCustom("Choose Color", "Close", content, sb.window)
}

func (sb *Soundboard) setCardColor(soundBtn *SoundButton, c color.RGBA) {
	soundBtn.color = c
	// Color is stored but not visually applied (Fyne buttons don't support custom colors easily)
	// Save sounds to persist color
	sb.saveSounds()
}

func (sb *Soundboard) playSoundFromPosition(soundBtn *SoundButton, startPos int) {
	ext := strings.ToLower(filepath.Ext(soundBtn.filePath))

	var streamer beep.StreamSeekCloser
	var format beep.Format
	var err error

	// Handle M4A files separately
	if ext == ".m4a" {
		streamer, format, err = sb.loadM4AFile(soundBtn.filePath)
		if err != nil {
			dialog.ShowError(fmt.Errorf("failed to load M4A file: %v", err), sb.window)
			return
		}
	} else {
		// Create a new streamer from the file for each playback
		file, err := os.Open(soundBtn.filePath)
		if err != nil {
			dialog.ShowError(fmt.Errorf("failed to open file: %v", err), sb.window)
			return
		}

		switch ext {
		case ".mp3":
			streamer, format, err = mp3.Decode(file)
		case ".wav":
			streamer, format, err = wav.Decode(file)
		default:
			streamer, format, err = wav.Decode(file)
		}

		if err != nil {
			file.Close()
			dialog.ShowError(fmt.Errorf("failed to decode audio: %v", err), sb.window)
			return
		}
	}

	// Seek to start position if resuming
	if startPos > 0 {
		streamer.Seek(startPos)
	}

	// Store total length and calculate duration
	soundBtn.totalLength = streamer.Len()

	// Calculate total duration
	// In beep, Len() returns the number of sample frames
	// Duration in seconds = frames / sample_rate
	totalFrames := float64(soundBtn.totalLength)
	sampleRate := float64(format.SampleRate)

	// Verify calculation
	if sampleRate == 0 {
		fmt.Printf("ERROR: Sample rate is 0!\n")
		sampleRate = 44100 // fallback
	}

	durationSeconds := totalFrames / sampleRate
	soundBtn.totalDuration = time.Duration(durationSeconds * float64(time.Second))

	fmt.Printf("Duration calculation: %d frames, %d Hz, %d channels = %.2f seconds (%.0f ms)\n",
		soundBtn.totalLength, format.SampleRate, format.NumChannels, durationSeconds, durationSeconds*1000)

	// If duration seems wrong, try alternative calculation
	if durationSeconds < 0.1 && soundBtn.totalLength > 1000 {
		fmt.Printf("WARNING: Duration seems too short! Trying alternative calculation...\n")
		// Maybe Len() returns samples, not frames?
		altDuration := totalFrames / (sampleRate * float64(format.NumChannels))
		fmt.Printf("Alternative calculation (samples): %.2f seconds\n", altDuration)
	}

	// Resample if needed
	resampled := beep.Resample(4, format.SampleRate, beep.SampleRate(44100), streamer)

	// Create a control to pause/stop
	ctrl := &beep.Ctrl{Streamer: resampled, Paused: false}

	// Play the sound
	done := make(chan bool)
	speaker.Play(beep.Seq(ctrl, beep.Callback(func() {
		done <- true
	})))

	// Store references for stopping
	soundBtn.streamer = streamer
	soundBtn.ctrl = ctrl
	soundBtn.isPlaying = true
	soundBtn.isPaused = false
	soundBtn.startTime = time.Now()
	// Account for paused duration if resuming
	if startPos > 0 {
		// Calculate how much time has already elapsed based on position
		elapsedSamples := float64(startPos)
		elapsedSeconds := elapsedSamples / sampleRate
		soundBtn.pausedDuration = time.Duration(elapsedSeconds) * time.Second
	} else {
		soundBtn.pausedDuration = 0
	}

	// Stop any existing progress updates before starting new ones
	if soundBtn.stopProgress != nil {
		select {
		case soundBtn.stopProgress <- true:
		default:
		}
		// Create new channels for the new progress updates
		soundBtn.stopProgress = make(chan bool)
		soundBtn.progressChan = make(chan float64, 10)
	}

	// Start UI update handler that reads from progress channel
	go sb.handleProgressUpdates(soundBtn)

	// Reset progress bar to 0 before starting (TextFormatter will show the time)
	soundBtn.progressBar.SetValue(0)
	soundBtn.progressBar.Refresh()

	// Update button text to show it's playing
	fileName := filepath.Base(soundBtn.filePath)
	fileName = strings.TrimSuffix(fileName, filepath.Ext(fileName))
	soundBtn.button.SetText("▶ " + fileName)

	// Start progress updates (ensure totalDuration is set first)
	if soundBtn.totalDuration > 0 {
		fmt.Printf("Starting progress updates with totalDuration: %v (%.2f seconds)\n",
			soundBtn.totalDuration, soundBtn.totalDuration.Seconds())
		sb.updateProgress(soundBtn)
	} else {
		fmt.Printf("WARNING: totalDuration is 0, cannot start progress updates\n")
	}

	// Clean up after playback
	go func() {
		<-done
		// Stop progress updates
		if soundBtn.stopProgress != nil {
			select {
			case soundBtn.stopProgress <- true:
			default:
			}
		}
		soundBtn.isPlaying = false
		soundBtn.isPaused = false
		soundBtn.ctrl = nil
		if soundBtn.streamer != nil {
			soundBtn.streamer.Close()
			soundBtn.streamer = nil
		}
		soundBtn.progressBar.SetValue(1.0) // Fyne ProgressBar uses 0.0-1.0 range
		soundBtn.progressBar.Refresh()     // TextFormatter will show completion time
		// Update button text back
		fileName := filepath.Base(soundBtn.filePath)
		fileName = strings.TrimSuffix(fileName, filepath.Ext(fileName))
		soundBtn.button.SetText(fileName)
	}()
}

func (sb *Soundboard) formatTime(d time.Duration) string {
	totalMilliseconds := int(d.Milliseconds())
	hours := totalMilliseconds / 3600000
	minutes := (totalMilliseconds % 3600000) / 60000
	seconds := (totalMilliseconds % 60000) / 1000
	milliseconds := totalMilliseconds % 1000

	if hours > 0 {
		return fmt.Sprintf("%d:%02d:%02d.%03d", hours, minutes, seconds, milliseconds)
	}
	return fmt.Sprintf("%d:%02d.%03d", minutes, seconds, milliseconds)
}

func (sb *Soundboard) handleProgressUpdates(soundBtn *SoundButton) {
	for {
		select {
		case progress := <-soundBtn.progressChan:
			// Calculate elapsed time
			elapsed := time.Since(soundBtn.startTime) + soundBtn.pausedDuration
			if elapsed < 0 {
				elapsed = 0
			}

			// Update progress bar value (TextFormatter will automatically update the text)
			soundBtn.progressBar.SetValue(progress)
			soundBtn.progressBar.Refresh()
			if soundBtn.container != nil {
				soundBtn.container.Refresh()
			}
		case <-soundBtn.stopProgress:
			return
		}
	}
}

func (sb *Soundboard) updateProgress(soundBtn *SoundButton) {
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				if !soundBtn.isPlaying {
					continue
				}
				if soundBtn.totalDuration <= 0 {
					fmt.Printf("WARNING: totalDuration is %v, skipping progress update\n", soundBtn.totalDuration)
					continue
				}
				// Calculate elapsed time
				elapsed := time.Since(soundBtn.startTime) + soundBtn.pausedDuration
				if elapsed < 0 {
					elapsed = 0
				}
				// Calculate progress as a value between 0.0 and 1.0 (Fyne ProgressBar expects 0-1 range)
				progress := float64(elapsed) / float64(soundBtn.totalDuration)
				if progress > 1.0 {
					progress = 1.0
				}
				if progress < 0 {
					progress = 0
				}
				// Debug: Print every update to see what's being set
				progressPercent := progress * 100
				fmt.Printf("DEBUG: Sending progress %.2f%% (value: %.6f) to channel (elapsed: %v / %v)\n",
					progressPercent, progress, elapsed, soundBtn.totalDuration)

				// Send progress to channel (non-blocking)
				select {
				case soundBtn.progressChan <- progress:
				default:
					// Channel full, skip this update
				}
			case <-soundBtn.stopProgress:
				return
			}
		}
	}()
}

func (sb *Soundboard) removeSound(soundBtn *SoundButton) {
	// Stop if playing
	if soundBtn.isPlaying {
		sb.stopSound(soundBtn)
	}

	// Remove from sounds slice
	for i, s := range sb.sounds {
		if s == soundBtn {
			sb.sounds = append(sb.sounds[:i], sb.sounds[i+1:]...)
			break
		}
	}

	// Refresh grid
	sb.grid.RemoveAll()
	for _, s := range sb.sounds {
		sb.grid.Add(s.container)
	}
	sb.grid.Refresh()

	// Save sounds to storage
	sb.saveSounds()
}

func (sb *Soundboard) colorToHex(c color.RGBA) string {
	return fmt.Sprintf("#%02X%02X%02X", c.R, c.G, c.B)
}

func (sb *Soundboard) hexToColor(hex string) color.RGBA {
	// Default to white if invalid
	defaultColor := color.RGBA{R: 255, G: 255, B: 255, A: 255}
	if hex == "" || !strings.HasPrefix(hex, "#") {
		return defaultColor
	}
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) != 6 {
		return defaultColor
	}
	var r, g, b uint8
	_, err := fmt.Sscanf(hex, "%02X%02X%02X", &r, &g, &b)
	if err != nil {
		return defaultColor
	}
	return color.RGBA{R: r, G: g, B: b, A: 255}
}

func (sb *Soundboard) saveSounds() {
	fmt.Printf("saveSounds called - current sounds count: %d\n", len(sb.sounds))
	savedSounds := make([]SavedSound, 0, len(sb.sounds))
	for i, s := range sb.sounds {
		fmt.Printf("  Saving sound %d: %s\n", i+1, s.filePath)
		colorHex := sb.colorToHex(s.color)
		savedSounds = append(savedSounds, SavedSound{
			FilePath: s.filePath,
			Color:    colorHex,
		})
	}

	data, err := json.Marshal(savedSounds)
	if err != nil {
		fmt.Printf("Error marshaling sounds: %v\n", err)
		return
	}

	// Save to storage - delete existing file first if it exists
	existingURI, err := sb.storage.Open("sounds.json")
	if err == nil {
		// File exists, try to delete it
		existingURI.Close()
		if deleteErr := sb.storage.Remove("sounds.json"); deleteErr != nil {
			fmt.Printf("Warning: could not delete existing file: %v\n", deleteErr)
		}
	}

	// Create new file
	uri, err := sb.storage.Create("sounds.json")
	if err != nil {
		fmt.Printf("Error creating storage file: %v\n", err)
		return
	}
	defer uri.Close()

	// Write all data
	n, err := uri.Write(data)
	if err != nil {
		fmt.Printf("Error writing sounds: %v\n", err)
		return
	}
	if n != len(data) {
		fmt.Printf("Warning: only wrote %d bytes out of %d\n", n, len(data))
	}
	fmt.Printf("Saved %d sounds to storage (%d bytes)\n", len(savedSounds), n)
}

func (sb *Soundboard) loadSavedSounds() {
	// Try to open the saved sounds file
	uri, err := sb.storage.Open("sounds.json")
	if err != nil {
		// File doesn't exist yet, that's okay
		return
	}
	defer uri.Close()

	// Read all data first
	data, err := io.ReadAll(uri)
	if err != nil {
		fmt.Printf("Error reading sounds file: %v\n", err)
		return
	}

	if len(data) == 0 {
		return
	}

	var savedSounds []SavedSound
	if err := json.Unmarshal(data, &savedSounds); err != nil {
		fmt.Printf("Error decoding sounds: %v\n", err)
		return
	}

	fmt.Printf("Found %d saved sounds to load\n", len(savedSounds))

	// Load each saved sound
	loadedCount := 0
	for i, saved := range savedSounds {
		fmt.Printf("Loading sound %d: %s\n", i+1, saved.FilePath)
		// Check if file still exists
		if _, err := os.Stat(saved.FilePath); os.IsNotExist(err) {
			// File doesn't exist anymore, skip it
			fmt.Printf("  File does not exist, skipping\n")
			continue
		}

		// Load the sound with saved color
		savedColor := sb.hexToColor(saved.Color)
		if sb.loadSoundFromPath(saved.FilePath, savedColor) {
			loadedCount++
			fmt.Printf("  Successfully loaded (total: %d)\n", len(sb.sounds))
		} else {
			fmt.Printf("  Failed to load (might be invalid format or error)\n")
		}
	}

	fmt.Printf("Loaded %d sounds successfully\n", loadedCount)

	// Refresh grid once after all sounds are loaded
	if loadedCount > 0 {
		sb.grid.Refresh()
	}
}

func (sb *Soundboard) loadSoundFromPath(filePath string, cardColor color.RGBA) bool {
	// Check if file has a valid audio extension
	ext := strings.ToLower(filepath.Ext(filePath))
	validExts := map[string]bool{
		".mp3": true,
		".wav": true,
		".m4a": true,
		".ogg": true,
	}

	if !validExts[ext] {
		return false
	}

	// Check for ffmpeg if M4A file - skip silently if not available
	if ext == ".m4a" {
		if _, err := exec.LookPath("ffmpeg"); err != nil {
			// Skip M4A files if ffmpeg is not available (don't show error on startup)
			return false
		}
	}

	// Load and decode audio file to verify it's valid
	streamer, format, err := sb.loadAudioFile(filePath)
	if err != nil {
		// File might be corrupted or inaccessible, skip it
		return false
	}

	// Close the initial streamer as we'll create new ones for each playback
	streamer.Close()

	// Get filename without extension for button label
	fileName := filepath.Base(filePath)
	fileName = strings.TrimSuffix(fileName, filepath.Ext(fileName))

	// Create sound button
	soundBtn := &SoundButton{
		filePath:     filePath,
		format:       format,
		isPlaying:    false,
		isPaused:     false,
		pausedPos:    0,
		stopProgress: make(chan bool),
		progressChan: make(chan float64, 10),
	}

	// Create progress bar with custom text formatter for time display
	soundBtn.progressBar = widget.NewProgressBar()
	soundBtn.progressBar.SetValue(0)
	// Set custom text formatter to show elapsed/total time instead of percentage
	soundBtn.progressBar.TextFormatter = func() string {
		total := soundBtn.totalDuration
		if total <= 0 {
			return "0:00.000 / 0:00.000"
		}

		var elapsed time.Duration
		if soundBtn.isPlaying {
			elapsed = time.Since(soundBtn.startTime) + soundBtn.pausedDuration
		} else {
			elapsed = soundBtn.pausedDuration
		}

		if elapsed < 0 {
			elapsed = 0
		}
		if elapsed > total {
			elapsed = total
		}

		elapsedStr := sb.formatTime(elapsed)
		totalStr := sb.formatTime(total)
		return fmt.Sprintf("%s / %s", elapsedStr, totalStr)
	}

	// Initialize color (use saved color or default white)
	if cardColor.R == 0 && cardColor.G == 0 && cardColor.B == 0 && cardColor.A == 0 {
		cardColor = color.RGBA{R: 255, G: 255, B: 255, A: 255} // Default white
	}
	soundBtn.color = cardColor

	// Create button
	soundBtn.button = widget.NewButton(fileName, func() {
		sb.toggleSound(soundBtn)
	})
	soundBtn.button.Importance = widget.HighImportance

	// Not using background rectangle - color is stored but not visually applied
	soundBtn.buttonBg = nil
	coloredButton := soundBtn.button

	// Create restart button (small square) with themed icon
	restartBtn := widget.NewButtonWithIcon("", theme.MediaReplayIcon(), func() {
		sb.restartSound(soundBtn)
	})
	restartBtn.Importance = widget.MediumImportance
	restartBtnContainer := container.NewWithoutLayout(restartBtn)
	restartBtnContainer.Resize(fyne.NewSize(40, 40))
	restartBtn.Resize(fyne.NewSize(40, 40))

	// Create remove button (small square)
	removeBtn := widget.NewButton("×", func() {
		sb.confirmRemoveSound(soundBtn)
	})
	removeBtn.Importance = widget.LowImportance
	removeBtnContainer := container.NewWithoutLayout(removeBtn)
	removeBtnContainer.Resize(fyne.NewSize(40, 40))
	removeBtn.Resize(fyne.NewSize(40, 40))

	// Create color picker button (small square)
	colorBtn := widget.NewButtonWithIcon("", theme.ColorPaletteIcon(), func() {
		sb.showColorPicker(soundBtn)
	})
	colorBtn.Importance = widget.MediumImportance
	colorBtnContainer := container.NewWithoutLayout(colorBtn)
	colorBtnContainer.Resize(fyne.NewSize(40, 40))
	colorBtn.Resize(fyne.NewSize(40, 40))

	// Create container for control buttons at the bottom (small squares)
	buttonRow := container.NewHBox(restartBtnContainer, removeBtnContainer, colorBtnContainer)

	// Create bottom section with progress bar and control buttons
	bottomSection := container.NewVBox(
		soundBtn.progressBar,
		buttonRow,
	)

	// Create container with main button filling center and bottom section at bottom
	// The main button will expand to fill all available vertical space
	btnContainer := container.NewBorder(nil, bottomSection, nil, nil, coloredButton)
	soundBtn.container = btnContainer

	sb.sounds = append(sb.sounds, soundBtn)
	sb.grid.Add(soundBtn.container)
	// Don't refresh here - will refresh after all sounds are loaded
	return true
}

func (sb *Soundboard) Run() {
	// Initialize speaker with 44.1kHz sample rate
	sr := beep.SampleRate(44100)
	speaker.Init(sr, sr.N(time.Second/10))

	sb.window.ShowAndRun()
}

func main() {
	soundboard := NewSoundboard()
	soundboard.Run()
}
