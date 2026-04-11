const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// In production, we use relative paths thanks to Nginx proxying /api
// In development, we target the Node server directly on port 3000
export const API_BASE_URL = isLocal ? 'http://127.0.0.1:3000' : '';

export default {
    API_BASE_URL
};
