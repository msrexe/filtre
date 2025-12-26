const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const PROFILES_PATH = process.env.FILTRE_PROFILES_PATH || path.join(__dirname, 'profiles.json');
const SESSION_PATH = process.env.FILTRE_SESSION_PATH || path.join(__dirname, 'session.json');

const getProfiles = () => JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
const getSession = () => JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
const saveSession = (data) => fs.writeFileSync(SESSION_PATH, JSON.stringify(data, null, 2));

app.get('/api/profiles', (req, res) => res.json(getProfiles()));

app.post('/api/profiles', (req, res) => {
  fs.writeFileSync(PROFILES_PATH, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

app.get('/api/session', (req, res) => res.json(getSession()));

app.post('/api/session/start', (req, res) => {
  const { profile, durationMinutes } = req.body;
  const sites = getProfiles()[profile] || [];
  const session = { active: true, endTime: Date.now() + durationMinutes * 60000, profile, paused: false, remainingSeconds: durationMinutes * 60 };
  
  updateHosts(sites, true, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    saveSession(session);
    res.json(session);
  });
});

app.post('/api/session/stop', (req, res) => {
  updateHosts([], false, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    const session = { active: false, endTime: null, profile: null };
    saveSession(session);
    res.json(session);
  });
});

app.post('/api/session/pause', (req, res) => {
  const sessionData = getSession();
  updateHosts([], false, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    const session = { ...sessionData, paused: true };
    saveSession(session);
    res.json(session);
  });
});

app.post('/api/session/resume', (req, res) => {
  const sessionData = getSession();
  const sites = getProfiles()[sessionData.profile] || [];
  updateHosts(sites, true, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    const session = { ...sessionData, paused: false };
    saveSession(session);
    res.json(session);
  });
});

function updateHosts(sites, block, callback) {
  const HOSTS_FILE = '/etc/hosts';
  const START_MARKER = '# filtre-blocklist start';
  const END_MARKER = '# filtre-blocklist end';

  const performWrite = () => {
    try {
      const currentContent = fs.readFileSync(HOSTS_FILE, 'utf8');
      const regex = new RegExp(`\\n?\\n?${START_MARKER}[\\s\\S]*?${END_MARKER}`, 'g');
      let newContent = currentContent.replace(regex, '').trim();

      if (block && sites.length > 0) {
        newContent += `\n\n${START_MARKER}\n`;
        sites.forEach(site => {
          newContent += `0.0.0.0 ${site}\n0.0.0.0 www.${site}\n:: ${site}\n:: www.${site}\n`;
        });
        newContent += `${END_MARKER}\n`;
      } else {
        newContent += `\n`;
      }

      const tempFile = `/tmp/filtre_h_write_${Date.now()}`;
      fs.writeFileSync(tempFile, newContent);
      
      exec(`cat "${tempFile}" > "${HOSTS_FILE}" && rm "${tempFile}"`, (err) => {
        if (err) return callback(new Error("Permission denied. Try restarting the app."));
        exec("dscacheutil -flushcache; killall -HUP mDNSResponder", () => callback(null));
      });
    } catch (err) {
      callback(err);
    }
  };

  fs.access(HOSTS_FILE, fs.constants.W_OK, (err) => {
    if (!err) return performWrite();

    exec("stat -f%Su /dev/console", (userErr, stdout) => {
      const username = stdout.trim();
      if (!username) return callback(new Error("Could not detect system user."));

      const setupCmd = `osascript -e 'do shell script "chmod +a \\"user:${username} allow read,write,append\\" ${HOSTS_FILE}" with administrator privileges'`;
      exec(setupCmd, (setupErr) => {
        if (setupErr) return callback(new Error("Administrator privileges required for the first time."));
        performWrite();
      });
    });
  });
}

app.post('/api/quit', (req, res) => {
  updateHosts([], false, () => {
    res.json({ success: true });
    setTimeout(() => process.exit(0), 200);
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});
