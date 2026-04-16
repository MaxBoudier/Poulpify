require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URI || 'http://localhost:5173' }));
app.use(express.json());

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://127.0.0.1:${PORT}/callback`;

const fs = require('fs');
const path = require('path');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');

// In-memory store for tokens (for simplicity, assuming 1 host)
let accessToken = null;
let refreshToken = null;
let tokenExpirationTime = null;
let currentHostToken = null;
let hostLastSeen = Date.now();
const HOST_PASSWORD = process.env.HOST_PASSWORD || 'poulpi';

// Load tokens from disk if available
if (fs.existsSync(TOKENS_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
        accessToken = data.accessToken;
        refreshToken = data.refreshToken;
        tokenExpirationTime = data.tokenExpirationTime;
        console.log('Loaded Spotify tokens from disk.');
    } catch (e) {
        console.error('Failed to load tokens from disk', e);
    }
}

const saveTokens = () => {
    try {
        fs.writeFileSync(TOKENS_FILE, JSON.stringify({ accessToken, refreshToken, tokenExpirationTime }));
    } catch (e) {
        console.error('Failed to save tokens to disk', e);
    }
};

const clearSpotifySession = () => {
    accessToken = null;
    refreshToken = null;
    tokenExpirationTime = null;
    if (fs.existsSync(TOKENS_FILE)) {
        try {
            fs.unlinkSync(TOKENS_FILE);
            console.log('Spotify session cleared and tokens.json deleted.');
        } catch (e) {
            console.error('Failed to delete tokens.json', e);
        }
    }
};

const activeUsers = new Map();
const skipVotes = new Set();
let currentPlayingTrackUri = null;
const boostVotes = new Map(); // URI -> Set of usernames who voted to boost
const recentJoins = []; // { name, emoji, timestamp }

const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

const verifyHostToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.hostToken;
  if (!currentHostToken || token !== currentHostToken) {
    return res.status(403).json({ error: 'Unauthorized host action.' });
  }
  next();
};

// Middleware to ensure we have a valid access token
const verifySpotifyToken = async (req, res, next) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Host not authenticated. Please login first.' });
  }

  // Check if token needs refresh (with a 5 minute buffer)
  if (Date.now() > tokenExpirationTime - 5 * 60 * 1000) {
    console.log('Refreshing Spotify token...');
    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
        }
      });
      
      accessToken = response.data.access_token;
      tokenExpirationTime = Date.now() + (response.data.expires_in * 1000);
      if (response.data.refresh_token) {
        refreshToken = response.data.refresh_token; 
      }
      saveTokens();
      console.log('Token refreshed successfully');
    } catch (err) {
      console.error('Failed to refresh token', err.response?.data || err.message);
      return res.status(401).json({ error: 'Failed to refresh host token.' });
    }
  }
  next();
};

app.post('/api/host/login', (req, res) => {
  if (req.body.password === HOST_PASSWORD) {
    currentHostToken = generateRandomString(32);
    hostLastSeen = Date.now();
    res.json({ success: true, hostToken: currentHostToken, spotifyAuthenticated: !!accessToken });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/host/logout', verifyHostToken, (req, res) => {
  currentHostToken = null;
  // We keep hostLastSeen as 'now' so the 5 minute countdown starts from here
  hostLastSeen = Date.now();
  queueLocked = false;
  res.json({ success: true, message: 'Host logged out' });
});

app.get('/login', verifyHostToken, (req, res) => {
  const state = generateRandomString(16);
  // Add playlist reading scopes so Android Auto can see inside them
  const scope = 'user-read-private user-read-email user-modify-playback-state user-read-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read user-top-read user-read-recently-played';

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
      state: state
    }));
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      code: code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      }
    });

    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;
    tokenExpirationTime = Date.now() + (response.data.expires_in * 1000);
    saveTokens();

    // Redirect back to frontend
    res.redirect((process.env.FRONTEND_URI || 'http://localhost:5173') + '/?loggedIn=true');
  } catch (error) {
    console.error('Callback error:', error.response?.data || error.message);
    res.send('Error authenticating with Spotify');
  }
});

let queueLocked = false;

app.get('/api/status', (req, res) => {
  res.json({ 
    authenticated: !!accessToken,
    queueLocked: queueLocked,
    hostActive: !!currentHostToken
  });
});

app.post('/api/toggle-lock', verifyHostToken, verifySpotifyToken, (req, res) => {
  hostLastSeen = Date.now();
  queueLocked = !queueLocked;
  res.json({ success: true, queueLocked });
});

app.get('/api/search', verifySpotifyToken, async (req, res) => {
  try {
    const q = req.query.q;
    const response = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Search error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to search Spotify' });
  }
});

app.post('/api/heartbeat', (req, res) => {
  const { username, emoji, hostToken } = req.body;
  const now = Date.now();
  
  if (currentHostToken && hostToken === currentHostToken) {
    hostLastSeen = now;
  }
  
  if(username) {
     // Detect new user for radar alerts
     if(!activeUsers.has(username)) {
         recentJoins.push({ name: username, emoji: emoji || '😎', timestamp: now });
     }
     activeUsers.set(username, { emoji, lastSeen: now });
  }
  
  // Clean up users inactive for more than 15s
  for (const [user, data] of activeUsers.entries()) {
     if (now - data.lastSeen > 15000) {
         activeUsers.delete(user);
         skipVotes.delete(user);
         // Clean up their boost votes
         for (const [uri, voters] of boostVotes.entries()) {
             voters.delete(user);
             if (voters.size === 0) boostVotes.delete(uri);
         }
     }
  }
  
  // Clean up old join alerts (older than 10s)
  while (recentJoins.length > 0 && recentJoins[0].timestamp < now - 10000) {
      recentJoins.shift();
  }
  
  const required = Math.max(1, Math.ceil(activeUsers.size / 2));
  
  // If the departure of users caused the required votes to drop, we might need to skip (edge case) but we leave it for the next vote.
  
  res.json({
     activeUsers: Array.from(activeUsers.entries()).map(([name, d]) => ({ name, emoji: d.emoji })),
     skipVotes: skipVotes.size,
     requiredVotes: required,
     hasVoted: username ? skipVotes.has(username) : false,
     recentJoins: recentJoins.map(j => ({ name: j.name, emoji: j.emoji }))
  });
});

app.post('/api/vote-skip', verifySpotifyToken, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required to vote' });
  
  skipVotes.add(username);
  
  const required = Math.max(1, Math.ceil(activeUsers.size / 2));
  if (skipVotes.size >= required) {
      try {
          await axios.post('https://api.spotify.com/v1/me/player/next', null, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          console.log(`Skipped track. Votes reached ${skipVotes.size}/${required}`);
          skipVotes.clear();
      } catch (err) {
          console.error("Skip error:", err.response?.data || err.message);
      }
  }
  
  res.json({ success: true, skipVotes: skipVotes.size, requiredVotes: required });
});

const poulpifyQueuedMap = new Map();

app.post('/api/queue', verifySpotifyToken, async (req, res) => {
  try {
    if (queueLocked) {
      return res.status(403).json({ error: 'The queue is currently locked by the host.' });
    }
    const { uri, username, isInked } = req.body;
    if (!uri) return res.status(400).json({ error: 'Missing track uri' });
    
    await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, null, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    // Track who added this URI
    poulpifyQueuedMap.set(uri, { username: username || 'Anonymous', isInked: isInked || false });
    
    // Keep map size manageable
    if(poulpifyQueuedMap.size > 200) {
        const first = poulpifyQueuedMap.keys().next().value;
        poulpifyQueuedMap.delete(first);
    }
    
    res.json({ success: true, message: 'Added to queue' });
  } catch (error) {
    console.error('Queue error:', error.response?.data || error);
    if(error.response?.status === 404) {
      return res.status(404).json({ error: 'No active Spotify device found. Play something first!'});
    }
    res.status(500).json({ error: 'Failed to add to queue' });
  }
});

app.post('/api/boost', verifySpotifyToken, async (req, res) => {
  const { uri, username } = req.body;
  if (!uri || !username) return res.status(400).json({ error: 'Missing uri or username' });
  
  if (!boostVotes.has(uri)) boostVotes.set(uri, new Set());
  boostVotes.get(uri).add(username);
  
  const required = Math.max(1, Math.ceil(activeUsers.size / 2));
  const currentVotes = boostVotes.get(uri).size;
  let boosted = false;
  
  if (currentVotes >= required) {
    console.log(`Boost threshold reached for ${uri}. Track marked as boosted.`);
    boosted = true;
    // Don't re-queue via Spotify API — that would duplicate the track.
    // The boost is a social indicator only; the track stays in its current position.
  }
  
  res.json({ 
    success: true, 
    boostVotes: boosted ? 0 : currentVotes, 
    requiredVotes: required,
    boosted: boosted
  });
});

app.get('/api/player-queue', verifySpotifyToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/player/queue', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    // Inject our custom tracking flag and username
    if (response.data && response.data.queue) {
        response.data.queue = response.data.queue.map(track => {
            if(track && track.uri && poulpifyQueuedMap.has(track.uri)) {
                const data = poulpifyQueuedMap.get(track.uri);
                track.addedViaPoulpify = true;
                track.addedBy = data.username;
                track.isInked = data.isInked;
            }
            // Add boost vote info
            if(track && track.uri) {
                track.boostVotes = boostVotes.has(track.uri) ? boostVotes.get(track.uri).size : 0;
                track.boostRequired = Math.max(1, Math.ceil(activeUsers.size / 2));
            }
            return track;
        });
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Player queue error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve queue' });
  }
});

app.get('/api/me/playlists', verifySpotifyToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/playlists?limit=20', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Playlists error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve playlists' });
  }
});

app.get('/api/me/tracks', verifySpotifyToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/tracks?limit=20', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Liked tracks error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve liked tracks' });
  }
});

app.get('/api/me/top-tracks', verifySpotifyToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/top/tracks?limit=20', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Top tracks error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve top tracks' });
  }
});

app.get('/api/me/recently-played', verifySpotifyToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=20', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Recently played error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve recently played tracks' });
  }
});

app.get('/api/playlists/:id/tracks', verifySpotifyToken, async (req, res) => {
  try {
    const response = await axios.get(`https://api.spotify.com/v1/playlists/${req.params.id}/tracks?limit=50`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Playlist tracks error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve playlist tracks' });
  }
});

app.get('/api/player', verifySpotifyToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/player', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    // Spotify returns 204 No Content if nothing is active
    if(response.status === 204 || !response.data) {
        return res.json(null);
    }
    
    // Check if track changed to reset skip votes
    if(response.data.item?.uri) {
       if (currentPlayingTrackUri !== response.data.item.uri) {
           currentPlayingTrackUri = response.data.item.uri;
           skipVotes.clear();
           boostVotes.delete(response.data.item.uri);
       }
       
       // Inject who added the current track
       // Make sure we correctly access and set the flags
       if (poulpifyQueuedMap.has(response.data.item.uri)) {
           const data = poulpifyQueuedMap.get(response.data.item.uri);
           response.data.item.addedViaPoulpify = true;
           response.data.item.addedBy = data.username;
           // Don't set isInked for currently playing - surprise is revealed!
       } else {
           // Explicitly set to false to avoid caching issues
           response.data.item.addedViaPoulpify = false;
       }
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Player state error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve player state' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server listening at http://localhost:${PORT}`);
});

// Check for host inactivity every minute
setInterval(() => {
  const inactiveThreshold = 5 * 60 * 1000; // 5 minutes
  if (accessToken && (Date.now() - hostLastSeen > inactiveThreshold)) {
    console.log('Host inactive for 5 minutes. Clearing Spotify session...');
    clearSpotifySession();
    // Also clear host token to force full re-auth if they come back
    currentHostToken = null;
  }
}, 60 * 1000);
