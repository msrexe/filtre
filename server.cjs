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
  const HOSTS_FILE = '/etc/hosts';
  const START_MARKER = '# filtre-blocklist start';
  const END_MARKER = '# filtre-blocklist end';

  const performWrite = () => {
    try {
      let currentContent = fs.readFileSync(HOSTS_FILE, 'utf8');

      // 1. Remove any existing filtre blocks with a more robust regex
      const regex = new RegExp(`\\n?\\n?${START_MARKER}[\\s\\S]*?${END_MARKER}`, 'g');
      let cleanContent = currentContent.replace(regex, '').trim();

      // 2. Prepare new content
      let newContent = cleanContent;
      if (block && sites.length > 0) {
        newContent += `\n\n${START_MARKER}\n`;
        sites.forEach(site => {
          newContent += `0.0.0.0 ${site}\n`;
          newContent += `0.0.0.0 www.${site}\n`;
          newContent += `:: ${site}\n`;
          newContent += `:: www.${site}\n`;
        });
        newContent += `${END_MARKER}\n`;
      } else {
        newContent += `\n`; // Add a trailing newline
      }

      // Write via shell redirection which is more reliable with ACLs
      const tempFile = `/tmp/filtre_h_write_${Date.now()}`;
      fs.writeFileSync(tempFile, newContent);
      
      exec(`cat "${tempFile}" > "${HOSTS_FILE}" && rm "${tempFile}"`, (catErr) => {
        if (catErr) {
          console.error("Shell write failed:", catErr);
          return callback(new Error("Permission denied. Try restarting the app."));
        }
        
        // Final DNS Flush
        exec("dscacheutil -flushcache; killall -HUP mDNSResponder", () => {
          callback(null);
        });
      });
    } catch (err) {
      console.error("Preparation failed:", err);
      callback(err);
    }
  };

  // Check if we already have write access
  fs.access(HOSTS_FILE, fs.constants.W_OK, (err) => {
    if (!err) {
      performWrite();
    } else {
      // NO ACCESS: Request permission ONCE for the REAL GUI user
      console.log("Requesting one-time permission for the actual GUI user...");
      
      // Get the real logged-in user, NOT 'root'
      const getUserCmd = "stat -f%Su /dev/console";
      exec(getUserCmd, (userErr, stdout) => {
        const username = stdout.trim();
        if (!username) return callback(new Error("Could not detect system user."));

        // Add ACL specifically for this user
        // We ONLY allow read, write, and append.
        const setupCmd = `osascript -e 'do shell script "chmod +a \\"user:${username} allow read,write,append\\" ${HOSTS_FILE}" with administrator privileges'`;
        
        exec(setupCmd, (setupErr) => {
          if (setupErr) {
            console.error("ACL Setup failed:", setupErr);
            return callback(new Error("Administrator privileges required for the first time."));
          }
          performWrite();
        });
      });
    }
  });
}

app.post('/api/quit', (req, res) => {
  console.log('Quit requested, clearing hosts before exit...');
  updateHosts([], false, (err) => {
    if (err) console.error("Final hosts cleanup failed:", err);
    res.json({ success: true });
    setTimeout(() => {
      process.exit(0);
    }, 200);
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});
