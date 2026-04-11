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

// In-memory store for tokens (for simplicity, assuming 1 host)
let accessToken = null;
let refreshToken = null;
let tokenExpirationTime = null;

const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
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
      console.log('Token refreshed successfully');
    } catch (err) {
      console.error('Failed to refresh token', err.response?.data || err.message);
      return res.status(401).json({ error: 'Failed to refresh host token.' });
    }
  }
  next();
};

app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  const scope = 'user-read-private user-read-email user-modify-playback-state user-read-playback-state user-read-currently-playing';

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
    queueLocked: queueLocked
  });
});

app.post('/api/toggle-lock', verifySpotifyToken, (req, res) => {
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

const poulpifyQueuedMap = new Map();

app.post('/api/queue', verifySpotifyToken, async (req, res) => {
  try {
    if (queueLocked) {
      return res.status(403).json({ error: 'The queue is currently locked by the host.' });
    }
    const { uri, username } = req.body;
    if (!uri) return res.status(400).json({ error: 'Missing track uri' });
    
    await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, null, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    // Track who added this URI
    poulpifyQueuedMap.set(uri, username || 'Anonymous');
    
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

app.get('/api/player-queue', verifySpotifyToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/player/queue', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    // Inject our custom tracking flag and username
    if (response.data && response.data.queue) {
        response.data.queue = response.data.queue.map(track => {
            if(track && track.uri && poulpifyQueuedMap.has(track.uri)) {
                track.addedViaPoulpify = true;
                track.addedBy = poulpifyQueuedMap.get(track.uri);
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

app.get('/api/player', verifySpotifyToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.spotify.com/v1/me/player', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    // Spotify returns 204 No Content if nothing is active
    if(response.status === 204 || !response.data) {
        return res.json(null);
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
