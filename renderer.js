let ipcRenderer, path;
try {
  ipcRenderer = require('electron').ipcRenderer;
  path = require('path');
} catch (error) {
  console.error('Error loading Electron modules:', error);
  // Fallback for testing
  ipcRenderer = null;
  path = { basename: (p) => p.split('/').pop(), extname: (p) => {
    const parts = p.split('.');
    return parts.length > 1 ? '.' + parts.pop() : '';
  }};
}

let selectFilesBtn;
let cardsContainer;
let renameDialog;
let renameInput;
let renameOkBtn;
let renameCancelBtn;
let renameCallback = null;

// Initialize DOM elements when ready
function initDOM() {
  try {
    selectFilesBtn = document.getElementById('selectFilesBtn');
    cardsContainer = document.getElementById('cardsContainer');
    renameDialog = document.getElementById('renameDialog');
    renameInput = document.getElementById('renameInput');
    renameOkBtn = document.getElementById('renameOkBtn');
    renameCancelBtn = document.getElementById('renameCancelBtn');
    
    if (!selectFilesBtn || !cardsContainer) {
      console.error('Required DOM elements not found', {
        selectFilesBtn: !!selectFilesBtn,
        cardsContainer: !!cardsContainer
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error initializing DOM:', error);
    return false;
  }
}

// Show rename dialog
function showRenameDialog(defaultName, callback) {
  console.log('showRenameDialog called', { defaultName, renameDialog, renameInput });
  if (!renameDialog || !renameInput) {
    console.error('Rename dialog elements not found', { renameDialog: !!renameDialog, renameInput: !!renameInput });
    return;
  }
  
  renameInput.value = defaultName;
  renameCallback = callback;
  renameDialog.style.display = 'flex';
  setTimeout(() => {
    renameInput.focus();
    renameInput.select();
  }, 10);
}

// Hide rename dialog
function hideRenameDialog() {
  if (!renameDialog) return;
  renameDialog.style.display = 'none';
  renameInput.value = '';
  renameCallback = null;
}

let currentAudio = null;
let selectedFiles = [];
let currentPlayingCard = null;
let progressAnimationFrame = null;
let cuePositions = new Map(); // Store cue positions per file path
let customNames = new Map(); // Store custom display names per file path

// Load persisted cue positions
function loadCuePositions() {
  try {
    if (typeof localStorage === 'undefined') {
      console.warn('localStorage not available');
      return;
    }
    
    const saved = localStorage.getItem('soundboardCuePositions');
    if (saved) {
      const cues = JSON.parse(saved);
      if (cues && typeof cues === 'object') {
        Object.entries(cues).forEach(([filePath, cueTime]) => {
          if (typeof cueTime === 'number' && isFinite(cueTime)) {
            cuePositions.set(filePath, cueTime);
          }
        });
      }
    }
  } catch (error) {
    console.error('Error loading persisted cue positions:', error);
    // Clear corrupted data
    try {
      localStorage.removeItem('soundboardCuePositions');
    } catch (e) {
      // Ignore
    }
  }
}

// Save cue positions to localStorage
function saveCuePositions() {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    if (cuePositions && cuePositions.size > 0) {
      const cues = Object.fromEntries(cuePositions);
      localStorage.setItem('soundboardCuePositions', JSON.stringify(cues));
    } else {
      // Clear if empty
      localStorage.removeItem('soundboardCuePositions');
    }
  } catch (error) {
    console.error('Error saving cue positions:', error);
  }
}

// Load persisted custom names
function loadCustomNames() {
  try {
    if (typeof localStorage === 'undefined') {
      console.warn('localStorage not available');
      return;
    }
    
    const saved = localStorage.getItem('soundboardCustomNames');
    if (saved) {
      const names = JSON.parse(saved);
      if (names && typeof names === 'object') {
        Object.entries(names).forEach(([filePath, customName]) => {
          if (typeof customName === 'string' && customName.trim()) {
            customNames.set(filePath, customName.trim());
          }
        });
      }
    }
  } catch (error) {
    console.error('Error loading persisted custom names:', error);
    // Clear corrupted data
    try {
      localStorage.removeItem('soundboardCustomNames');
    } catch (e) {
      // Ignore
    }
  }
}

// Save custom names to localStorage
function saveCustomNames() {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    if (customNames && customNames.size > 0) {
      const names = Object.fromEntries(customNames);
      localStorage.setItem('soundboardCustomNames', JSON.stringify(names));
    } else {
      // Clear if empty
      localStorage.removeItem('soundboardCustomNames');
    }
  } catch (error) {
    console.error('Error saving custom names:', error);
  }
}

// Load persisted files on startup
function loadPersistedFiles() {
  if (!cardsContainer) {
    console.error('cardsContainer not available for loadPersistedFiles');
    return;
  }
  
  const saved = localStorage.getItem('soundboardFiles');
  if (saved) {
    try {
      const files = JSON.parse(saved);
      if (files && files.length > 0) {
        selectedFiles = files;
        displayFiles(files);
      } else {
        // Ensure placeholder is shown if no files
        cardsContainer.classList.add('placeholder');
        cardsContainer.style.gridTemplateColumns = '1fr';
        if (!cardsContainer.querySelector('.placeholder > div')) {
          cardsContainer.innerHTML = `
            <div>
              <p>Click "Select Files" to get started</p>
              <p class="hint">Files will be added to existing cards</p>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Error loading persisted files:', error);
      // Show placeholder on error
      cardsContainer.classList.add('placeholder');
    }
  } else {
    // No saved files, ensure placeholder is shown
    if (cardsContainer) {
      // Don't overwrite if placeholder content already exists
      if (!cardsContainer.querySelector('div > p')) {
        cardsContainer.classList.add('placeholder');
        cardsContainer.style.gridTemplateColumns = '1fr';
        cardsContainer.innerHTML = `
          <div>
            <p>Click "Select Files" to get started</p>
            <p class="hint">Files will be added to existing cards</p>
          </div>
        `;
      } else {
        // Just ensure placeholder class is set
        cardsContainer.classList.add('placeholder');
        cardsContainer.style.gridTemplateColumns = '1fr';
      }
    }
  }
}

// Save files to localStorage
function saveFiles(files) {
  selectedFiles = files;
  localStorage.setItem('soundboardFiles', JSON.stringify(files));
}

function setupEventListeners() {
  console.log('Setting up event listeners...');
  console.log('selectFilesBtn:', selectFilesBtn);
  console.log('ipcRenderer:', ipcRenderer);
  
  if (!selectFilesBtn) {
    console.error('✗ selectFilesBtn not found');
    return;
  }
  
  if (!ipcRenderer) {
    console.error('✗ ipcRenderer not available');
    return;
  }
  
  console.log('Adding click listener to selectFilesBtn...');
  selectFilesBtn.addEventListener('click', async () => {
    console.log('Select Files button clicked!');
    try {
      console.log('Calling ipcRenderer.invoke("select-files")...');
      const filePaths = await ipcRenderer.invoke('select-files');
      console.log('File selection result:', filePaths);
      
      if (filePaths && filePaths.length > 0) {
        console.log('Files selected:', filePaths.length);
        // Add new files to existing ones
        const updatedFiles = [...selectedFiles, ...filePaths];
        saveFiles(updatedFiles);
        displayFiles(updatedFiles);
      } else {
        console.log('No files selected');
      }
    } catch (error) {
      console.error('✗ Error selecting files:', error);
      console.error(error.stack);
    }
  });
  
  console.log('✓ Click listener added to selectFilesBtn');
  
  // Test: Add a simple click handler to verify button works
  selectFilesBtn.addEventListener('click', () => {
    console.log('Button click detected (test handler)');
  }, { once: true });
}

function setupRenameDialogListeners() {
  console.log('Setting up rename dialog listeners', { renameOkBtn: !!renameOkBtn, renameCancelBtn: !!renameCancelBtn, renameInput: !!renameInput });
  if (!renameOkBtn || !renameCancelBtn || !renameInput) {
    console.error('Rename dialog elements not available for event listeners');
    return;
  }
  
  // OK button
  renameOkBtn.addEventListener('click', () => {
    console.log('OK button clicked');
    const newName = renameInput.value.trim();
    const callback = renameCallback; // Store callback before hiding
    hideRenameDialog();
    if (callback) {
      console.log('Calling rename callback with:', newName);
      callback(newName);
    } else {
      console.warn('No rename callback set');
    }
  });
  
  // Cancel button
  renameCancelBtn.addEventListener('click', () => {
    console.log('Cancel button clicked');
    const callback = renameCallback; // Store callback before hiding
    hideRenameDialog();
    if (callback) {
      callback(null);
    }
  });
  
  // Enter key
  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newName = renameInput.value.trim();
      const callback = renameCallback; // Store callback before hiding
      hideRenameDialog();
      if (callback) {
        callback(newName);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const callback = renameCallback; // Store callback before hiding
      hideRenameDialog();
      if (callback) {
        callback(null);
      }
    }
  });
  
  // Click outside to close
  if (renameDialog) {
    renameDialog.addEventListener('click', (e) => {
      if (e.target === renameDialog) {
        renameCancelBtn.click();
      }
    });
  }
  
  console.log('Rename dialog listeners set up successfully');
}

// Format time as MM:SS
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update progress bar
function updateProgress() {
  if (!currentAudio || !currentPlayingCard) {
    if (progressAnimationFrame) {
      cancelAnimationFrame(progressAnimationFrame);
      progressAnimationFrame = null;
    }
    return;
  }
  
  const progressBar = currentPlayingCard.querySelector('.progress-bar-fill');
  const timeDisplay = currentPlayingCard.querySelector('.card-time');
  const cueLine = currentPlayingCard.querySelector('.progress-bar-cue');
  
  if (progressBar && timeDisplay && currentAudio.duration) {
    const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
    progressBar.style.width = `${progress}%`;
    
    const current = formatTime(currentAudio.currentTime);
    const total = formatTime(currentAudio.duration);
    timeDisplay.textContent = `${current} / ${total}`;
    
    // Update cue line position if cue exists
    const filePath = currentPlayingCard.dataset.filePath;
    const cueTime = filePath ? cuePositions.get(filePath) : undefined;
    if (cueTime !== undefined && cueLine) {
      const cuePercentage = (cueTime / currentAudio.duration) * 100;
      cueLine.style.left = `${cuePercentage}%`;
      cueLine.style.display = 'block';
    }
  }
  
  // Continue updating smoothly
  if (!currentAudio.paused) {
    progressAnimationFrame = requestAnimationFrame(updateProgress);
  }
}

// Pause audio playback
function pauseAudio() {
  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause();
    if (progressAnimationFrame) {
      cancelAnimationFrame(progressAnimationFrame);
      progressAnimationFrame = null;
    }
    if (currentPlayingCard) {
      currentPlayingCard.classList.add('paused');
      currentPlayingCard.classList.remove('playing');
    }
  }
}

// Resume audio playback
function resumeAudio() {
  if (currentAudio && currentAudio.paused) {
    currentAudio.play();
    if (currentPlayingCard) {
      currentPlayingCard.classList.remove('paused');
      currentPlayingCard.classList.add('playing');
    }
    updateProgress();
  }
}

// Stop audio playback (fully reset)
function stopAudio() {
  if (progressAnimationFrame) {
    cancelAnimationFrame(progressAnimationFrame);
    progressAnimationFrame = null;
  }
  
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  
  // Remove playing/paused class from all cards and reset progress
  document.querySelectorAll('.card').forEach(card => {
    card.classList.remove('playing', 'paused');
    const progressBar = card.querySelector('.progress-bar-fill');
    if (progressBar) progressBar.style.width = '0%';
    
    // Only reset time display for the playing card, preserve durations for others
    if (card === currentPlayingCard) {
      const timeDisplay = card.querySelector('.card-time');
      if (timeDisplay) {
        // Reset to show duration only (0:00 / duration)
        const filePath = card.dataset.filePath;
        if (filePath) {
          // Reload duration to restore it
          loadAudioDuration(filePath, card);
        } else {
          timeDisplay.textContent = '';
        }
      }
    }
  });
  
  currentPlayingCard = null;
}

// Play audio file
function playAudio(filePath, cardElement) {
  // Stop current audio if playing
  stopAudio();
  
  // Update cue line position when audio loads
  const cardFilePath = cardElement.dataset.filePath || filePath;
  const cueTime = cardFilePath ? cuePositions.get(cardFilePath) : undefined;
  if (cueTime !== undefined) {
    const cueLine = cardElement.querySelector('.progress-bar-cue');
    const cueBtn = cardElement.querySelector('.cue-btn');
    if (cueLine && cueBtn) {
      // Will be updated when metadata loads
      cueBtn.classList.add('active');
    }
  }

  // Create new audio element
  currentAudio = new Audio(filePath);
  currentPlayingCard = cardElement;
  
  // Reset progress bar
  const progressBar = cardElement.querySelector('.progress-bar-fill');
  if (progressBar) progressBar.style.width = '0%';
  const timeDisplay = cardElement.querySelector('.card-time');
  
  // Update time display when metadata loads
  currentAudio.addEventListener('loadedmetadata', () => {
    if (timeDisplay && currentAudio.duration && isFinite(currentAudio.duration)) {
      const total = formatTime(currentAudio.duration);
      timeDisplay.textContent = `0:00 / ${total}`;
      
      // Update cue line position
      const cardFilePath = cardElement.dataset.filePath || filePath;
      const cueTime = cardFilePath ? cuePositions.get(cardFilePath) : undefined;
      const cueLine = cardElement.querySelector('.progress-bar-cue');
      if (cueTime !== undefined && cueLine) {
        const percentage = (cueTime / currentAudio.duration) * 100;
        cueLine.style.left = `${percentage}%`;
        cueLine.style.display = 'block';
      }
      
      // Check if there's a pending cue time to seek to
      const pendingCueTime = cardElement.dataset.pendingCueTime;
      if (pendingCueTime !== undefined) {
        const cueTime = parseFloat(pendingCueTime);
        currentAudio.currentTime = cueTime;
        delete cardElement.dataset.pendingCueTime;
        updateProgress();
      }
    }
  });
  
  // If duration is already known, update immediately
  if (timeDisplay && currentAudio.readyState >= 1) {
    const total = formatTime(currentAudio.duration);
    if (total !== '0:00') {
      timeDisplay.textContent = `0:00 / ${total}`;
    }
    
    // Update cue line position
    const cardFilePath = cardElement.dataset.filePath || filePath;
    const cueTime = cardFilePath ? cuePositions.get(cardFilePath) : undefined;
    const cueLine = cardElement.querySelector('.progress-bar-cue');
    if (cueTime !== undefined && cueLine && currentAudio.duration) {
      const percentage = (cueTime / currentAudio.duration) * 100;
      cueLine.style.left = `${percentage}%`;
      cueLine.style.display = 'block';
    }
    
    // Check if there's a pending cue time to seek to
    const pendingCueTime = cardElement.dataset.pendingCueTime;
    if (pendingCueTime !== undefined) {
      const cueTime = parseFloat(pendingCueTime);
      currentAudio.currentTime = cueTime;
      delete cardElement.dataset.pendingCueTime;
      updateProgress();
    }
  }
  
  // Start smooth progress updates
  currentAudio.addEventListener('play', () => {
    if (currentPlayingCard) {
      currentPlayingCard.classList.remove('paused');
      currentPlayingCard.classList.add('playing');
    }
    updateProgress();
  });
  
  currentAudio.addEventListener('pause', () => {
    if (currentPlayingCard) {
      currentPlayingCard.classList.remove('playing');
      currentPlayingCard.classList.add('paused');
    }
    if (progressAnimationFrame) {
      cancelAnimationFrame(progressAnimationFrame);
      progressAnimationFrame = null;
    }
  });
  
  currentAudio.addEventListener('timeupdate', updateProgress);
  
  currentAudio.addEventListener('ended', () => {
    stopAudio();
  });

  currentAudio.addEventListener('error', (e) => {
    console.error('Error playing audio:', e);
    stopAudio();
  });

  currentAudio.play().catch(error => {
    console.error('Error playing audio:', error);
    stopAudio();
  });
}

// Load audio metadata and display duration
function loadAudioDuration(filePath, cardElement) {
  try {
    if (!cardElement || !filePath) return;
    
    const timeDisplay = cardElement.querySelector('.card-time');
    if (!timeDisplay) return;
    
    const audio = new Audio(filePath);
    
    audio.addEventListener('loadedmetadata', () => {
      try {
        if (audio.duration && isFinite(audio.duration)) {
          const total = formatTime(audio.duration);
          timeDisplay.textContent = `0:00 / ${total}`;
          
          // Update cue line position if cue exists
          const cardFilePath = cardElement.dataset.filePath || filePath;
          if (cuePositions && cardFilePath) {
            const cueTime = cuePositions.get(cardFilePath);
            if (cueTime !== undefined && isFinite(cueTime)) {
              const cueLine = cardElement.querySelector('.progress-bar-cue');
              if (cueLine && audio.duration > 0) {
                const percentage = (cueTime / audio.duration) * 100;
                cueLine.style.left = `${percentage}%`;
                cueLine.style.display = 'block';
                const cueBtn = cardElement.querySelector('.cue-btn');
                if (cueBtn) {
                  cueBtn.classList.add('active');
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error updating cue line:', error);
      }
    });
    
    audio.addEventListener('error', (e) => {
      // Silently fail - duration just won't be shown
      console.warn('Error loading audio duration for:', filePath);
    });
    
    // Load metadata
    audio.load();
  } catch (error) {
    console.error('Error in loadAudioDuration:', error);
  }
}

// Initialize app when DOM is ready
function initializeApp() {
  try {
    console.log('=== INITIALIZING APP ===');
    console.log('readyState:', document.readyState);
    console.log('document.body exists:', !!document.body);
    
    if (!initDOM()) {
      console.error('Failed to initialize DOM elements');
      console.log('Retrying in 100ms...');
      setTimeout(initializeApp, 100);
      return;
    }
    
    console.log('✓ DOM elements found');
    console.log('selectFilesBtn:', selectFilesBtn);
    console.log('cardsContainer:', cardsContainer);
    
    // Setup event listeners
    try {
      setupEventListeners();
      setupRenameDialogListeners();
      console.log('✓ Event listeners set up');
    } catch (error) {
      console.error('✗ Error setting up event listeners:', error);
      console.error(error.stack);
    }
    
    // Load cue positions
    try {
      loadCuePositions();
      console.log('✓ Cue positions loaded');
    } catch (error) {
      console.error('✗ Error loading cue positions:', error);
      console.error(error.stack);
    }
    
    // Load custom names
    try {
      loadCustomNames();
      console.log('✓ Custom names loaded');
    } catch (error) {
      console.error('✗ Error loading custom names:', error);
      console.error(error.stack);
    }
    
    // Load persisted files
    try {
      loadPersistedFiles();
      console.log('✓ Persisted files loaded');
    } catch (error) {
      console.error('✗ Error loading persisted files:', error);
      console.error(error.stack);
    }
    
    console.log('=== APP INITIALIZED SUCCESSFULLY ===');
  } catch (error) {
    console.error('=== FATAL ERROR IN INITIALIZATION ===');
    console.error(error);
    console.error(error.stack);
    
    // Show error message on screen
    if (document.body) {
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #1a1a1a; color: #ff4444; padding: 40px; font-family: monospace; z-index: 10000; overflow: auto;';
      errorDiv.innerHTML = `
        <h1>Error Loading App</h1>
        <p><strong>Error:</strong> ${error.message}</p>
        <pre style="background: #2a2a2a; padding: 20px; border-radius: 4px; overflow: auto;">${error.stack}</pre>
        <p>Check the browser console (View > Toggle Developer Tools) for more details.</p>
      `;
      document.body.appendChild(errorDiv);
    }
  }
}

// Initialize when window loads
console.log('Renderer script loaded, readyState:', document.readyState);

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired');
    initializeApp();
  });
} else {
  console.log('DOM already ready, initializing immediately');
  // DOM is already ready, initialize immediately
  setTimeout(() => {
    initializeApp();
  }, 0);
}

function createCard(filePath) {
  const card = document.createElement('div');
  card.className = 'card';
  
  if (filePath) {
    const fileName = path.basename(filePath);
    const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    // Use custom name if available, otherwise use file name
    const displayName = customNames.get(filePath) || fileNameWithoutExt;
    
    card.innerHTML = `
      <div class="card-name" title="${displayName}">${displayName}</div>
      <div class="progress-bar">
        <div class="progress-bar-fill"></div>
        <div class="progress-bar-hover"></div>
        <div class="progress-bar-cue"></div>
      </div>
      <div class="card-time"></div>
      <button class="move-up-btn" title="Move up">▲</button>
      <button class="move-down-btn" title="Move down">▼</button>
      <button class="rename-btn" title="Rename card">✎</button>
      <button class="remove-btn" title="Remove card">×</button>
      <button class="rewind-btn">⏮</button>
      <button class="cue-btn" title="Set/clear cue point">C</button>
      <button class="play-cue-btn" title="Play from cue point">▶C</button>
    `;
    
    // Store file path on card for comparison
    card.dataset.filePath = filePath;
    
    // Load and display audio duration
    loadAudioDuration(filePath, card);
    
    // Add click handler to progress bar for seeking
    const progressBar = card.querySelector('.progress-bar');
    const hoverIndicator = card.querySelector('.progress-bar-hover');
    
    // Show hover indicator on mouse move
    progressBar.addEventListener('mousemove', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (mouseX / rect.width) * 100));
      hoverIndicator.style.left = `${percentage}%`;
      hoverIndicator.style.display = 'block';
    });
    
    progressBar.addEventListener('mouseleave', () => {
      hoverIndicator.style.display = 'none';
    });
    
    progressBar.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent card click
      
      if (currentPlayingCard === card && currentAudio && currentAudio.duration) {
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const seekTime = percentage * currentAudio.duration;
        
        currentAudio.currentTime = seekTime;
        updateProgress();
      }
    });
    
    // Add move up button handler
    const moveUpBtn = card.querySelector('.move-up-btn');
    if (moveUpBtn) {
      moveUpBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        
        const cardFilePath = card.dataset.filePath;
        if (!cardFilePath) return;
        
        const currentIndex = selectedFiles.indexOf(cardFilePath);
        if (currentIndex > 0) {
          // Move up: swap with previous item
          [selectedFiles[currentIndex - 1], selectedFiles[currentIndex]] = 
            [selectedFiles[currentIndex], selectedFiles[currentIndex - 1]];
          
          saveFiles(selectedFiles);
          displayFiles(selectedFiles);
        }
      });
    }
    
    // Add move down button handler
    const moveDownBtn = card.querySelector('.move-down-btn');
    if (moveDownBtn) {
      moveDownBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        
        const cardFilePath = card.dataset.filePath;
        if (!cardFilePath) return;
        
        const currentIndex = selectedFiles.indexOf(cardFilePath);
        if (currentIndex < selectedFiles.length - 1) {
          // Move down: swap with next item
          [selectedFiles[currentIndex], selectedFiles[currentIndex + 1]] = 
            [selectedFiles[currentIndex + 1], selectedFiles[currentIndex]];
          
          saveFiles(selectedFiles);
          displayFiles(selectedFiles);
        }
      });
    }
    
    // Add rename button handler
    const renameBtn = card.querySelector('.rename-btn');
    if (!renameBtn) {
      console.error('Rename button not found in card');
    } else {
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        console.log('Rename button clicked');
        
        const cardFilePath = card.dataset.filePath;
        if (!cardFilePath) {
          console.error('No file path on card');
          return;
        }
        
        const currentName = customNames.get(cardFilePath);
        const fileName = path.basename(cardFilePath);
        const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
        const defaultName = currentName || fileNameWithoutExt;
        
        console.log('Opening rename dialog with default name:', defaultName);
        // Show custom rename dialog
        showRenameDialog(defaultName, (newName) => {
          console.log('Rename callback called with:', newName);
          if (newName === null) {
            // User cancelled
            return;
          }
          
          if (newName === '') {
            // Empty name - remove custom name to use default
            customNames.delete(cardFilePath);
            saveCustomNames();
            // Update card display
            const cardNameElement = card.querySelector('.card-name');
            if (cardNameElement) {
              cardNameElement.textContent = fileNameWithoutExt;
              cardNameElement.title = fileNameWithoutExt;
            }
          } else if (newName !== defaultName) {
            // Set custom name
            customNames.set(cardFilePath, newName);
            saveCustomNames();
            // Update card display
            const cardNameElement = card.querySelector('.card-name');
            if (cardNameElement) {
              cardNameElement.textContent = newName;
              cardNameElement.title = newName;
            }
          }
        });
      });
    }
    
    // Add remove button handler
    const removeBtn = card.querySelector('.remove-btn');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent card click
      
      const cardFilePath = card.dataset.filePath;
      if (!cardFilePath) return;
      
      // Get file name for confirmation message
      const fileName = path.basename(cardFilePath);
      const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      
      // Show confirmation dialog
      const confirmed = window.confirm(`Are you sure you want to remove "${fileNameWithoutExt}"?`);
      if (!confirmed) {
        return;
      }
      
      // Stop audio if this card is playing
      if (currentPlayingCard === card) {
        stopAudio();
      }
      
      // Remove from selectedFiles
      const index = selectedFiles.indexOf(cardFilePath);
      if (index > -1) {
        selectedFiles.splice(index, 1);
      }
      
      // Remove cue position if it exists
      if (cuePositions.has(cardFilePath)) {
        cuePositions.delete(cardFilePath);
        saveCuePositions();
      }
      
      // Remove custom name if it exists
      if (customNames.has(cardFilePath)) {
        customNames.delete(cardFilePath);
        saveCustomNames();
      }
      
      // Save updated files
      saveFiles(selectedFiles);
      
      // Re-display files
      displayFiles(selectedFiles);
    });
    
    // Add rewind button handler
    const rewindBtn = card.querySelector('.rewind-btn');
    rewindBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent card click
      
      if (currentPlayingCard === card && currentAudio) {
        currentAudio.currentTime = 0;
        updateProgress();
      }
    });
    
    // Add cue button handler
    const cueBtn = card.querySelector('.cue-btn');
    const cueLine = card.querySelector('.progress-bar-cue');
    const playCueBtn = card.querySelector('.play-cue-btn');
    
    cueBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent card click
      
      const cardFilePath = card.dataset.filePath;
      if (!cardFilePath) return;
      
      const existingCue = cuePositions.get(cardFilePath);
      
      // If cue is already set and button is active, clear it
      if (existingCue !== undefined && cueBtn.classList.contains('active')) {
        // Clear cue
        cuePositions.delete(cardFilePath);
        cueLine.style.display = 'none';
        cueBtn.classList.remove('active');
        saveCuePositions();
      } else if (currentPlayingCard === card && currentAudio && currentAudio.duration) {
        // Set cue at current playback position
        const currentTime = currentAudio.currentTime;
        const duration = currentAudio.duration;
        
        cuePositions.set(cardFilePath, currentTime);
        const percentage = (currentTime / duration) * 100;
        cueLine.style.left = `${percentage}%`;
        cueLine.style.display = 'block';
        cueBtn.classList.add('active');
        saveCuePositions();
      }
    });
    
    // Add play cue button handler
    playCueBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent card click
      
      const cardFilePath = card.dataset.filePath;
      if (!cardFilePath) return;
      
      const cueTime = cuePositions.get(cardFilePath);
      if (cueTime === undefined) return;
      
      if (currentPlayingCard === card && currentAudio) {
        // Card is already playing, just seek to cue
        currentAudio.currentTime = cueTime;
        updateProgress();
      } else {
        // Card is not playing, start playback from cue point
        if (cardFilePath) {
          // Start playing the card
          document.querySelectorAll('.card').forEach(c => c.classList.remove('playing', 'paused'));
          card.classList.add('playing');
          
          // Store cue time to apply after audio loads
          card.dataset.pendingCueTime = cueTime;
          
          playAudio(cardFilePath, card);
        }
      }
    });
    
    // Initialize cue line if cue exists (will be positioned when audio loads)
    const cardFilePath = card.dataset.filePath;
    const existingCue = cardFilePath ? cuePositions.get(cardFilePath) : undefined;
    if (existingCue !== undefined) {
      cueBtn.classList.add('active');
    } else {
      cueLine.style.display = 'none';
    }
    
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking on progress bar, buttons (handled above)
      if (e.target.classList.contains('progress-bar') || 
          e.target.closest('.progress-bar') ||
          e.target.classList.contains('move-up-btn') ||
          e.target.closest('.move-up-btn') ||
          e.target.classList.contains('move-down-btn') ||
          e.target.closest('.move-down-btn') ||
          e.target.classList.contains('rename-btn') ||
          e.target.closest('.rename-btn') ||
          e.target.classList.contains('remove-btn') ||
          e.target.closest('.remove-btn') ||
          e.target.classList.contains('rewind-btn') ||
          e.target.closest('.rewind-btn') ||
          e.target.classList.contains('cue-btn') ||
          e.target.closest('.cue-btn') ||
          e.target.classList.contains('play-cue-btn') ||
          e.target.closest('.play-cue-btn')) {
        return;
      }
      
      // If this card is already playing, pause it
      if (currentPlayingCard === card && currentAudio) {
        if (!currentAudio.paused) {
          pauseAudio();
        } else {
          // If paused, resume it
          resumeAudio();
        }
        return;
      }
      
      // Otherwise, play the audio
      document.querySelectorAll('.card').forEach(c => c.classList.remove('playing', 'paused'));
      card.classList.add('playing');
      playAudio(filePath, card);
    });
  } else {
    card.classList.add('empty-card');
    card.innerHTML = '';
  }
  
  return card;
}

function displayFiles(filePaths) {
  try {
    if (!cardsContainer) {
      console.error('cardsContainer not initialized');
      return;
    }
    
    // If no files, show placeholder
    if (!filePaths || filePaths.length === 0) {
      cardsContainer.classList.add('placeholder');
      cardsContainer.style.gridTemplateColumns = '1fr';
      cardsContainer.innerHTML = `
        <div>
          <p>Click "Select Files" to get started</p>
          <p class="hint">Files will be added to existing cards</p>
        </div>
      `;
      return;
    }

    // Remove placeholder class and ensure grid display
    cardsContainer.classList.remove('placeholder');
    cardsContainer.style.display = 'grid';
    cardsContainer.style.flexDirection = '';
    cardsContainer.style.justifyContent = '';
    cardsContainer.style.alignItems = '';
    cardsContainer.style.textAlign = '';
    
    // Calculate grid to fit all cards evenly
    const minCols = 4;
    const numFiles = filePaths.length;
    
    // Calculate optimal number of columns (minimum 4)
    let cols = Math.max(minCols, Math.ceil(Math.sqrt(numFiles)));
    
    // Calculate number of rows needed for all files
    let rows = Math.ceil(numFiles / cols);
    
    // Ensure minimum 4 rows
    rows = Math.max(4, rows);
    
    // Set grid with explicit rows so all cards are evenly sized
    cardsContainer.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    cardsContainer.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
    
    // Clear and create all cards
    cardsContainer.innerHTML = '';
    
    filePaths.forEach((filePath) => {
      try {
        if (filePath) {
          const card = createCard(filePath);
          if (card) {
            cardsContainer.appendChild(card);
          }
        }
      } catch (error) {
        console.error('Error creating card for file:', filePath, error);
      }
    });
  } catch (error) {
    console.error('Error in displayFiles:', error);
    // Show placeholder on error
    if (cardsContainer) {
      cardsContainer.classList.add('placeholder');
      cardsContainer.innerHTML = `
        <div>
          <p>Error displaying files</p>
          <p class="hint">Check console for details</p>
        </div>
      `;
    }
  }
}

