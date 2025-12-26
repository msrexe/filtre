const { app, BrowserWindow, Tray, screen, nativeImage, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let tray = null;
let window = null;
let serverProcess = null;

function getStoragePaths() {
  const userDataPath = app.getPath('userData');
  return {
    PROFILES_PATH: path.join(userDataPath, 'profiles.json'),
    SESSION_PATH: path.join(userDataPath, 'session.json')
  };
}

function initStorage() {
  const { PROFILES_PATH, SESSION_PATH } = getStoragePaths();
  const defaultProfiles = {
    "Standard": ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com"],
    "Deep Work": ["facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "netflix.com", "reddit.com", "twitch.tv", "linkedin.com", "pinterest.com"],
    "Social Media": ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "snapchat.com", "discord.com"]
  };

  let needsProfiles = true;
  if (fs.existsSync(PROFILES_PATH)) {
    try {
      const content = fs.readFileSync(PROFILES_PATH, 'utf8').trim();
      if (content && content !== '{}') needsProfiles = false;
    } catch (e) {}
  }

  if (needsProfiles) {
    fs.writeFileSync(PROFILES_PATH, JSON.stringify(defaultProfiles, null, 2));
  }
  
  if (!fs.existsSync(SESSION_PATH)) {
    fs.writeFileSync(SESSION_PATH, JSON.stringify({ active: false, endTime: null, profile: null }, null, 2));
  }
}

function startServer() {
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
  
  serverProcess.on('exit', () => app.quit());
}

function createWindow() {
  window = new BrowserWindow({
    width: 320, 
    height: 340, 
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
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
      if (window && !window.webContents.isDevToolsOpened()) window.hide();
    }, 150);
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'public', 'foco-iconTemplate-final.png');
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(true); 
  
  tray = new Tray(image);
  tray.setToolTip('filtre');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show filtre', click: showWindow },
    { type: 'separator' },
    { 
      label: 'Quit filtre', 
      click: () => {
        const http = require('http');
        const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/quit', method: 'POST' });
        req.on('error', () => app.quit());
        req.end();
      } 
    }
  ]);

  tray.on('click', toggleWindow);
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
}

const toggleWindow = () => window.isVisible() ? window.hide() : showWindow();

const showWindow = () => {
  const position = getWindowPosition();
  window.setPosition(position.x, position.y, false);
  window.show();
  window.focus();
};

const getWindowPosition = () => {
  const windowBounds = window.getBounds();
  const trayBounds = tray?.getBounds();

  if (!trayBounds || trayBounds.width === 0) {
    const { width } = screen.getPrimaryDisplay().workAreaSize;
    return { x: Math.round((width / 2) - (windowBounds.width / 2)), y: 50 };
  }

  return {
    x: Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2)),
    y: Math.round(trayBounds.y + trayBounds.height + 4)
  };
};

app.on('ready', () => {
  if (process.platform === 'darwin') app.dock.hide();
  initStorage();
  startServer();
  createTray();
  createWindow();
});

app.on('will-quit', () => {
  if (serverProcess) serverProcess.kill();
});
