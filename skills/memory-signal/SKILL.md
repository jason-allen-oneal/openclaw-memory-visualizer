---
name: memory-signal
description: "Enhanced memory writing conventions for OpenClaw agents. Ensures memory entries are optimized for openclaw-memory-visualizer visualization using wikilinks, tags, and semantic headers. Use when writing to MEMORY.md or daily logs to create a structured knowledge graph."
---

# Memory Signal

This skill provides the conventions for writing "Signal-Optimized" memory. These standards allow OpenClaw agents to build a structured, navigable knowledge graph that can be visualized by openclaw-memory-visualizer.

## Core Syntax

Follow these three rules for every memory entry:

### 1. Wikilinks `[[Concept]]`
Create a "Hard Link" for every key entity. If a concept is important enough to track across multiple files, wrap it in double brackets.
- **Example**: "Started work on [[Protocol Black]]."
- **Usage**: Project names, unique tools, specific people, or persistent research topics.

### 2. Hashtags `#Tag`
Use tags to define the **state** or **category** of the entry. This allows for global filtering.
- **Common Tags**:
  - `#decision`: A choice made that affects the future of the project.
  - `#milestone`: A significant achievement or release.
  - `#project`: Used when defining a new workspace or repo.
  - `#research`: Findings from web search or documentation review.
  - `#todo`: A pending task (use alongside standard markdown checkboxes).
  - `#continuity`: Notes specifically intended to bridge gaps between sessions.

### 3. Semantic Headers `## Header`
Treat `##` level headers as **Event Nodes**. Every distinct update or thought block should have its own header. openclaw-memory-visualizer treats these as "milestones" on the timeline.

## Best Practices

### The Bridge Pattern
To link two concepts that aren't inherently related, mention them in the same paragraph using wikilinks.
- **Good**: "Integrated [[Context-Drift]] metrics into the [[Monitor]] dashboard."
- **Result**: Creates a direct relationship edge between these two nodes in the graph.

### Daily Log Format (`memory/YYYY-MM-DD.md`)
Always use a `##` header for your summary.
```markdown
## Integration Breach

- Integrated [[Context-Drift]] into [[Monitor]]. #milestone
- Decided to keep the standalone repo for reference. #decision
```

### Durable Memory (`MEMORY.md`)
Use tags to categorize long-term preferences.
```markdown
## SSH Configuration
- Prefers using `cyberdeath` alias for the Mac. #preference
```

## When to use this skill
- During **Automatic Memory Flush** (pre-compaction).
- When a user says "Remember this" or "Take a note."
- When finishing a project or reaching a major milestone.
