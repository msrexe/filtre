const { app, BrowserWindow, Tray, screen, nativeImage, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let tray = null;
let window = null;
let serverProcess = null;

// Helper to get paths safely after app is ready
function getStoragePaths() {
  const userDataPath = app.getPath('userData');
  return {
    PROFILES_PATH: path.join(userDataPath, 'profiles.json'),
    SESSION_PATH: path.join(userDataPath, 'session.json')
  };
}

// Ensure files exist in userData before starting server
function initStorage() {
  const { PROFILES_PATH, SESSION_PATH } = getStoragePaths();
  
  const defaultProfiles = {
    "Standard": ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com"],
    "Deep Work": ["facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "netflix.com", "reddit.com", "twitch.tv", "linkedin.com", "pinterest.com"],
    "Social Media": ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "snapchat.com", "discord.com"]
  };

  let shouldWriteDefaults = false;
  if (!fs.existsSync(PROFILES_PATH)) {
    shouldWriteDefaults = true;
  } else {
    try {
      const content = fs.readFileSync(PROFILES_PATH, 'utf8').trim();
      if (!content || content === '{}') {
        shouldWriteDefaults = true;
      }
    } catch (e) {
      shouldWriteDefaults = true;
    }
  }

  if (shouldWriteDefaults) {
    fs.writeFileSync(PROFILES_PATH, JSON.stringify(defaultProfiles, null, 2));
  }
  
  if (!fs.existsSync(SESSION_PATH)) {
    fs.writeFileSync(SESSION_PATH, JSON.stringify({ active: false, endTime: null, profile: null }, null, 2));
  }
}

// Start the backend server
function startServer() {
  console.log('Starting backend server...');
  const { PROFILES_PATH, SESSION_PATH } = getStoragePaths();
  
  const serverPath = path.join(__dirname, 'server.cjs');
  
  serverProcess = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    env: { 
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      FILTRE_PROFILES_PATH: PROFILES_PATH,
      FILTRE_SESSION_PATH: SESSION_PATH
    }
  });
  
  serverProcess.on('exit', () => {
    console.log('Backend server exited, quitting app...');
    app.quit();
  });
}

function createWindow() {
  console.log('Creating main window...');
  window = new BrowserWindow({
    width: 320, 
    height: 340, 
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

  if (app.isPackaged) {
    window.loadFile(path.join(__dirname, 'dist-client', 'index.html'));
  } else {
    window.loadURL('http://localhost:5173');
  }

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
    if (!app.isPackaged) {
      console.error('Frontend failed to load. Retrying in 2s...');
      setTimeout(() => window.loadURL('http://localhost:5173'), 2000);
    }
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
    }
    
    tray = new Tray(image);
    tray.setToolTip('filtre - Focus Manager');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show filtre', click: () => { showWindow(); } },
      { type: 'separator' },
      { 
        label: 'Quit filtre', 
        click: () => {
          console.log('Quit from tray clicked...');
          // Request the server to clean up and quit
          const http = require('http');
          const req = http.request({
            hostname: 'localhost',
            port: 3001,
            path: '/api/quit',
            method: 'POST'
          }, (res) => {
            // Server exit will trigger the 'exit' listener on serverProcess
          });
          req.on('error', () => app.quit());
          req.end();
        } 
      }
    ]);

    tray.on('click', () => {
      toggleWindow();
    });

    tray.on('right-click', () => {
      tray.popUpContextMenu(contextMenu);
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
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    return {
      x: Math.round((width / 2) - (windowBounds.width / 2)),
      y: 50 
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
  initStorage();
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
