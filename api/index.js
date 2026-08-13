const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Public Rotating Piped Instances (Guarantees No Vercel IP Block)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.privacydev.net',
  'https://pipedapi.astro.net.br'
];

// Helper to fetch with instance rotation fallback
async function fetchWithRotation(endpoint) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${instance}${endpoint}`, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      continue; // Try next instance seamlessly
    }
  }
  throw new Error('All backend instances busy. Retrying...');
}

// 🎵 1. Unified Search Endpoint (JioSaavn + YouTube Fallback)
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ success: false, message: 'Query (q) required' });

  try {
    // Try Primary Engine (Saavn - 320kbps High Quality)
    const saavnRes = await fetch(`https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&limit=20`);
    const saavnData = await saavnRes.json();

    if (saavnData.success && saavnData.data?.results?.length > 0) {
      const formatted = saavnData.data.results.map(song => {
        const dUrls = song.downloadUrl || [];
        const bestAudio = dUrls.find(u => u.quality === '320kbps') || dUrls[dUrls.length - 1] || {};
        const imgs = song.image || [];
        const bestImg = imgs.find(i => i.quality === '500x500') || imgs[imgs.length - 1] || {};

        return {
          id: song.id,
          title: song.name,
          artist: song.artists?.primary?.[0]?.name || 'Unknown Artist',
          album: song.album?.name || 'Single',
          cover: bestImg.url || '',
          streamUrl: bestAudio.url || '',
          source: 'saavn'
        };
      });

      return res.json({ success: true, results: formatted, dev: '@lakshitpatidar' });
    }

    // Fallback Engine (Piped YT) if track not found on Saavn
    const ytData = await fetchWithRotation(`/search?q=${encodeURIComponent(q)}&filter=music_songs`);
    const formattedYT = (ytData.items || []).map(item => ({
      id: item.url.replace('/watch?v=', ''),
      title: item.title,
      artist: item.uploaderName || 'YouTube Music',
      album: 'YouTube Track',
      cover: item.thumbnail,
      streamUrl: '', // Stream fetched dynamically via /api/stream
      source: 'yt'
    }));

    return res.json({ success: true, results: formattedYT, dev: '@lakshitpatidar' });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, dev: '@lakshitpatidar' });
  }
});

// 🎧 2. Dynamic YT Stream URL Fetcher
app.get('/api/stream', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, message: 'Song ID (id) required' });

  try {
    const streamData = await fetchWithRotation(`/streams/${id}`);
    const audioStreams = (streamData.audioStreams || []).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    
    if (!audioStreams.length) {
      return res.status(404).json({ success: false, message: 'Audio stream unavailable' });
    }

    res.json({
      success: true,
      id,
      streamUrl: audioStreams[0].url,
      mimeType: audioStreams[0].mimeType,
      dev: '@lakshitpatidar'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, dev: '@lakshitpatidar' });
  }
});

module.exports = app;
  
