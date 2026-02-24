const width = window.innerWidth - 400;
const height = window.innerHeight;

const svg = d3.select("#graph")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .call(d3.zoom().on("zoom", (event) => {
        container.attr("transform", event.transform);
    }))
    .append("g");

const container = svg.append("g");

const simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(d => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-150))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.05))
    .force("y", d3.forceY(height / 2).strength(0.05));

let graphData = null;

let currentEditablePath = null;
let lastLoadedText = '';
let isEditing = false;

const editorControls = document.getElementById('editor-controls');
const btnEdit = document.getElementById('btn-edit');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const btnDelete = document.getElementById('btn-delete');
const saveStatus = document.getElementById('save-status');
const sourceEl = document.getElementById('node-source');

function setEditing(on) {
    isEditing = on;
    sourceEl.readOnly = !on;
    btnEdit.style.display = on ? 'none' : 'inline-block';
    btnDelete.style.display = on ? 'none' : 'inline-block';
    btnSave.style.display = on ? 'inline-block' : 'none';
    btnCancel.style.display = on ? 'inline-block' : 'none';
    saveStatus.textContent = '';
}

btnEdit.addEventListener('click', () => {
    if (!currentEditablePath) return;
    setEditing(true);
    sourceEl.focus();
});

btnDelete.addEventListener('click', async () => {
    if (!currentEditablePath) return;
    if (!confirm(`CAUTION: Delete ${currentEditablePath}?\nThis will remove the file from disk (a backup will be created).`)) return;

    saveStatus.textContent = 'DELETING...';

    try {
        const res = await fetch(`/api/source?path=${encodeURIComponent(currentEditablePath)}`, {
            method: 'DELETE'
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        saveStatus.textContent = 'DELETED.';
        sourceEl.value = 'FILE_DELETED';
        currentEditablePath = null;
        editorControls.style.display = 'none';

        // Wait a second then reload to show new graph state
        setTimeout(() => location.reload(), 1000);
    } catch (e) {
        saveStatus.textContent = `ERROR: ${e.message}`;
    }
});

btnCancel.addEventListener('click', () => {
    if (!currentEditablePath) return;
    sourceEl.value = lastLoadedText;
    setEditing(false);
});

btnSave.addEventListener('click', async () => {
    if (!currentEditablePath) return;
    saveStatus.textContent = 'SAVING...';

    try {
        const res = await fetch('/api/source', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentEditablePath, content: sourceEl.value })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        lastLoadedText = sourceEl.value;
        saveStatus.textContent = 'SAVED.';
        setEditing(false);

        // Invalidate client graph view: reload graph next time (cheap)
        // You can uncomment to force a full reload immediately.
        // location.reload();
    } catch (e) {
        saveStatus.textContent = `ERROR: ${e.message}`;
    }
});

async function loadGraph() {
    const data = await d3.json("/api/graph");
    graphData = data;
    
    const link = container.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(data.links)
        .enter().append("line")
        .attr("class", "link");

    const node = container.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(data.nodes)
        .enter().append("g")
        .attr("class", d => `node node-${d.type}`)
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    node.append("circle")
        .attr("r", d => d.type === 'file' ? 8 : 5)
        .on("click", (event, d) => showDetails(d));

    node.append("text")
        .attr("dx", 12)
        .attr("dy", ".35em")
        .text(d => d.labelShort || d.label);

    // Tooltip with full label
    node.append('title').text(d => d.labelFull || d.label);

    simulation
        .nodes(data.nodes)
        .on("tick", ticked);

    simulation.force("link")
        .links(data.links);

    function ticked() {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("transform", d => `translate(${d.x},${d.y})`);
    }
}

async function showDetails(d) {
    document.getElementById('node-title').textContent = d.labelFull || d.label;
    document.getElementById('node-type').textContent = d.type;
    document.getElementById('node-id').textContent = d.id;

    // Default: no editing
    currentEditablePath = null;
    editorControls.style.display = 'none';
    setEditing(false);

    sourceEl.value = 'LOADING SOURCE...';

    // Only allow editing markdown files we have a concrete path for.
    // - file node: d.path
    // - event node: d.source (the backing file)
    const pathToLoad = (d.type === 'file') ? d.path : (d.type === 'event' ? d.source : null);

    if (pathToLoad) {
        try {
            const res = await fetch(`/api/source?path=${encodeURIComponent(pathToLoad)}`);
            const text = await res.text();
            sourceEl.value = text;
            lastLoadedText = text;
            currentEditablePath = pathToLoad;
            editorControls.style.display = 'flex';
            setEditing(false);
        } catch (err) {
            sourceEl.value = 'ERROR LOADING SOURCE.';
        }
        return;
    }

    // Non-file nodes: read-only summary
    sourceEl.value = (d.type === 'concept' || d.type === 'tag')
        ? `${d.type.toUpperCase()}: ${d.label}`
        : `NODE: ${d.label}`;
}

function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

loadGraph();
