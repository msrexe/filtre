const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const PROFILES_PATH = path.join(__dirname, 'profiles.json');
const SESSION_PATH = path.join(__dirname, 'session.json');

// Default profiles
const defaultProfiles = {
  "Low Focus": ["facebook.com", "instagram.com", "twitter.com", "x.com"],
  "Hard Focus": ["facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "netflix.com", "reddit.com", "twitch.tv"],
  "Social Only": ["facebook.com", "instagram.com", "tiktok.com", "snapchat.com"]
};

// Initialize files if they don't exist
if (!fs.existsSync(PROFILES_PATH)) {
  fs.writeFileSync(PROFILES_PATH, JSON.stringify(defaultProfiles, null, 2));
}

if (!fs.existsSync(SESSION_PATH)) {
  fs.writeFileSync(SESSION_PATH, JSON.stringify({ active: false, endTime: null, profile: null }, null, 2));
}

app.get('/api/profiles', (req, res) => {
  const data = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
  res.json(data);
});

app.post('/api/profiles', (req, res) => {
  fs.writeFileSync(PROFILES_PATH, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

app.get('/api/session', (req, res) => {
  const data = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  res.json(data);
});

app.post('/api/session/start', (req, res) => {
  const { profile, durationMinutes } = req.body;
  const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
  const sites = profiles[profile] || [];
  
  const endTime = Date.now() + durationMinutes * 60000;
  const session = { active: true, endTime, profile, paused: false, remainingSeconds: durationMinutes * 60 };
  
  updateHosts(sites, true, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
    res.json(session);
  });
});

app.post('/api/session/stop', (req, res) => {
  updateHosts([], false, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    const session = { active: false, endTime: null, profile: null };
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
    res.json(session);
  });
});

app.post('/api/session/pause', (req, res) => {
  const sessionData = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  updateHosts([], false, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    const session = { ...sessionData, paused: true };
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
    res.json(session);
  });
});

app.post('/api/session/resume', (req, res) => {
  const sessionData = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
  const sites = profiles[sessionData.profile] || [];
  
  updateHosts(sites, true, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    const session = { ...sessionData, paused: false };
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
    res.json(session);
  });
});

function updateHosts(sites, block, callback) {
  // Clear existing block-list from hosts
  const clearCmd = "sed -i '' '/# filtre-blocklist start/,/# filtre-blocklist end/d' /etc/hosts";
  
  exec(clearCmd, (err) => {
    if (err) {
      console.error("Error clearing hosts:", err);
      return callback(new Error("Permission denied. Run server with sudo."));
    }
    
    if (block && sites.length > 0) {
      let hostsContent = "\n# filtre-blocklist start\n";
      sites.forEach(site => {
        hostsContent += `127.0.0.1 ${site}\n`;
        hostsContent += `127.0.0.1 www.${site}\n`;
      });
      hostsContent += "# filtre-blocklist end\n";
      fs.appendFileSync('/etc/hosts', hostsContent);
    }
    
    // Flush DNS Cache for macOS to ensure changes take effect immediately
    const flushDnsCmd = "dscacheutil -flushcache; killall -HUP mDNSResponder";
    exec(flushDnsCmd, (flushErr) => {
      if (flushErr) console.error("DNS Flush Error:", flushErr);
      callback(null);
    });
  });
}

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});
