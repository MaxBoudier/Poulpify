require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_VERSION = '2.0.0';

app.use(cors({ origin: process.env.FRONTEND_URI || 'http://localhost:5173' }));
app.use(express.json());

// Trace la derniere sollicitation REST pour que la boucle de sondage sache
// s'il reste quelqu'un a servir. Doit rester avant toute route : un middleware
// declare apres une route qui repond ne s'execute jamais.
let lastRestActivity = Date.now();
app.use('/api', (req, res, next) => {
  lastRestActivity = Date.now();
  next();
});

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://127.0.0.1:${PORT}/callback`;

const fs = require('fs');
const path = require('path');
// Configurable pour que le fichier puisse vivre sur un volume persistant.
// Dans le conteneur, __dirname n'est pas inscriptible et son contenu
// disparaitrait de toute facon a chaque redeploiement.
const TOKENS_FILE = process.env.TOKENS_FILE || path.join(__dirname, 'tokens.json');
// Le jeton hote vit a cote des jetons Spotify, sur le meme volume : sans lui,
// un redeploiement Coolify coupe la session de l'app voiture en pleine route.
const HOST_FILE = process.env.HOST_FILE || path.join(path.dirname(TOKENS_FILE), 'host.json');

// In-memory store for tokens (for simplicity, assuming 1 host)
let accessToken = null;
let refreshToken = null;
let tokenExpirationTime = null;
let currentHostToken = null;
let hostLastSeen = Date.now();
// Pas de valeur de repli : elle serait lisible par quiconque ouvre ce fichier
// sur GitHub, et suffirait a prendre le controle de la lecture. Mieux vaut
// refuser de demarrer que servir une instance dont l'ecran hote est ouvert.
const HOST_PASSWORD = process.env.HOST_PASSWORD;
if (!HOST_PASSWORD) {
    console.error("HOST_PASSWORD n'est pas defini : demarrage refuse, l'ecran hote serait sans protection.");
    process.exit(1);
}

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
    cachedPlayer = { data: null, at: 0 };
    cachedQueue = { data: null, at: 0 };
    spotifyDeviceActive = false;
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
const recentJoins = []; // { name, emoji, timestamp }

let queueLocked = false;
let autoDisconnectEnabled = true;

// Etat de lecture mis en cache par la boucle de sondage unique (cf. plus bas).
// Sans ce cache, chaque client web sondant /api/player toutes les 2s declenche
// un appel Spotify : a cinq passagers on frole le quota pour rien.
let cachedPlayer = { data: null, at: 0 };
let cachedQueue = { data: null, at: 0 };
let spotifyDeviceActive = false;
const CACHE_TTL_MS = 2500;

// ---------------------------------------------------------------------------
// Persistance de la session hote
// ---------------------------------------------------------------------------

const saveHostSession = () => {
    try {
        fs.writeFileSync(HOST_FILE, JSON.stringify({
            currentHostToken,
            hostLastSeen,
            queueLocked,
            autoDisconnectEnabled
        }));
    } catch (e) {
        console.error('Failed to save host session to disk', e);
    }
};

if (fs.existsSync(HOST_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(HOST_FILE, 'utf8'));
        currentHostToken = data.currentHostToken || null;
        hostLastSeen = data.hostLastSeen || Date.now();
        queueLocked = !!data.queueLocked;
        autoDisconnectEnabled = data.autoDisconnectEnabled !== false;
        console.log('Loaded host session from disk.');
    } catch (e) {
        console.error('Failed to load host session from disk', e);
    }
}

const clearHostSession = () => {
    currentHostToken = null;
    hostLastSeen = Date.now();
    saveHostSession();
};

const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

const extractToken = (req) =>
  req.headers.authorization?.split(' ')[1] || req.query.hostToken || req.body?.hostToken || null;

const isHost = (req) => {
  const token = extractToken(req);
  return !!currentHostToken && token === currentHostToken;
};

const verifyHostToken = (req, res, next) => {
  if (!isHost(req)) {
    return res.status(403).json({ error: 'Unauthorized host action.' });
  }
  hostLastSeen = Date.now();
  next();
};

// ---------------------------------------------------------------------------
// Jeton Spotify
// ---------------------------------------------------------------------------

// Extrait du middleware pour que la boucle de sondage puisse le reutiliser :
// elle tourne sans requete HTTP entrante et doit rafraichir le jeton elle-meme.
const refreshAccessTokenIfNeeded = async () => {
  if (!accessToken) return false;
  if (Date.now() <= tokenExpirationTime - 5 * 60 * 1000) return true;

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
    return true;
  } catch (err) {
    console.error('Failed to refresh token', err.response?.data || err.message);
    return false;
  }
};

// Middleware to ensure we have a valid access token
const verifySpotifyToken = async (req, res, next) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Host not authenticated. Please login first.' });
  }
  if (!(await refreshAccessTokenIfNeeded())) {
    return res.status(401).json({ error: 'Failed to refresh host token.' });
  }
  next();
};

const spotify = (method, url, options = {}) => axios({
  method,
  url: `https://api.spotify.com/v1${url}`,
  headers: { 'Authorization': `Bearer ${accessToken}` },
  ...options
});

// Traduit les erreurs Spotify en messages exploitables cote voiture, ou le
// conducteur ne peut pas aller lire les logs.
const sendSpotifyError = (res, error, fallback) => {
  const status = error.response?.status;
  console.error(`${fallback}:`, error.response?.data || error.message);
  if (status === 404) {
    return res.status(404).json({ error: "Aucun appareil Spotify actif. Lance une lecture sur Spotify d'abord." });
  }
  if (status === 403) {
    return res.status(403).json({ error: 'Action refusee par Spotify (un compte Premium est requis).' });
  }
  if (status === 429) {
    return res.status(429).json({ error: 'Trop de requetes vers Spotify, reessaie dans quelques secondes.' });
  }
  return res.status(500).json({ error: fallback });
};

// ---------------------------------------------------------------------------
// Session hote
// ---------------------------------------------------------------------------

app.post('/api/host/login', (req, res) => {
  if (req.body.password !== HOST_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  // `force` ne fait plus que reprendre la main sur le jeton hote. Vider les
  // passagers ici ejectait tout le monde a chaque redemarrage de l'app voiture,
  // alors que la voiture reprend justement une session deja en cours.
  if (req.body.force) {
    console.log('Force login requested. Rotating host token, keeping guests and Spotify session.');
  }
  currentHostToken = generateRandomString(32);
  hostLastSeen = Date.now();
  if (req.body.autoDisconnectEnabled !== undefined) {
    autoDisconnectEnabled = !!req.body.autoDisconnectEnabled;
  }
  saveHostSession();
  res.json({
    success: true,
    hostToken: currentHostToken,
    spotifyAuthenticated: !!accessToken,
    autoDisconnectEnabled,
    queueLocked
  });
});

// Ferme la session hote SANS toucher aux jetons Spotify. L'ancien
// comportement supprimait tokens.json : fermer l'app voiture deconnectait le
// site de Spotify et imposait de refaire tout le parcours OAuth.
app.post('/api/host/logout', verifyHostToken, (req, res) => {
  queueLocked = false;
  skipVotes.clear();
  clearHostSession();
  broadcast();
  res.json({ success: true, message: 'Host logged out' });
});

// Deconnexion volontaire de Spotify, desormais separee de la fin de session.
app.post('/api/host/spotify/disconnect', verifyHostToken, (req, res) => {
  clearSpotifySession();
  broadcast();
  res.json({ success: true, message: 'Spotify session cleared' });
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
    broadcast();

    // Redirect back to frontend
    res.redirect((process.env.FRONTEND_URI || 'http://localhost:5173') + '/?loggedIn=true');
  } catch (error) {
    console.error('Callback error:', error.response?.data || error.message);
    res.send('Error authenticating with Spotify');
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    authenticated: !!accessToken,
    queueLocked: queueLocked,
    hostActive: !!currentHostToken,
    autoDisconnectEnabled: autoDisconnectEnabled,
    spotifyDeviceActive: spotifyDeviceActive,
    serverVersion: SERVER_VERSION
  });
});

app.post('/api/host/config', verifyHostToken, (req, res) => {
  if (req.body.autoDisconnectEnabled !== undefined) {
    autoDisconnectEnabled = !!req.body.autoDisconnectEnabled;
    saveHostSession();
  }
  res.json({ success: true, autoDisconnectEnabled });
});

app.post('/api/toggle-lock', verifyHostToken, verifySpotifyToken, (req, res) => {
  queueLocked = !queueLocked;
  saveHostSession();
  broadcast();
  res.json({ success: true, queueLocked });
});

app.get('/api/search', verifySpotifyToken, async (req, res) => {
  try {
    const q = req.query.q;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const response = await spotify('get', `/search?q=${encodeURIComponent(q)}&type=track&limit=${limit}`);
    res.json(response.data);
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to search Spotify');
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

  pruneUsers(now);

  res.json({
     activeUsers: listActiveUsers(),
     skipVotes: skipVotes.size,
     requiredVotes: requiredVotes(),
     hasVoted: username ? skipVotes.has(username) : false,
     recentJoins: recentJoins.map(j => ({ name: j.name, emoji: j.emoji }))
  });
});

const requiredVotes = () => Math.max(1, Math.ceil(activeUsers.size / 2));

const listActiveUsers = () =>
  Array.from(activeUsers.entries()).map(([name, d]) => ({ name, emoji: d.emoji }));

const pruneUsers = (now = Date.now()) => {
  // Clean up users inactive for more than 15s
  for (const [user, data] of activeUsers.entries()) {
     if (now - data.lastSeen > 15000) {
         activeUsers.delete(user);
         skipVotes.delete(user);
     }
  }
  // Clean up old join alerts (older than 10s)
  while (recentJoins.length > 0 && recentJoins[0].timestamp < now - 10000) {
      recentJoins.shift();
  }
};

app.post('/api/vote-skip', verifySpotifyToken, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required to vote' });

  skipVotes.add(username);

  const required = requiredVotes();
  if (skipVotes.size >= required) {
      try {
          await spotify('post', '/me/player/next');
          console.log(`Skipped track. Votes reached ${skipVotes.size}/${required}`);
          skipVotes.clear();
      } catch (err) {
          console.error("Skip error:", err.response?.data || err.message);
      }
  }

  broadcast();
  res.json({ success: true, skipVotes: skipVotes.size, requiredVotes: required });
});

const poulpifyQueuedMap = new Map();

app.post('/api/queue', verifySpotifyToken, async (req, res) => {
  try {
    const host = isHost(req);
    // L'hote garde la main sur sa propre file meme quand il l'a verrouillee
    // pour les invites : sinon il ne peut plus rien ajouter depuis la voiture.
    if (queueLocked && !host) {
      return res.status(403).json({ error: 'The queue is currently locked by the host.' });
    }
    const { uri, username, emoji, isInked } = req.body;
    if (!uri) return res.status(400).json({ error: 'Missing track uri' });

    await spotify('post', `/me/player/queue?uri=${encodeURIComponent(uri)}`);

    // Track who added this URI — don't overwrite an inked entry
    const existing = poulpifyQueuedMap.get(uri);
    if (!existing || !existing.isInked) {
        poulpifyQueuedMap.set(uri, {
            username: username || 'Anonymous',
            emoji: emoji || null,
            isInked: isInked || false,
            addedByHost: host
        });
    }

    // Keep map size manageable
    if(poulpifyQueuedMap.size > 200) {
        const first = poulpifyQueuedMap.keys().next().value;
        poulpifyQueuedMap.delete(first);
    }

    refreshQueue().then(broadcast).catch(() => {});
    res.json({ success: true, message: 'Added to queue' });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to add to queue');
  }
});

// ---------------------------------------------------------------------------
// Controle de lecture reserve a l'hote
//
// Ces routes manquaient entierement : sans elles l'app voiture ne peut ni
// mettre en pause ni passer un titre, seul le vote collectif existait. Elles
// servent aussi de repli quand Spotify App Remote n'est pas connecte.
// ---------------------------------------------------------------------------

const hostPlayer = express.Router();
hostPlayer.use(verifyHostToken, verifySpotifyToken);

const deviceQuery = (req) => (req.query.device_id ? `?device_id=${encodeURIComponent(req.query.device_id)}` : '');

hostPlayer.put('/play', async (req, res) => {
  try {
    const { uris, context_uri, offset, position_ms } = req.body || {};
    const body = {};
    if (uris) body.uris = uris;
    if (context_uri) body.context_uri = context_uri;
    if (offset !== undefined) body.offset = offset;
    if (position_ms !== undefined) body.position_ms = position_ms;
    await spotify('put', `/me/player/play${deviceQuery(req)}`, {
      data: Object.keys(body).length ? body : undefined
    });
    res.json({ success: true });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to start playback');
  }
});

hostPlayer.put('/pause', async (req, res) => {
  try {
    await spotify('put', `/me/player/pause${deviceQuery(req)}`);
    res.json({ success: true });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to pause playback');
  }
});

hostPlayer.post('/next', async (req, res) => {
  try {
    await spotify('post', `/me/player/next${deviceQuery(req)}`);
    skipVotes.clear();
    res.json({ success: true });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to skip to next track');
  }
});

hostPlayer.post('/previous', async (req, res) => {
  try {
    await spotify('post', `/me/player/previous${deviceQuery(req)}`);
    skipVotes.clear();
    res.json({ success: true });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to skip to previous track');
  }
});

hostPlayer.put('/seek', async (req, res) => {
  const position = parseInt(req.query.position_ms ?? req.body?.position_ms, 10);
  if (Number.isNaN(position)) return res.status(400).json({ error: 'position_ms required' });
  try {
    await spotify('put', `/me/player/seek?position_ms=${position}`);
    res.json({ success: true });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to seek');
  }
});

hostPlayer.put('/shuffle', async (req, res) => {
  const state = String(req.query.state ?? req.body?.state) === 'true';
  try {
    await spotify('put', `/me/player/shuffle?state=${state}`);
    res.json({ success: true, shuffle: state });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to set shuffle');
  }
});

hostPlayer.put('/repeat', async (req, res) => {
  const state = req.query.state ?? req.body?.state;
  if (!['track', 'context', 'off'].includes(state)) {
    return res.status(400).json({ error: 'state must be track, context or off' });
  }
  try {
    await spotify('put', `/me/player/repeat?state=${state}`);
    res.json({ success: true, repeat: state });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to set repeat mode');
  }
});

hostPlayer.put('/volume', async (req, res) => {
  const volume = parseInt(req.query.volume_percent ?? req.body?.volume_percent, 10);
  if (Number.isNaN(volume) || volume < 0 || volume > 100) {
    return res.status(400).json({ error: 'volume_percent must be between 0 and 100' });
  }
  try {
    await spotify('put', `/me/player/volume?volume_percent=${volume}`);
    res.json({ success: true, volume });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to set volume');
  }
});

app.use('/api/host/player', hostPlayer);

// Skip immediat de l'hote, sans passer par le vote des passagers.
app.post('/api/host/skip', verifyHostToken, verifySpotifyToken, async (req, res) => {
  try {
    await spotify('post', '/me/player/next');
    skipVotes.clear();
    broadcast();
    res.json({ success: true });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to skip to next track');
  }
});

app.get('/api/host/devices', verifyHostToken, verifySpotifyToken, async (req, res) => {
  try {
    const response = await spotify('get', '/me/player/devices');
    res.json(response.data);
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to list devices');
  }
});

app.put('/api/host/transfer', verifyHostToken, verifySpotifyToken, async (req, res) => {
  const deviceId = req.body?.device_id;
  if (!deviceId) return res.status(400).json({ error: 'device_id required' });
  try {
    await spotify('put', '/me/player', {
      data: { device_ids: [deviceId], play: req.body.play !== false }
    });
    res.json({ success: true });
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to transfer playback');
  }
});

// ---------------------------------------------------------------------------
// Etat de lecture : sondage unique + cache
// ---------------------------------------------------------------------------

// Enrichit un titre avec l'attribution Poulpify sans muter l'objet en cache.
const decorateTrack = (track, { revealInked = false } = {}) => {
  if (!track || !track.uri) return track;
  const data = poulpifyQueuedMap.get(track.uri);
  if (!data) return { ...track, addedViaPoulpify: false };
  return {
    ...track,
    addedViaPoulpify: true,
    addedBy: data.username,
    addedByEmoji: data.emoji,
    addedByHost: data.addedByHost,
    // La surprise d'un titre "inked" se revele quand il passe a l'antenne.
    isInked: revealInked ? false : data.isInked
  };
};

const refreshPlayer = async () => {
  const response = await spotify('get', '/me/player');
  const data = (response.status === 204 || !response.data) ? null : response.data;
  cachedPlayer = { data, at: Date.now() };
  spotifyDeviceActive = !!data?.device?.is_active;

  if (data?.item?.uri && currentPlayingTrackUri !== data.item.uri) {
    currentPlayingTrackUri = data.item.uri;
    skipVotes.clear();
  }
  return data;
};

const refreshQueue = async () => {
  const response = await spotify('get', '/me/player/queue');
  cachedQueue = { data: response.data, at: Date.now() };
  return response.data;
};

const playerPayload = () => {
  const data = cachedPlayer.data;
  if (!data) return null;
  return { ...data, item: decorateTrack(data.item, { revealInked: true }) };
};

const queuePayload = () => {
  const data = cachedQueue.data;
  if (!data) return { queue: [], currently_playing: null };
  return {
    ...data,
    currently_playing: decorateTrack(data.currently_playing, { revealInked: true }),
    queue: (data.queue || []).map(t => decorateTrack(t))
  };
};

app.get('/api/player', verifySpotifyToken, async (req, res) => {
  try {
    if (Date.now() - cachedPlayer.at > CACHE_TTL_MS) await refreshPlayer();
    res.json(playerPayload());
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to retrieve player state');
  }
});

app.get('/api/player-queue', verifySpotifyToken, async (req, res) => {
  try {
    if (Date.now() - cachedQueue.at > CACHE_TTL_MS) await refreshQueue();
    res.json(queuePayload());
  } catch (error) {
    sendSpotifyError(res, error, 'Failed to retrieve queue');
  }
});

// ---------------------------------------------------------------------------
// Bibliotheque
// ---------------------------------------------------------------------------

const proxyGet = (route, spotifyPath, label) => {
  app.get(route, verifySpotifyToken, async (req, res) => {
    try {
      const response = await spotify('get', typeof spotifyPath === 'function' ? spotifyPath(req) : spotifyPath);
      res.json(response.data);
    } catch (error) {
      sendSpotifyError(res, error, label);
    }
  });
};

proxyGet('/api/me/playlists', '/me/playlists?limit=50', 'Failed to retrieve playlists');
proxyGet('/api/me/tracks', '/me/tracks?limit=50', 'Failed to retrieve liked tracks');
proxyGet('/api/me/top-tracks', '/me/top/tracks?limit=50', 'Failed to retrieve top tracks');
proxyGet('/api/me/recently-played', '/me/player/recently-played?limit=50', 'Failed to retrieve recently played tracks');
proxyGet('/api/playlists/:id/tracks', (req) => `/playlists/${req.params.id}/tracks?limit=50`, 'Failed to retrieve playlist tracks');

// ---------------------------------------------------------------------------
// Flux d'evenements (SSE)
//
// Remplace le sondage cote client : l'app voiture faisait trois requetes HTTP
// par seconde en boucle. Les routes REST restent en place pour l'app Vue.
// ---------------------------------------------------------------------------

const sseClients = new Set();

const snapshot = () => {
  pruneUsers();
  return {
    at: Date.now(),
    status: {
      authenticated: !!accessToken,
      queueLocked,
      hostActive: !!currentHostToken,
      autoDisconnectEnabled,
      spotifyDeviceActive,
      serverVersion: SERVER_VERSION
    },
    player: playerPayload(),
    queue: queuePayload().queue,
    passengers: listActiveUsers(),
    votes: { skipVotes: skipVotes.size, requiredVotes: requiredVotes() },
    recentJoins: recentJoins.map(j => ({ name: j.name, emoji: j.emoji }))
  };
};

const broadcast = () => {
  if (sseClients.size === 0) return;
  const payload = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
};

app.get('/api/events', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    // Sans cet en-tete, nginx bufferise la reponse et le flux n'arrive jamais.
    'X-Accel-Buffering': 'no'
  });
  res.write(`retry: 3000\n\n`);
  sseClients.add(res);

  // Remplit le cache avant le premier envoi : sans cela, une voiture qui se
  // connecte affiche un ecran vide jusqu'au prochain tour de sondage.
  if (accessToken && Date.now() - cachedPlayer.at > CACHE_TTL_MS) {
    try {
      if (await refreshAccessTokenIfNeeded()) {
        await refreshPlayer();
        await refreshQueue();
      }
    } catch (e) {
      console.error('Initial SSE refresh failed:', e.response?.data || e.message);
    }
  }
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(snapshot())}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Commentaire periodique : garde la connexion ouverte a travers les proxies
// qui coupent les flux inactifs (nginx est regle sur 30s par defaut).
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 15000);

// ---------------------------------------------------------------------------
// Boucle de sondage unique
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000;
let polling = false;

setInterval(async () => {
  if (polling) return;
  if (!accessToken) return;
  // Ne sonde que si quelqu'un ecoute : inutile de tirer sur l'API Spotify
  // quand la voiture est garee et le site ferme.
  const someoneListening = sseClients.size > 0 || (Date.now() - lastRestActivity < 30000);
  if (!someoneListening) return;

  polling = true;
  try {
    if (!(await refreshAccessTokenIfNeeded())) return;
    await refreshPlayer();
    await refreshQueue();
    broadcast();
  } catch (error) {
    if (error.response?.status === 401) {
      console.error('Spotify rejected the access token during polling.');
    } else {
      console.error('Polling error:', error.response?.data || error.message);
    }
  } finally {
    polling = false;
  }
}, POLL_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Expiration de la session hote
// ---------------------------------------------------------------------------

const HOST_INACTIVITY_MS = 45 * 1000;

setInterval(() => {
  if (currentHostToken && autoDisconnectEnabled && (Date.now() - hostLastSeen > HOST_INACTIVITY_MS)) {
    console.log(`Host inactive for ${HOST_INACTIVITY_MS / 1000}s. Ending host session (Spotify and guests preserved).`);
    // Les passagers ne sont plus ejectes : ils continuent d'ecouter et de voir
    // la file pendant que le conducteur retrouve du reseau.
    clearHostSession();
    broadcast();
  }
}, 5000);

app.listen(PORT, () => {
  console.log(`Backend server v${SERVER_VERSION} listening at http://localhost:${PORT}`);
});
