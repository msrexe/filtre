import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  X, 
  Plus, 
  Info, 
  Activity,
  Shield,
  Trash2,
  ChevronLeft
} from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

function App() {
  const [session, setSession] = useState({ active: false, remainingSeconds: 0, profile: null, paused: false });
  const [profiles, setProfiles] = useState({});
  const [view, setView] = useState('timer'); 
  const [editingProfile, setEditingProfile] = useState(null);
  const [newSite, setNewSite] = useState('');
  const [duration, setDuration] = useState(25); 

  const timerRef = useRef(null);

  useEffect(() => {
    fetchProfiles();
    fetchSession();
  }, []);

  useEffect(() => {
    if (session.active && !session.paused && session.remainingSeconds > 0) {
      timerRef.current = setInterval(() => {
        setSession(prev => {
          if (prev.remainingSeconds <= 1) {
            stopSession();
            return { ...prev, active: false, remainingSeconds: 0 };
          }
          return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [session.active, session.paused]);

  const fetchProfiles = async () => {
    try {
      const res = await fetch(`${API_BASE}/profiles`);
      const data = await res.json();
      setProfiles(data);
    } catch (e) { console.error(e); }
  };

  const fetchSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/session`);
      const data = await res.json();
      if (data.active) {
        const remaining = Math.max(0, Math.floor((data.endTime - Date.now()) / 1000));
        setSession({ ...data, remainingSeconds: remaining });
      } else {
        setSession({ active: false, remainingSeconds: 0, profile: null, paused: false });
      }
    } catch (e) { console.error(e); }
  };

  const startSession = async () => {
    let targetProfile = session.profile;
    if (!targetProfile) {
        targetProfile = Object.keys(profiles)[0];
        if (!targetProfile) return alert('Create a profile first!');
    }
    try {
      const res = await fetch(`${API_BASE}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: targetProfile, durationMinutes: duration })
      });
      const data = await res.json();
      setSession({ ...data, remainingSeconds: duration * 60 });
    } catch (e) { console.error(e); }
  };

  const stopSession = async (e) => {
    if (e) e.stopPropagation();
    try {
      await fetch(`${API_BASE}/session/stop`, { method: 'POST' });
      setSession({ active: false, remainingSeconds: 0, profile: session.profile, paused: false });
    } catch (e) { console.error(e); }
  };

  const togglePause = async (e) => {
    if (e) e.stopPropagation();
    const endpoint = session.paused ? 'resume' : 'pause';
    try {
      const res = await fetch(`${API_BASE}/session/${endpoint}`, { method: 'POST' });
      const data = await res.json();
      setSession(prev => ({ ...prev, paused: data.paused }));
    } catch (e) { console.error(e); }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSaveProfile = async (name, sites) => {
    const updated = { ...profiles, [name]: sites };
    try {
      await fetch(`${API_BASE}/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      setProfiles(updated);
      setEditingProfile(null);
      setView('profiles');
    } catch (e) { console.error(e); }
  };

  const progress = session.active ? (session.remainingSeconds / (duration * 60)) : 1;
  const elapsed = 1 - progress;
  const iconColor = elapsed >= 0.6 ? "#000000" : (elapsed >= 0.4 ? "#888888" : "#ffffff");

  return (
    <div className="app-container">
      <div className="glass-panel">
        <div className="header">
          <div className="title">filtre</div>
          <div className="nav-buttons">
            <button className="btn btn-icon" onClick={() => setView('timer')} title="Timer"><Activity size={14} /></button>
            <button className="btn btn-icon" onClick={() => setView('profiles')} title="Settings"><Shield size={14} /></button>
            <button className="btn btn-icon" onClick={() => setView('about')} title="About"><Info size={14} /></button>
          </div>
        </div>

        <div className="view-container">
          {view === 'timer' && (
            <div className="timer-view">
              <div className="dashboard-compact">
                <div className={`control-hub ${session.active ? 'active' : ''} ${session.paused ? 'paused' : ''}`}>
                  <div className="liquid-bg">
                     <div className="liquid-fill" style={{ '--fill': `${progress * 100}%` }}></div>
                  </div>
                  
                  <div className="hub-controls">
                    {!session.active ? (
                        <div className="hub-btn hub-btn-full" onClick={startSession}>
                            <Play size={40} fill="white" />
                        </div>
                    ) : (
                        <>
                            <div className="hub-btn hub-btn-left" onClick={togglePause} title={session.paused ? "Resume" : "Pause"}>
                                {session.paused ? <Play size={28} fill={iconColor} /> : <Pause size={28} fill={iconColor} />}
                            </div>
                            <div className="hub-btn" onClick={stopSession} title="Stop Session">
                                <Square size={28} fill={iconColor} />
                            </div>
                        </>
                    )}
                  </div>
                </div>

                <div className="timer-info">
                  <div className="timer-digits">{formatTime(session.remainingSeconds)}</div>
                  <div className="status-text">
                    {session.active ? (session.paused ? 'On Pause' : `Focusing...`) : 'Ready'}
                  </div>
                  
                  {!session.active && (
                      <div style={{ marginTop: '10px' }}>
                          <input 
                            type="range" min="1" max="120" value={duration} 
                            onChange={(e) => setDuration(parseInt(e.target.value))}
                            style={{ width: '100%', cursor: 'pointer' }}
                          />
                          <div style={{ fontSize: '10px', textAlign: 'right', fontWeight: 600 }}>{duration}m</div>
                      </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <div className="section-label">Active Profile</div>
                <div className="profile-row">
                  {session.active ? (
                    <div className="profile-pill active" style={{ cursor: 'default' }}>
                      {session.profile}
                    </div>
                  ) : (
                    Object.keys(profiles).map(name => (
                      <div 
                        key={name} 
                        className={`profile-pill ${session.profile === name ? 'active' : ''}`}
                        onClick={() => setSession({ ...session, profile: name })}
                      >
                        {name}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {view === 'profiles' && (
            <div className="profiles-view">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div className="section-label">Settings ({Object.keys(profiles).length}/6)</div>
                <button 
                  className="btn" 
                  disabled={Object.keys(profiles).length >= 6}
                  onClick={() => { 
                    if (Object.keys(profiles).length >= 6) return;
                    setEditingProfile({ name: '', sites: [] }); 
                    setView('edit-profile'); 
                  }}
                  style={{ opacity: Object.keys(profiles).length >= 6 ? 0.5 : 1 }}
                >
                  <Plus size={14} /> New
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.keys(profiles).map(name => (
                  <div key={name} className="profile-pill" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px' }}>
                    <div onClick={() => { setEditingProfile({ name, sites: profiles[name] }); setView('edit-profile'); }} style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{name}</div>
                    </div>
                    <Trash2 size={14} onClick={(e) => {
                        e.stopPropagation();
                        const upd = {...profiles}; delete upd[name]; 
                        setProfiles(upd);
                        fetch(`${API_BASE}/profiles`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(upd)});
                    }} style={{ opacity: 0.4, cursor: 'pointer' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'edit-profile' && (
            <div className="edit-view">
                <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => setView('profiles')}>
                    <ChevronLeft size={14} />
                    Back
                </div>
                <input className="input-field" value={editingProfile.name} onChange={e => setEditingProfile({...editingProfile, name: e.target.value})} placeholder="Profile Name" />
                <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
                    <input className="input-field" value={newSite} onChange={e => setNewSite(e.target.value)} placeholder="site.com" onKeyPress={e => e.key === 'Enter' && (setEditingProfile({...editingProfile, sites: [...editingProfile.sites, newSite]}), setNewSite(''))} />
                    <button className="btn" onClick={() => { if(newSite) { setEditingProfile({...editingProfile, sites: [...editingProfile.sites, newSite]}); setNewSite(''); } }}>Add</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: '100px', overflowY: 'auto' }}>
                    {editingProfile.sites.map((s, i) => (
                        <div key={i} className="chip" style={{ padding: '4px 8px', background: 'rgba(0,0,0,0.05)', borderRadius: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {s} <X size={10} style={{ cursor: 'pointer' }} onClick={() => setEditingProfile({...editingProfile, sites: editingProfile.sites.filter((_, idx)=>idx!==i)})} />
                        </div>
                    ))}
                </div>
                <button className="btn" style={{ width: '100%', marginTop: '12px', background: 'var(--accent-color)', color: 'white' }} onClick={() => handleSaveProfile(editingProfile.name, editingProfile.sites)}>Save</button>
            </div>
          )}

          {view === 'about' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <Activity size={30} color="#ffffff" style={{ marginBottom: 10 }} />
                <h3 style={{ fontSize: '18px', fontWeight: 800, textTransform: 'lowercase' }}>filtre</h3>
                <p style={{ opacity: 0.6, fontSize: '12px', margin: '8px 0' }}>Professional focus engine for macOS.</p>
                <div style={{ padding: '10px', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '12px', margin: '15px 0' }}>
                    <span style={{ fontSize: '11px', opacity: 0.6 }}>created by <b>msrexe</b></span>
                    <div style={{ marginTop: '8px' }}>
                      <a 
                        href="https://github.com/msrexe/filtre" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        style={{ fontSize: '11px', color: '#ffffff', textDecoration: 'underline', fontWeight: 600 }}
                      >
                        GitHub Project
                      </a>
                    </div>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
