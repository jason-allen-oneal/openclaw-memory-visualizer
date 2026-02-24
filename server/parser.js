const fs = require('fs');
const path = require('path');
const glob = require('fast-glob');

function shorten(text, max = 42) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

const STOPWORDS = new Set([
  'the','and','that','with','this','from','have','your','you','for','are','was','were','will','just','not','but','what','when','where','who','why','how','into','onto','over','under','than','then','them','they','their','there','here','been','being','can','could','should','would','about','also','only','some','more','most','much','very','like','its','itself','our','out','off','because','while','within','without','into','across','after','before','during','between','through','these','those','such','may','might','must','shall','dont','doesnt','didnt','cant','wont','im','ive','id','we','us'
]);

function extractKeywords(markdown) {
  // Strip code blocks and inline code to reduce noise
  let text = String(markdown || '');
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`[^`]*`/g, ' ');
  // Strip markdown links but keep visible text
  text = text.replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1');
  // Drop URLs
  text = text.replace(/https?:\/\/\S+/g, ' ');

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));

  // Cap size to keep pairwise costs low
  return new Set(words.slice(0, 4000));
}

/**
 * Discovers markdown files in the given root directory.
 *
 * openclaw-memory-visualizer is intended to visualize OpenClaw memory, not the entire workspace.
 * So we default to just:
 *   - memory/ (daily logs)
 *   - MEMORY.md      (durable memory)
 */
async function discoverFiles(root) {
  const patterns = [
    'MEMORY.md',
    'memory/\*\*/\*.md'
  ];

  const files = await glob(patterns, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

  return files;
}

/**
 * Parses a single markdown file for concepts, tags, and headers.
 */
function parseFile(filePath, root) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(root, filePath);

  const nodes = [];
  const links = [];
  const fileRefs = [];
  const keywords = extractKeywords(content);

  // 1. File node
  const fileId = `file:${relativePath}`;
  nodes.push({
    id: fileId,
    type: 'file',
    label: relativePath,
    labelShort: shorten(path.basename(relativePath), 24),
    labelFull: relativePath,
    path: relativePath,
  });

  // 2. Extract wikilinks [[Concept]]
  // We treat these as concept nodes AND as potential file references.
  // File resolution happens later in buildGraph.
  const wikilinkRegex = /\[\[(.*?)\]\]/g;
  let match;
  while ((match = wikilinkRegex.exec(content)) !== null) {
    const concept = match[1].trim();
    if (!concept) continue;

    const conceptId = `concept:${concept}`;

    nodes.push({
      id: conceptId,
      type: 'concept',
      label: concept,
      labelShort: shorten(concept, 24),
      labelFull: concept,
    });

    links.push({
      source: fileId,
      target: conceptId,
      type: 'contains',
    });

    // Also collect as a potential file reference (e.g. [[2026-02-14]] or [[MEMORY]])
    fileRefs.push(concept);
  }

  // 3. Extract tags #tag
  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_-]+)/g;
  while ((match = tagRegex.exec(content)) !== null) {
    const tag = match[1].trim();
    if (!tag) continue;

    const tagId = `tag:${tag}`;

    nodes.push({
      id: tagId,
      type: 'tag',
      label: `#${tag}`,
      labelShort: shorten(`#${tag}`, 18),
      labelFull: `#${tag}` ,
    });

    links.push({
      source: fileId,
      target: tagId,
      type: 'tagged',
    });
  }

  // 4. Extract headers ## Header
  const headerRegex = /^##\s+(.*)$/gm;
  while ((match = headerRegex.exec(content)) !== null) {
    const header = match[1].trim();
    if (!header) continue;

    const headerId = `event:${relativePath}#${header}`;

    nodes.push({
      id: headerId,
      type: 'event',
      label: header,
      labelShort: shorten(header, 28),
      labelFull: header,
      source: relativePath,
    });

    links.push({
      source: fileId,
      target: headerId,
      type: 'header',
    });
  }

  // 5. Extract markdown links to local files: [text](path) and <path>
  // We don't resolve here; we just collect references for buildGraph to map to known file nodes.
  const mdLinkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
  while ((match = mdLinkRegex.exec(content)) !== null) {
    const raw = String(match[1] || '').trim();
    if (!raw) continue;
    fileRefs.push(raw);
  }

  const autoLinkRegex = /<([^>]+)>/g;
  while ((match = autoLinkRegex.exec(content)) !== null) {
    const raw = String(match[1] || '').trim();
    if (!raw) continue;
    fileRefs.push(raw);
  }

  return { nodes, links, fileRefs, relativePath, keywords };
}

/**
 * Generates the full graph from a list of files.
 */
function buildGraph(allParsed) {
  const nodeMap = new Map();
  const links = [];

  for (const data of allParsed) {
    for (const node of data.nodes) {
      // Deduplicate nodes (concepts and tags may appear in many files)
      if (!nodeMap.has(node.id)) {
        nodeMap.set(node.id, node);
      }
    }
    links.push(...data.links);
  }

  // Build lookup of known files for file->file linking
  const filePathToId = new Map();
  const fileBasenameToId = new Map();
  const fileStemToId = new Map();

  for (const n of nodeMap.values()) {
    if (n.type !== 'file') continue;
    const p = String(n.path || n.label || '');
    if (!p) continue;
    filePathToId.set(p, n.id);

    const base = path.basename(p);
    fileBasenameToId.set(base, n.id);

    const stem = base.toLowerCase().endsWith('.md') ? base.slice(0, -3) : base;
    fileStemToId.set(stem, n.id);
  }

  // Resolve collected fileRefs into file->file links
  for (const data of allParsed) {
    const sourceFileId = `file:${data.relativePath}`;
    if (!filePathToId.has(data.relativePath)) continue;

    for (const rawRef of (data.fileRefs || [])) {
      const ref = String(rawRef).trim();
      if (!ref) continue;
      if (/^(https?:|mailto:|tel:|data:)/i.test(ref)) continue;

      // Strip fragments and query
      const noFrag = ref.split('#')[0].split('?')[0].trim();
      if (!noFrag) continue;

      // Attempt to resolve relative to current file's directory
      const fromDir = path.dirname(data.relativePath);
      const normalized = path.normalize(path.join(fromDir, noFrag)).replace(/^\.\//, '');

      // Candidate mappings
      const candidates = [
        normalized,
        noFrag,
        path.basename(noFrag),
      ];

      let targetId = null;
      for (const c of candidates) {
        if (filePathToId.has(c)) { targetId = filePathToId.get(c); break; }
        if (fileBasenameToId.has(c)) { targetId = fileBasenameToId.get(c); break; }
      }

      // If link is like (MEMORY) without extension, try stem match
      if (!targetId) {
        const base = path.basename(noFrag);
        const stem = base.toLowerCase().endsWith('.md') ? base.slice(0, -3) : base;
        if (fileStemToId.has(stem)) targetId = fileStemToId.get(stem);
      }

      if (targetId && targetId !== sourceFileId) {
        links.push({ source: sourceFileId, target: targetId, type: 'ref' });
      }
    }
  }

  // Derived file<->file links based on shared concepts/tags and/or text similarity.
  // This makes file connectivity visible even when there are no explicit hyperlinks.

  // (A) shared concepts/tags
  const fileToTokens = new Map(); // fileId -> Set(tokenId)

  for (const l of links) {
    if (!String(l.source || '').startsWith('file:')) continue;
    const src = String(l.source);
    const tgt = String(l.target);
    const isToken = tgt.startsWith('concept:') || tgt.startsWith('tag:');
    if (!isToken) continue;

    if (!fileToTokens.has(src)) fileToTokens.set(src, new Set());
    fileToTokens.get(src).add(tgt);
  }

  const tokenPairWeights = new Map();
  const tokenFileIds = Array.from(fileToTokens.keys());
  for (let i = 0; i < tokenFileIds.length; i++) {
    for (let j = i + 1; j < tokenFileIds.length; j++) {
      const a = tokenFileIds[i];
      const b = tokenFileIds[j];
      const A = fileToTokens.get(a);
      const B = fileToTokens.get(b);
      if (!A || !B) continue;

      let shared = 0;
      const [small, big] = A.size <= B.size ? [A, B] : [B, A];
      for (const t of small) if (big.has(t)) shared++;

      if (shared > 0) tokenPairWeights.set(`${a}|${b}`, shared);
    }
  }

  for (const [key, weight] of tokenPairWeights.entries()) {
    const [source, target] = key.split('|');
    links.push({ source, target, type: 'related', weight, via: 'tags' });
  }

  // (B) text similarity (fallback): Jaccard overlap on keyword sets
  // Thresholds tuned for short-ish memory logs.
  const fileToKeywords = new Map();
  for (const data of allParsed) {
    const fileId = `file:${data.relativePath}`;
    if (data.keywords && data.keywords.size) fileToKeywords.set(fileId, data.keywords);
  }

  const simLinks = [];
  const simFileIds = Array.from(fileToKeywords.keys());
  for (let i = 0; i < simFileIds.length; i++) {
    for (let j = i + 1; j < simFileIds.length; j++) {
      const a = simFileIds[i];
      const b = simFileIds[j];
      const A = fileToKeywords.get(a);
      const B = fileToKeywords.get(b);
      if (!A || !B) continue;

      let shared = 0;
      const [small, big] = A.size <= B.size ? [A, B] : [B, A];
      for (const t of small) if (big.has(t)) shared++;

      if (shared < 8) continue; // avoid noisy edges

      const union = A.size + B.size - shared;
      const jaccard = union ? (shared / union) : 0;
      if (jaccard < 0.03) continue;

      simLinks.push({ source: a, target: b, type: 'related', weight: shared, score: jaccard, via: 'text' });
    }
  }

  // Keep only top N similarity links to avoid hairballs
  simLinks.sort((x, y) => (y.score - x.score) || (y.weight - x.weight));
  for (const l of simLinks.slice(0, 120)) links.push(l);

  // Timeline links between daily logs
  // Daily logs are usually memory/YYYY-MM-DD.md
  const dailyLogs = [...nodeMap.values()]
    .filter((n) =>
      n.type === 'file' && /^\d{4}-\d{2}-\d{2}\.md$/.test(path.basename(String(n.path)))
    )
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));

  for (let i = 0; i < dailyLogs.length - 1; i++) {
    links.push({
      source: dailyLogs[i].id,
      target: dailyLogs[i + 1].id,
      type: 'timeline',
    });
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links,
  };
}

module.exports = {
  discoverFiles,
  parseFile,
  buildGraph,
};
