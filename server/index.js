require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { discoverFiles, parseFile, buildGraph } = require('./parser');

const app = express();
const PORT = process.env.PORT || 18791;
const MEMORY_ROOT = process.env.MEMORY_ROOT || path.join(__dirname, '../../');
const MEMORY_ALLOW_WRITE = process.env.MEMORY_ALLOW_WRITE === 'true';
const MEMORY_ALLOW_DELETE = process.env.MEMORY_ALLOW_DELETE === 'true';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let cachedGraph = null;
let lastParseTime = 0;
const CACHE_TTL = Number(process.env.CACHE_TTL) || 30000; // 30 seconds

async function getGraph() {
  const now = Date.now();
  if (cachedGraph && (now - lastParseTime < CACHE_TTL)) {
    return cachedGraph;
  }

  console.log(`[${new Date().toISOString()}] Parsing memory at: ${MEMORY_ROOT}`);
  const files = await discoverFiles(MEMORY_ROOT);
  const allParsed = files.map(f => {
    try {
      return parseFile(f, MEMORY_ROOT);
    } catch (err) {
      console.error(`Failed to parse ${f}: ${err.message}`);
      return { nodes: [], links: [] };
    }
  });

  cachedGraph = buildGraph(allParsed);
  lastParseTime = now;
  return cachedGraph;
}

app.get('/api/graph', async (req, res) => {
  try {
    const graph = await getGraph();
    res.json(graph);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/source', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });

  const fullPath = path.resolve(MEMORY_ROOT, filePath);
  // Security check: ensure path is within root
  if (!fullPath.startsWith(MEMORY_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    res.send(content);
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

app.put('/api/source', (req, res) => {
  if (!MEMORY_ALLOW_WRITE) return res.status(403).json({ error: 'Write access disabled' });

  const { path: filePath, content } = req.body || {};
  if (!filePath || typeof filePath !== 'string') return res.status(400).json({ error: 'Missing path' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'Missing content' });

  const fullPath = path.resolve(MEMORY_ROOT, filePath);

  // Security: must remain under root
  if (!fullPath.startsWith(MEMORY_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Safety: only allow editing markdown files
  if (!fullPath.toLowerCase().endsWith('.md')) {
    return res.status(400).json({ error: 'Only .md files are editable' });
  }

  try {
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    // Backup before write (same directory)
    const backupPath = `${fullPath}.bak-${Date.now()}`;
    fs.copyFileSync(fullPath, backupPath);

    fs.writeFileSync(fullPath, content, 'utf8');

    // Invalidate cache so the graph refreshes soon
    cachedGraph = null;
    lastParseTime = 0;

    return res.json({ ok: true, backup: path.relative(MEMORY_ROOT, backupPath) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/source', (req, res) => {
  if (!MEMORY_ALLOW_DELETE) return res.status(403).json({ error: 'Delete access disabled' });

  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });

  const fullPath = path.resolve(MEMORY_ROOT, filePath);

  // Security: must remain under root
  if (!fullPath.startsWith(MEMORY_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Safety: only allow deleting markdown files
  if (!fullPath.toLowerCase().endsWith('.md')) {
    return res.status(400).json({ error: 'Only .md files can be deleted via this API' });
  }

  try {
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    // Move to .trash or just backup and unlink
    const backupPath = `${fullPath}.del-${Date.now()}`;
    fs.copyFileSync(fullPath, backupPath);
    fs.unlinkSync(fullPath);

    // Invalidate cache
    cachedGraph = null;
    lastParseTime = 0;

    return res.json({ ok: true, backup: path.relative(MEMORY_ROOT, backupPath) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`openclaw-memory-visualizer server running on http://127.0.0.1:${PORT}`);
  console.log(`Memory root: ${MEMORY_ROOT}`);
  console.log(`Write allowed: ${MEMORY_ALLOW_WRITE}`);
  console.log(`Delete allowed: ${MEMORY_ALLOW_DELETE}`);
});
