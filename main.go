package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/faiface/beep"
	"github.com/faiface/beep/mp3"
	"github.com/faiface/beep/speaker"
	"github.com/faiface/beep/wav"
)

type SoundButton struct {
	button   *widget.Button
	filePath string
	format   beep.Format
}

type Soundboard struct {
	app       fyne.App
	window    fyne.Window
	sounds    []*SoundButton
	container *container.Scroll
	grid      *fyne.Container
}

func NewSoundboard() *Soundboard {
	myApp := app.NewWithID("com.soundboard.app")

	window := myApp.NewWindow("Soundboard")
	window.Resize(fyne.NewSize(600, 400))

	sb := &Soundboard{
		app:    myApp,
		window: window,
		sounds: make([]*SoundButton, 0),
	}

	// Create add button
	addButton := widget.NewButton("Add Sound", sb.addSound)

	// Create grid container for sound buttons
	sb.grid = container.NewGridWithColumns(3)
	sb.container = container.NewScroll(sb.grid)

	// Create main content
	content := container.NewVBox(
		widget.NewLabel("Soundboard - Click 'Add Sound' to add audio files"),
		addButton,
		sb.container,
	)

	window.SetContent(content)
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
			// Note: M4A support requires additional decoder, currently only MP3 and WAV are supported
			".ogg": true,
		}

		if !validExts[ext] {
			dialog.ShowError(fmt.Errorf("unsupported audio format: %s (supported: .mp3, .wav, .ogg)", ext), sb.window)
			return
		}

		// Load and decode audio file to verify it's valid
		streamer, format, err := sb.loadAudioFile(filePath)
		if err != nil {
			dialog.ShowError(fmt.Errorf("failed to load audio: %v", err), sb.window)
			return
		}

		// Close the initial streamer as we'll create new ones for each playback
		streamer.Close()

		// Get filename without extension for button label
		fileName := filepath.Base(filePath)
		fileName = strings.TrimSuffix(fileName, filepath.Ext(fileName))
		if len(fileName) > 20 {
			fileName = fileName[:17] + "..."
		}

		// Create sound button
		soundBtn := &SoundButton{
			filePath: filePath,
			format:   format,
		}

		soundBtn.button = widget.NewButton(fileName, func() {
			sb.playSound(soundBtn)
		})

		// Add remove button
		removeBtn := widget.NewButton("×", func() {
			sb.removeSound(soundBtn)
		})

		// Create container for button and remove button
		btnContainer := container.NewBorder(nil, nil, nil, removeBtn, soundBtn.button)

		soundBtn.button = soundBtn.button // Keep reference
		sb.sounds = append(sb.sounds, soundBtn)
		sb.grid.Add(btnContainer)
		sb.grid.Refresh()
	}, sb.window)
}

func (sb *Soundboard) loadAudioFile(filePath string) (beep.StreamSeekCloser, beep.Format, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, beep.Format{}, err
	}

	ext := strings.ToLower(filepath.Ext(filePath))
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

func (sb *Soundboard) playSound(soundBtn *SoundButton) {
	// Create a new streamer from the file for each playback
	// This allows multiple simultaneous plays and proper seeking
	file, err := os.Open(soundBtn.filePath)
	if err != nil {
		dialog.ShowError(fmt.Errorf("failed to open file: %v", err), sb.window)
		return
	}

	ext := strings.ToLower(filepath.Ext(soundBtn.filePath))
	var streamer beep.StreamSeekCloser
	var format beep.Format

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

	// Resample if needed
	resampled := beep.Resample(4, format.SampleRate, beep.SampleRate(44100), streamer)

	// Play the sound
	done := make(chan bool)
	speaker.Play(beep.Seq(resampled, beep.Callback(func() {
		done <- true
	})))

	// Clean up after playback
	go func() {
		<-done
		streamer.Close()
		file.Close()
	}()
}

func (sb *Soundboard) removeSound(soundBtn *SoundButton) {
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
		removeBtn := widget.NewButton("×", func() {
			sb.removeSound(s)
		})
		btnContainer := container.NewBorder(nil, nil, nil, removeBtn, s.button)
		sb.grid.Add(btnContainer)
	}
	sb.grid.Refresh()
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
