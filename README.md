# SignalGraph

An OpenClaw knowledge management and memory visualizer. SignalGraph parses markdown memory files to build a persistent graph of decisions, concepts, and continuity nodes.

## Features

- **Entity Extraction**: Automatically extracts wikilinks `[[Concept]]`, tags `#tag`, and headers `## Header`.
- **Direct Source Editing**: Edit backing markdown files directly from the side panel with auto-backups.
- **Semantic Connectivity**: Automated file-to-file linking based on shared tags, concepts, and Jaccard keyword similarity.
- **ZeroSignal Aesthetic**: CRT scanline effects and high-contrast terminal styling.
- **Force-Directed Graph**: Interactive D3.js visualization.

## Install

```bash
cd signal-graph
npm install
```

## Run

```bash
# Set the root directory for scanning (e.g., your OpenClaw workspace)
export SIGNAL_GRAPH_ROOT=~/.openclaw/workspace

npm start
```

Open: http://localhost:18791

## Configuration

- `PORT`: Server port (default: 18791).
- `SIGNAL_GRAPH_ROOT`: Root directory for markdown discovery.

## Security

- Designed for **localhost** only.
- Restricted to `.md` file editing under the specified root.
- Automated timestamped backups created on every save.

## License

MIT
