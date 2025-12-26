const { app, BrowserWindow, Tray, screen, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let tray = null;
let window = null;
let serverProcess = null;

// Start the backend server
function startServer() {
  console.log('Starting backend server...');
  serverProcess = spawn('node', [path.join(__dirname, 'server.cjs')], {
    stdio: 'inherit'
  });
  
  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });
}

function createWindow() {
  console.log('Creating main window...');
  window = new BrowserWindow({
    width: 320, 
    height: 340, // Reduced from 380
    show: false,
    frame: false,
    fullscreenable: false,
    resizable: false,
    transparent: false, 
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#ffffff', 
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true, 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  window.loadURL('http://localhost:5173');

  // Hide the window when it loses focus, with a slight delay 
  // to avoid flickering when clicking the tray icon
  window.on('blur', () => {
    setTimeout(() => {
      if (window && !window.webContents.isDevToolsOpened()) {
        window.hide();
      }
    }, 150);
  });

  window.webContents.on('did-finish-load', () => {
    console.log('Frontend loaded successfully.');
  });
  
  window.webContents.on('did-fail-load', () => {
    console.error('Frontend failed to load. Retrying in 2s...');
    setTimeout(() => window.loadURL('http://localhost:5173'), 2000);
  });
}

function createTray() {
  console.log('Creating tray icon...');
  const iconPath = path.join(__dirname, 'public', 'foco-iconTemplate-final.png');
  
  try {
    const image = nativeImage.createFromPath(iconPath);
    image.setTemplateImage(true); 
    
    if (image.isEmpty()) {
       console.error('Failed to create nativeImage from path:', iconPath);
       // Fallback to a plain text tray or simple icon if needed
    }
    
    tray = new Tray(image);
    tray.setToolTip('filtre - Focus Manager');

    tray.on('click', () => {
      toggleWindow();
    });
    
    console.log('Tray created successfully.');
  } catch (error) {
    console.error('Error creating tray:', error);
  }
}

const toggleWindow = () => {
  if (window.isVisible()) {
    window.hide();
  } else {
    showWindow();
  }
};

const showWindow = () => {
  const position = getWindowPosition();
  window.setPosition(position.x, position.y, false);
  window.show();
  window.focus();
};

const getWindowPosition = () => {
  const windowBounds = window.getBounds();
  const trayBounds = tray ? tray.getBounds() : null;

  if (!trayBounds || trayBounds.width === 0) {
    // Fallback: Center on primary screen if tray info is missing
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    return {
      x: Math.round((width / 2) - (windowBounds.width / 2)),
      y: 50 // Near top
    };
  }

  const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  return { x, y };
};

app.on('ready', () => {
  console.log('foco engine is ready.');
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  startServer();
  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  console.log('App is quitting, cleaning up...');
  if (serverProcess) {
    serverProcess.kill();
  }
});
