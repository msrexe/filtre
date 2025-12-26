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

// Initialize files if they don't exist
if (!fs.existsSync(PROFILES_PATH)) {
  const defaultProfiles = {
    "Standard": ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com"],
    "Deep Work": ["facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "netflix.com", "reddit.com", "twitch.tv", "linkedin.com", "pinterest.com"],
    "Social Media": ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "snapchat.com", "discord.com"]
  };
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
  const tempScriptPath = `/tmp/filtre_update_${Date.now()}.sh`;
  
  let scriptContent = `#!/bin/bash
# Remove existing blocklist
sed -i '' '/# filtre-blocklist start/,/# filtre-blocklist end/d' /etc/hosts
`;

  if (block && sites.length > 0) {
    scriptContent += `cat <<EOF >> /etc/hosts

# filtre-blocklist start
`;
    sites.forEach(site => {
      scriptContent += `127.0.0.1 ${site}\n`;
      scriptContent += `127.0.0.1 www.${site}\n`;
    });
    scriptContent += `# filtre-blocklist end
EOF
`;
  }

  try {
    fs.writeFileSync(tempScriptPath, scriptContent);
    fs.chmodSync(tempScriptPath, 0o755);

    // Use quoted path for the script to handle spaces and special characters
    const osaCmd = `osascript -e 'do shell script "sh \\"${tempScriptPath}\\"" with administrator privileges'`;
    
    exec(osaCmd, (err) => {
      // Clean up temp file immediately
      try { fs.unlinkSync(tempScriptPath); } catch (e) {}
      
      if (err) {
        console.error("OSAScript Permission Error:", err);
        return callback(new Error("Administrator privileges required to block sites."));
      }
      
      // Flush DNS Cache
      const flushDnsCmd = "dscacheutil -flushcache; killall -HUP mDNSResponder";
      exec(flushDnsCmd, (flushErr) => {
        if (flushErr) console.error("DNS Flush Error:", flushErr);
        callback(null);
      });
    });
  } catch (e) {
    console.error("Temp script creation failed:", e);
    callback(new Error("Failed to initialize update process."));
  }
}

app.post('/api/quit', (req, res) => {
  res.json({ success: true });
  setTimeout(() => {
    process.exit(0);
  }, 500);
});

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});
