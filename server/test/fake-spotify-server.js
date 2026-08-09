// Lance le vrai serveur Poulpify avec un faux Spotify branché à la place
// d'axios, pour vérifier le comportement sans compte Premium ni réseau.
const path = require('path');
const SERVER_DIR = path.join(__dirname, '..');

const queued = [];
const track = (uri, name) => ({
  uri, id: uri.split(':').pop(), name, duration_ms: 210000,
  artists: [{ name: 'Fake Artist' }],
  album: { name: 'Fake Album', images: [{ url: 'https://example.invalid/a.jpg', width: 640, height: 640 }] }
});

const ok = (data, status = 200) => Promise.resolve({ status, data, headers: {} });
const err = (status, data) => Promise.reject(Object.assign(new Error('spotify ' + status), { response: { status, data } }));

function handle(method, url) {
  const p = url.replace('https://api.spotify.com/v1', '');
  if (method === 'get' && p === '/me/player') {
    return ok({
      device: { id: 'dev1', name: 'Fake Speaker', is_active: true, volume_percent: 60 },
      is_playing: true, progress_ms: 30000, item: track('spotify:track:current', 'Fake Song')
    });
  }
  if (method === 'get' && p === '/me/player/queue') {
    return ok({
      currently_playing: track('spotify:track:current', 'Fake Song'),
      queue: queued.map((u, i) => track(u, 'Queued ' + i))
    });
  }
  if (method === 'post' && p.startsWith('/me/player/queue')) {
    queued.push(decodeURIComponent(p.split('uri=')[1]));
    return ok('', 204);
  }
  if (method === 'get' && p === '/me/player/devices') {
    return ok({ devices: [{ id: 'dev1', name: 'Fake Speaker', is_active: true }] });
  }
  if (p.startsWith('/search')) return ok({ tracks: { items: [track('spotify:track:s1', 'Search Result')] } });
  if (p.startsWith('/me/playlists')) return ok({ items: [{ id: 'pl1', name: 'Road Trip', uri: 'spotify:playlist:pl1', images: [] }] });
  if (p.startsWith('/me/tracks')) return ok({ items: [{ track: track('spotify:track:l1', 'Liked One') }] });
  if (p.startsWith('/me/top/tracks')) return ok({ items: [track('spotify:track:top1', 'Top One')] });
  if (p.startsWith('/me/player/recently-played')) return ok({ items: [{ track: track('spotify:track:r1', 'Recent One') }] });
  if (p.startsWith('/playlists/')) return ok({ items: [{ track: track('spotify:track:p1', 'Playlist One') }] });
  // play/pause/next/previous/seek/shuffle/repeat/volume/transfer
  if (p.startsWith('/me/player')) return ok('', 204);
  return err(404, { error: { message: 'not stubbed: ' + method + ' ' + p } });
}

const fakeAxios = (config) => handle(String(config.method).toLowerCase(), config.url);
fakeAxios.get = (url) => handle('get', url);
fakeAxios.post = (url) => {
  if (url.includes('accounts.spotify.com')) {
    return ok({ access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600 });
  }
  return handle('post', url);
};
fakeAxios.put = (url) => handle('put', url);

const axiosPath = require.resolve('axios', { paths: [SERVER_DIR] });
require.cache[axiosPath] = {
  id: axiosPath, filename: axiosPath, loaded: true, exports: fakeAxios, children: [], paths: []
};

// dotenv ne doit pas écraser notre configuration de test.
const dotenvPath = require.resolve('dotenv', { paths: [SERVER_DIR] });
require.cache[dotenvPath] = {
  id: dotenvPath, filename: dotenvPath, loaded: true, exports: { config: () => ({}) }, children: [], paths: []
};

const fs = require('fs');
const os = require('os');
const dir = process.env.STATE_DIR || path.join(os.tmpdir(), 'poulpify-test-state');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({
  accessToken: 'fake-access', refreshToken: 'fake-refresh', tokenExpirationTime: Date.now() + 3600e3
}));

process.env.PORT = '3999';
process.env.HOST_PASSWORD = 'secret-test';
process.env.SPOTIFY_CLIENT_ID = 'cid';
process.env.SPOTIFY_CLIENT_SECRET = 'csecret';
process.env.TOKENS_FILE = path.join(dir, 'tokens.json');
process.env.HOST_FILE = path.join(dir, 'host.json');

require(path.join(SERVER_DIR, 'index.js'));
