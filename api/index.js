const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// High-Speed JioSaavn Active Mirrors
const SAAVN_MIRRORS = [
  'https://saavn.dev/api/search/songs',
  'https://saavn.me/api/search/songs',
  'https://jiosaavn-api-sigma.vercel.app/api/search/songs'
];

// Active Invidious Audio Mirrors (YouTube Fallback)
const INVIDIOUS_MIRRORS = [
  'https://invidious.nerdvpn.de/api/v1',
  'https://inv.hostux.net/api/v1',
  'https://vid.puffyan.us/api/v1'
];

// Fast Fetch with Timeout Helper
async function fetchWithTimeout(url, timeoutMs = 3500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    clearTimeout(id);
    return null;
  }
}

// 🎵 1. Multi-Engine Search Endpoint
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ success: false, message: 'Search query (q) required' });

  // Step 1: Try JioSaavn High Quality Mirrors
  for (const mirror of SAAVN_MIRRORS) {
    const data = await fetchWithTimeout(`${mirror}?query=${encodeURIComponent(q)}&limit=25`);
    if (data && data.success && data.data?.results?.length > 0) {
      const formatted = data.data.results.map(song => {
        const dUrls = song.downloadUrl || [];
        const bestAudio = dUrls.find(u => u.quality === '320kbps') || dUrls.find(u => u.quality === '160kbps') || dUrls[dUrls.length - 1] || {};
        const imgs = song.image || [];
        const bestImg = imgs.find(i => i.quality === '500x500') || imgs.find(i => i.quality === '150x150') || imgs[imgs.length - 1] || {};

        return {
          id: song.id,
          title: song.name ? song.name.replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'Unknown Title',
          artist: song.artists?.primary?.[0]?.name || song.primaryArtists || 'Unknown Artist',
          album: song.album?.name || 'Single',
          cover: bestImg.url || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300',
          streamUrl: bestAudio.url || '',
          source: 'saavn'
        };
      }).filter(s => s.streamUrl);

      if (formatted.length > 0) {
        return res.json({ success: true, results: formatted, dev: '@lakshitpatidar' });
      }
    }
  }

  // Step 2: Fallback to YouTube (Invidious Network)
  for (const inv of INVIDIOUS_MIRRORS) {
    const data = await fetchWithTimeout(`${inv}/search?q=${encodeURIComponent(q)}&type=video`);
    if (Array.isArray(data) && data.length > 0) {
      const formatted = data.slice(0, 20).map(item => ({
        id: item.videoId,
        title: item.title,
        artist: item.author || 'YouTube Music',
        album: 'YouTube Single',
        cover: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        streamUrl: '',
        source: 'yt'
      }));

      return res.json({ success: true, results: formatted, dev: '@lakshitpatidar' });
    }
  }

  return res.status(404).json({ success: false, message: 'No tracks found for this search.', dev: '@lakshitpatidar' });
});

// 🎧 2. Dynamic Stream Resolver for YouTube Tracks
app.get('/api/stream', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, message: 'Song ID required' });

  for (const inv of INVIDIOUS_MIRRORS) {
    const data = await fetchWithTimeout(`${inv}/videos/${id}`);
    if (data && data.adaptiveFormats) {
      const audioOnly = data.adaptiveFormats
        .filter(f => f.type && f.type.includes('audio'))
        .sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));

      if (audioOnly.length > 0 && audioOnly[0].url) {
        return res.json({
          success: true,
          id,
          streamUrl: audioOnly[0].url,
          dev: '@lakshitpatidar'
        });
      }
    }
  }

  return res.status(500).json({ success: false, message: 'Unable to resolve stream URL', dev: '@lakshitpatidar' });
});

module.exports = app;
                                       
