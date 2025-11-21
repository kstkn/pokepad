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
let toggleDragBtn;
let cardsContainer;
let tabsContainer;
let addTabBtn;
let renameDialog;
let renameInput;
let renameOkBtn;
let renameCancelBtn;
let renameDialogTitle;
let transferDialog;
let transferTabSelect;
let transferMoveRadio;
let transferCopyRadio;
let transferOkBtn;
let transferCancelBtn;
let renameCallback = null;
let draggedFilePath = null;
let dragSortingEnabled = false;
let pendingTransferFilePath = null;
let dragSourceTabId = null;

const TABS_STORAGE_KEY = 'pokepadTabs';
const TAB_DATA_STORAGE_KEY = 'pokepadTabData';
const ACTIVE_TAB_STORAGE_KEY = 'pokepadActiveTab';
const LEGACY_FILES_KEY = 'pokepadFiles';
const LEGACY_CUES_KEY = 'pokepadCuePositions';
const LEGACY_NAMES_KEY = 'pokepadCustomNames';

let tabs = [];
let tabData = {};
let activeTabId = null;

// Initialize DOM elements when ready
function initDOM() {
  try {
    selectFilesBtn = document.getElementById('selectFilesBtn');
    toggleDragBtn = document.getElementById('toggleDragBtn');
    cardsContainer = document.getElementById('cardsContainer');
    tabsContainer = document.getElementById('tabsContainer');
    addTabBtn = document.getElementById('addTabBtn');
    renameDialog = document.getElementById('renameDialog');
    renameInput = document.getElementById('renameInput');
    renameOkBtn = document.getElementById('renameOkBtn');
    renameCancelBtn = document.getElementById('renameCancelBtn');
    renameDialogTitle = document.getElementById('renameDialogTitle');
    transferDialog = document.getElementById('transferDialog');
    transferTabSelect = document.getElementById('transferTabSelect');
    transferMoveRadio = document.getElementById('transferMoveRadio');
    transferCopyRadio = document.getElementById('transferCopyRadio');
    transferOkBtn = document.getElementById('transferOkBtn');
    transferCancelBtn = document.getElementById('transferCancelBtn');
    
    if (!selectFilesBtn || !cardsContainer || !toggleDragBtn || !tabsContainer || !addTabBtn || !renameDialog || !renameInput || !renameOkBtn || !renameCancelBtn || !renameDialogTitle || !transferDialog || !transferTabSelect || !transferMoveRadio || !transferCopyRadio || !transferOkBtn || !transferCancelBtn) {
      console.error('Required DOM elements not found', {
        selectFilesBtn: !!selectFilesBtn,
        cardsContainer: !!cardsContainer,
        toggleDragBtn: !!toggleDragBtn,
        tabsContainer: !!tabsContainer,
        addTabBtn: !!addTabBtn,
        renameDialog: !!renameDialog,
        renameInput: !!renameInput,
        renameOkBtn: !!renameOkBtn,
        renameCancelBtn: !!renameCancelBtn,
        renameDialogTitle: !!renameDialogTitle,
        transferDialog: !!transferDialog,
        transferTabSelect: !!transferTabSelect,
        transferMoveRadio: !!transferMoveRadio,
        transferCopyRadio: !!transferCopyRadio,
        transferOkBtn: !!transferOkBtn,
        transferCancelBtn: !!transferCancelBtn
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error initializing DOM:', error);
    return false;
  }
}

function createEmptyTabState() {
  return {
    files: [],
    cuePositions: {},
    customNames: {}
  };
}

function generateTabId() {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function saveTabsToStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  } catch (error) {
    console.error('Error saving tabs:', error);
  }
}

function saveTabDataToStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TAB_DATA_STORAGE_KEY, JSON.stringify(tabData));
  } catch (error) {
    console.error('Error saving tab data:', error);
  }
}

function getActiveTabData() {
  if (!activeTabId) {
    if (!tabs.length) {
      const defaultTab = { id: generateTabId(), name: 'Tab 1' };
      tabs = [defaultTab];
      activeTabId = defaultTab.id;
    } else {
      activeTabId = tabs[0].id;
    }
  }
  if (!tabData[activeTabId]) {
    tabData[activeTabId] = createEmptyTabState();
  }
  return tabData[activeTabId];
}

function persistActiveTabData() {
  if (!activeTabId) return;
  const activeData = getActiveTabData();
  activeData.files = Array.isArray(selectedFiles) ? [...selectedFiles] : [];
  
  const cues = {};
  if (cuePositions && cuePositions instanceof Map) {
    cuePositions.forEach((value, key) => {
      if (typeof value === 'number' && isFinite(value)) {
        cues[key] = value;
      }
    });
  }
  activeData.cuePositions = cues;
  
  const names = {};
  if (customNames && customNames instanceof Map) {
    customNames.forEach((value, key) => {
      if (typeof value === 'string' && value.trim()) {
        names[key] = value.trim();
      }
    });
  }
  activeData.customNames = names;
  
  tabData[activeTabId] = activeData;
  saveTabDataToStorage();
}

function renderTabs() {
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';
  
  tabs.forEach((tab, index) => {
    const tabBtn = document.createElement('button');
    tabBtn.className = `tab-button${tab.id === activeTabId ? ' active' : ''}`;
    const label = tab.name || `Tab ${index + 1}`;
    tabBtn.textContent = label;
    tabBtn.title = label;
    tabBtn.addEventListener('click', () => {
      switchTab(tab.id);
    });
    tabBtn.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      renameTab(tab.id);
    });

    tabBtn.addEventListener('dragover', (e) => {
      if (!dragSortingEnabled || !draggedFilePath) return;
      e.preventDefault();
      tabBtn.classList.add('tab-drag-target');
    });

    tabBtn.addEventListener('dragleave', () => {
      tabBtn.classList.remove('tab-drag-target');
    });

    tabBtn.addEventListener('drop', (e) => {
      if (!dragSortingEnabled || !draggedFilePath) return;
      e.preventDefault();
      tabBtn.classList.remove('tab-drag-target');
      const isCopy = !!(e.altKey || e.ctrlKey || e.metaKey);
      moveCardToTab(tab.id, isCopy);
    });

    tabsContainer.appendChild(tabBtn);
  });
}

function migrateLegacyDataIfNeeded() {
  if (typeof localStorage === 'undefined' || !activeTabId) return;
  
  const legacyFilesRaw = localStorage.getItem(LEGACY_FILES_KEY);
  const legacyCuesRaw = localStorage.getItem(LEGACY_CUES_KEY);
  const legacyNamesRaw = localStorage.getItem(LEGACY_NAMES_KEY);
  
  if (!legacyFilesRaw && !legacyCuesRaw && !legacyNamesRaw) {
    return;
  }
  
  const activeData = getActiveTabData();
  
  try {
    if (legacyFilesRaw) {
      const files = JSON.parse(legacyFilesRaw);
      if (Array.isArray(files)) {
        activeData.files = files;
      }
    }
  } catch (error) {
    console.error('Error migrating legacy files:', error);
  }
  
  try {
    if (legacyCuesRaw) {
      const cues = JSON.parse(legacyCuesRaw);
      if (cues && typeof cues === 'object') {
        activeData.cuePositions = cues;
      }
    }
  } catch (error) {
    console.error('Error migrating legacy cues:', error);
  }
  
  try {
    if (legacyNamesRaw) {
      const names = JSON.parse(legacyNamesRaw);
      if (names && typeof names === 'object') {
        activeData.customNames = names;
      }
    }
  } catch (error) {
    console.error('Error migrating legacy custom names:', error);
  }
  
  tabData[activeTabId] = activeData;
  saveTabDataToStorage();
  
  // Clean up legacy keys
  localStorage.removeItem(LEGACY_FILES_KEY);
  localStorage.removeItem(LEGACY_CUES_KEY);
  localStorage.removeItem(LEGACY_NAMES_KEY);
}

function loadTabsState() {
  try {
    if (typeof localStorage !== 'undefined') {
      const savedTabs = localStorage.getItem(TABS_STORAGE_KEY);
      if (savedTabs) {
        const parsed = JSON.parse(savedTabs);
        if (Array.isArray(parsed)) {
          tabs = parsed.filter(tab => tab && tab.id);
        }
      }
      
      const savedTabData = localStorage.getItem(TAB_DATA_STORAGE_KEY);
      if (savedTabData) {
        const parsedData = JSON.parse(savedTabData);
        if (parsedData && typeof parsedData === 'object') {
          tabData = parsedData;
        }
      }
      
      const savedActive = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (savedActive) {
        activeTabId = savedActive;
      }
    }
  } catch (error) {
    console.error('Error loading tabs from storage:', error);
  }
  
  if (!Array.isArray(tabs) || tabs.length === 0) {
    const defaultTab = { id: generateTabId(), name: 'Tab 1' };
    tabs = [defaultTab];
    activeTabId = defaultTab.id;
  }
  
  tabs = tabs.map((tab, index) => {
    if (!tab || typeof tab !== 'object') {
      return { id: generateTabId(), name: `Tab ${index + 1}` };
    }
    if (!tab.id) {
      return { ...tab, id: generateTabId() };
    }
    if (!tab.name) {
      return { ...tab, name: `Tab ${index + 1}` };
    }
    return tab;
  });
  
  if (!activeTabId || !tabs.some(tab => tab.id === activeTabId)) {
    activeTabId = tabs[0].id;
  }
  
  tabs.forEach((tab) => {
    if (!tabData[tab.id]) {
      tabData[tab.id] = createEmptyTabState();
    }
  });
  
  migrateLegacyDataIfNeeded();
  saveTabsToStorage();
  saveTabDataToStorage();
  if (typeof localStorage !== 'undefined' && activeTabId) {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
  }
  renderTabs();
}

function addNewTab() {
  persistActiveTabData();
  const newTab = {
    id: generateTabId(),
    name: `Tab ${tabs.length + 1}`
  };
  tabs.push(newTab);
  tabData[newTab.id] = createEmptyTabState();
  activeTabId = newTab.id;
  selectedFiles = [];
  cuePositions = new Map();
  customNames = new Map();
  saveTabsToStorage();
  saveTabDataToStorage();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
  }
  renderTabs();
  displayFiles(selectedFiles);
}

function switchTab(tabId) {
  if (!tabId || tabId === activeTabId) return;
  const tabExists = tabs.some(tab => tab.id === tabId);
  if (!tabExists) return;
  
  persistActiveTabData();
  stopAudio();
  activeTabId = tabId;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
  }
  loadCuePositions();
  loadCustomNames();
  loadPersistedFiles();
  renderTabs();
}

function renameTab(tabId) {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  
  const currentName = tab.name || 'Untitled Tab';
  showRenameDialog(currentName, (newName) => {
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed === currentName) return;
    
    tab.name = trimmed;
    saveTabsToStorage();
    renderTabs();
  }, {
    title: 'Rename Tab',
    placeholder: 'Enter tab name',
    confirmLabel: 'Save'
  });
}

function ensureTabDataStructure(tabId) {
  if (!tabData[tabId]) {
    tabData[tabId] = createEmptyTabState();
  } else {
    const data = tabData[tabId];
    if (!Array.isArray(data.files)) data.files = [];
    if (!data.cuePositions || typeof data.cuePositions !== 'object') data.cuePositions = {};
    if (!data.customNames || typeof data.customNames !== 'object') data.customNames = {};
  }
  return tabData[tabId];
}

function transferCardBetweenTabs(filePath, sourceTabId, targetTabId, isCopy) {
  if (!filePath || !sourceTabId || !targetTabId) {
    console.warn('transferCardBetweenTabs missing params', { filePath, sourceTabId, targetTabId });
    return;
  }
  if (sourceTabId === targetTabId && !isCopy) {
    console.log('Source and target tabs are the same; nothing to move');
    return;
  }
  const sourceExists = tabs.some(tab => tab.id === sourceTabId);
  const targetExists = tabs.some(tab => tab.id === targetTabId);
  if (!sourceExists || !targetExists) {
    console.warn('Source or target tab not found', { sourceTabId, targetTabId });
    return;
  }
  
  if (sourceTabId === activeTabId) {
    persistActiveTabData();
  }
  
  ensureTabDataStructure(sourceTabId);
  ensureTabDataStructure(targetTabId);
  const sourceData = tabData[sourceTabId];
  const targetData = tabData[targetTabId];
  
  const sourceFiles = Array.isArray(sourceData.files) ? sourceData.files : [];
  if (!sourceFiles.includes(filePath)) {
    console.warn('File not found in source tab during transfer', { filePath, sourceTabId });
    return;
  }
  
  if (!Array.isArray(targetData.files)) {
    targetData.files = [];
  }
  if (!targetData.files.includes(filePath)) {
    targetData.files.push(filePath);
  }
  
  const cueValue = sourceData.cuePositions ? sourceData.cuePositions[filePath] : undefined;
  if (cueValue !== undefined && isFinite(cueValue)) {
    targetData.cuePositions = targetData.cuePositions || {};
    targetData.cuePositions[filePath] = cueValue;
  }
  const nameValue = sourceData.customNames ? sourceData.customNames[filePath] : undefined;
  if (typeof nameValue === 'string' && nameValue.trim()) {
    targetData.customNames = targetData.customNames || {};
    targetData.customNames[filePath] = nameValue.trim();
  }
  
  if (!isCopy) {
    sourceData.files = sourceFiles.filter((f) => f !== filePath);
    if (sourceData.cuePositions && Object.prototype.hasOwnProperty.call(sourceData.cuePositions, filePath)) {
      delete sourceData.cuePositions[filePath];
    }
    if (sourceData.customNames && Object.prototype.hasOwnProperty.call(sourceData.customNames, filePath)) {
      delete sourceData.customNames[filePath];
    }
  }
  
  tabData[sourceTabId] = sourceData;
  tabData[targetTabId] = targetData;
  saveTabDataToStorage();
  
  if (!isCopy && sourceTabId === activeTabId) {
    if (currentPlayingCard && currentPlayingCard.dataset.filePath === filePath) {
      stopAudio();
    }
    selectedFiles = Array.isArray(sourceData.files) ? [...sourceData.files] : [];
    cuePositions.delete(filePath);
    customNames.delete(filePath);
    displayFiles(selectedFiles);
  } else if (sourceTabId === activeTabId) {
    persistActiveTabData();
  }
  
  if (targetTabId === activeTabId) {
    loadCuePositions();
    loadCustomNames();
    loadPersistedFiles();
  }
  
  console.log(`${isCopy ? 'Copied' : 'Moved'} "${filePath}" from ${sourceTabId} to ${targetTabId}`);
}

function performFileTransfer(filePath, targetTabId, action) {
  if (!filePath || !targetTabId) return;
  const isCopy = action === 'copy';
  transferCardBetweenTabs(filePath, activeTabId, targetTabId, isCopy);
}

function moveCardToTab(targetTabId, isCopy) {
  if (!draggedFilePath || !dragSourceTabId) {
    console.warn('No dragged card to move');
    return;
  }
  transferCardBetweenTabs(draggedFilePath, dragSourceTabId, targetTabId, isCopy);
}

// Show rename dialog (reused for cards and tabs)
function showRenameDialog(defaultName, callback, options = {}) {
  console.log('showRenameDialog called', { defaultName, renameDialog, renameInput });
  if (!renameDialog || !renameInput) {
    console.error('Rename dialog elements not found', { renameDialog: !!renameDialog, renameInput: !!renameInput });
    return;
  }
  
  const { title, placeholder, confirmLabel } = options || {};
  if (renameDialogTitle) {
    renameDialogTitle.textContent = title || 'Rename Card';
  }
  if (renameInput) {
    renameInput.placeholder = placeholder || 'Enter new name';
  }
  if (renameOkBtn) {
    renameOkBtn.textContent = confirmLabel || 'OK';
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
  if (renameDialogTitle) {
    renameDialogTitle.textContent = 'Rename Card';
  }
  if (renameInput) {
    renameInput.placeholder = 'Enter new name';
  }
  if (renameOkBtn) {
    renameOkBtn.textContent = 'OK';
  }
}

function showTransferDialogForFile(filePath) {
  if (!transferDialog || !transferTabSelect || !transferMoveRadio || !transferCopyRadio) {
    console.error('Transfer dialog not initialized');
    return;
  }
  if (!filePath) {
    console.warn('No file path provided for transfer dialog');
    return;
  }
  const availableTabs = tabs.filter(tab => tab.id !== activeTabId);
  if (availableTabs.length === 0) {
    console.warn('No other tabs available for transfer');
    return;
  }
  
  pendingTransferFilePath = filePath;
  transferTabSelect.innerHTML = '';
  availableTabs.forEach((tab, index) => {
    const option = document.createElement('option');
    option.value = tab.id;
    option.textContent = tab.name || `Tab ${index + 1}`;
    transferTabSelect.appendChild(option);
  });
  transferMoveRadio.checked = true;
  transferCopyRadio.checked = false;
  
  transferDialog.style.display = 'flex';
  setTimeout(() => {
    transferTabSelect.focus();
  }, 0);
}

function hideTransferDialog() {
  if (!transferDialog) return;
  transferDialog.style.display = 'none';
  pendingTransferFilePath = null;
}

function handleTransferConfirm() {
  if (!pendingTransferFilePath) {
    hideTransferDialog();
    return;
  }
  const targetTabId = transferTabSelect ? transferTabSelect.value : null;
  if (!targetTabId) {
    console.warn('No target tab selected for transfer');
    return;
  }
  const action = transferMoveRadio && transferMoveRadio.checked ? 'move' : 'copy';
  performFileTransfer(pendingTransferFilePath, targetTabId, action);
  hideTransferDialog();
}

function updateDragToggleButton() {
  if (!toggleDragBtn) return;
  toggleDragBtn.textContent = dragSortingEnabled ? 'Done' : 'Edit';
  toggleDragBtn.classList.toggle('active', dragSortingEnabled);
}

function updateCardDragState() {
  document.body.classList.toggle('drag-enabled', !!dragSortingEnabled);
  if (!cardsContainer) return;
  const cards = cardsContainer.querySelectorAll('.card');
  cards.forEach((card) => {
    if (dragSortingEnabled) {
      card.setAttribute('draggable', 'true');
    } else {
      card.setAttribute('draggable', 'false');
      card.classList.remove('dragging', 'drag-over');
    }
  });
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
    cuePositions = new Map();
    const activeData = getActiveTabData();
    const savedCues = activeData && activeData.cuePositions;
    if (savedCues && typeof savedCues === 'object') {
      Object.entries(savedCues).forEach(([filePath, cueTime]) => {
        if (typeof cueTime === 'number' && isFinite(cueTime)) {
          cuePositions.set(filePath, cueTime);
        }
      });
    }
  } catch (error) {
    console.error('Error loading cue positions for active tab:', error);
    cuePositions = new Map();
  }
}

function saveCuePositions() {
  persistActiveTabData();
}

function loadCustomNames() {
  try {
    customNames = new Map();
    const activeData = getActiveTabData();
    const savedNames = activeData && activeData.customNames;
    if (savedNames && typeof savedNames === 'object') {
      Object.entries(savedNames).forEach(([filePath, customName]) => {
        if (typeof customName === 'string' && customName.trim()) {
          customNames.set(filePath, customName.trim());
        }
      });
    }
  } catch (error) {
    console.error('Error loading custom names for active tab:', error);
    customNames = new Map();
  }
}

function saveCustomNames() {
  persistActiveTabData();
}

function loadPersistedFiles() {
  if (!cardsContainer) {
    console.error('cardsContainer not available for loadPersistedFiles');
    return;
  }
  
  try {
    const activeData = getActiveTabData();
    if (activeData && Array.isArray(activeData.files)) {
      selectedFiles = [...activeData.files];
    } else {
      selectedFiles = [];
    }
  } catch (error) {
    console.error('Error parsing files for active tab:', error);
    selectedFiles = [];
  }
  
  displayFiles(selectedFiles);
}

function saveFiles(files) {
  selectedFiles = Array.isArray(files) ? [...files] : [];
  persistActiveTabData();
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

  if (toggleDragBtn) {
    toggleDragBtn.addEventListener('click', () => {
      dragSortingEnabled = !dragSortingEnabled;
      console.log('Drag sorting toggled:', dragSortingEnabled);
      updateDragToggleButton();
      updateCardDragState();
    });
  }
  
  if (addTabBtn) {
    addTabBtn.addEventListener('click', () => {
      console.log('Add tab button clicked');
      addNewTab();
    });
  }
  
  // Global keyboard shortcut: spacebar to stop playback
  document.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in an input field or dialog is open
    const target = e.target;
    const isInput = target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    );
    const isDialogOpen = (renameDialog && renameDialog.style.display === 'flex') ||
                         (transferDialog && transferDialog.style.display === 'flex');
    
    if (e.key === ' ' && !isInput && !isDialogOpen) {
      e.preventDefault();
      if (currentAudio) {
        stopAudio();
      }
    }
  });
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

function setupTransferDialogListeners() {
  if (!transferDialog || !transferTabSelect || !transferMoveRadio || !transferCopyRadio || !transferOkBtn || !transferCancelBtn) {
    console.error('Transfer dialog elements missing');
    return;
  }
  
  transferOkBtn.addEventListener('click', () => {
    handleTransferConfirm();
  });
  
  transferCancelBtn.addEventListener('click', () => {
    hideTransferDialog();
  });
  
  transferDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideTransferDialog();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleTransferConfirm();
    }
  });
  
  transferDialog.addEventListener('click', (e) => {
    if (e.target === transferDialog) {
      hideTransferDialog();
    }
  });
  
  console.log('Transfer dialog listeners set up');
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

          const iconElement = cardElement.querySelector('.card-icon');
          if (iconElement) {
            const isShort = audio.duration < 10;
            iconElement.textContent = isShort ? '' : '\uD83C\uDFBC';
            iconElement.title = isShort ? 'Short sound (under 10s)' : 'Long sound (10s or longer)';
          }
          
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
      setupTransferDialogListeners();
      console.log('✓ Event listeners set up');
    } catch (error) {
      console.error('✗ Error setting up event listeners:', error);
      console.error(error.stack);
    }
    
    // Load tabs and active tab state
    try {
      loadTabsState();
      console.log('✓ Tabs state loaded');
    } catch (error) {
      console.error('✗ Error loading tabs state:', error);
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
    updateDragToggleButton();
    updateCardDragState();
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
      <div class="card-icon" aria-hidden="true"></div>
      <div class="card-name" title="${displayName}">${displayName}</div>
      <div class="progress-bar">
        <div class="progress-bar-fill"></div>
        <div class="progress-bar-hover"></div>
        <div class="progress-bar-cue"></div>
      </div>
      <div class="card-time"></div>
      <button class="transfer-btn" title="Move or copy to another tab">⇆</button>
      <button class="rename-btn" title="Rename card">✎</button>
      <button class="remove-btn" title="Remove card">×</button>
      <button class="rewind-btn">⏮</button>
      <button class="cue-btn" title="Set/clear cue point">C</button>
      <button class="play-cue-btn" title="Play from cue point">▶C</button>
    `;
    
    // Store file path on card for comparison
    card.dataset.filePath = filePath;
    card.setAttribute('draggable', 'true');
    
    card.addEventListener('dragstart', (e) => {
      if (!dragSortingEnabled) {
        e.preventDefault();
        return;
      }
      draggedFilePath = card.dataset.filePath;
      dragSourceTabId = activeTabId;
      card.classList.add('dragging');
      if (e.dataTransfer && draggedFilePath) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedFilePath);
      }
    });
    
    card.addEventListener('dragend', () => {
      if (!dragSortingEnabled) return;
      draggedFilePath = null;
      dragSourceTabId = null;
      card.classList.remove('dragging');
      document.querySelectorAll('.card.drag-over').forEach((c) => c.classList.remove('drag-over'));
      document.querySelectorAll('.tab-button.tab-drag-target').forEach((btn) => btn.classList.remove('tab-drag-target'));
    });
    
    card.addEventListener('dragover', (e) => {
      if (!dragSortingEnabled) return;
      if (!draggedFilePath || draggedFilePath === card.dataset.filePath) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      card.classList.add('drag-over');
    });
    
    card.addEventListener('dragleave', () => {
      if (!dragSortingEnabled) return;
      card.classList.remove('drag-over');
    });
    
    card.addEventListener('drop', (e) => {
      if (!dragSortingEnabled) return;
      e.preventDefault();
      card.classList.remove('drag-over');
      
      const targetFilePath = card.dataset.filePath;
      const sourceFilePath = draggedFilePath || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
      
      if (!sourceFilePath || !targetFilePath || sourceFilePath === targetFilePath) {
        return;
      }
      
      const sourceIndex = selectedFiles.indexOf(sourceFilePath);
      let targetIndex = selectedFiles.indexOf(targetFilePath);
      
      if (sourceIndex === -1 || targetIndex === -1) {
        return;
      }
      
      // Remove the source file and insert before the target
      selectedFiles.splice(sourceIndex, 1);
      // Recalculate target index in case it shifted after removal
      targetIndex = selectedFiles.indexOf(targetFilePath);
      selectedFiles.splice(targetIndex, 0, sourceFilePath);
      
      saveFiles(selectedFiles);
      displayFiles(selectedFiles);
    });
    
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
    
    const transferBtn = card.querySelector('.transfer-btn');
    if (transferBtn) {
      const hasOtherTabs = tabs && tabs.some(tab => tab.id !== activeTabId);
      transferBtn.disabled = !hasOtherTabs;
      transferBtn.title = hasOtherTabs ? 'Move or copy to another tab' : 'Create another tab to enable transfers';
      transferBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!tabs || !tabs.some(tab => tab.id !== activeTabId)) {
          console.warn('No other tabs available for transfer');
          return;
        }
        const cardFilePath = card.dataset.filePath;
        if (!cardFilePath) return;
        showTransferDialogForFile(cardFilePath);
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
          <p>Click "Select Files" to add sounds to this tab</p>
          <p class="hint">Each tab keeps its own set of cards</p>
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
    
    updateCardDragState();
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

