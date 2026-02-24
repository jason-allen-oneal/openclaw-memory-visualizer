const { discoverFiles, parseFile, buildGraph } = require('./server/parser');
const path = require('path');

async function test() {
  const root = path.join(process.env.HOME, '.openclaw', 'workspace'); // Just a test root
  console.log(`Scanning root: ${root}`);

  const files = await discoverFiles(root);
  console.log(`Found ${files.length} files.`);

  const allParsed = files.slice(0, 20).map(f => parseFile(f, root));
  const graph = buildGraph(allParsed);

  console.log(`Graph build: ${graph.nodes.length} nodes, ${graph.links.length} links.`);
  console.log('Sample node:', graph.nodes[0]);
  console.log('Sample link:', graph.links[0]);
}

test().catch(console.error);
