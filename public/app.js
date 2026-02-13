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

function changeView(mode) {
    if (!graphData) return;

    if (mode === 'force') {
        simulation
            .force("x", d3.forceX(width / 2).strength(0.05))
            .force("y", d3.forceY(height / 2).strength(0.05))
            .force("link", d3.forceLink().id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-150))
            .alphaTarget(0.3).restart();
    } else if (mode === 'timeline') {
        // Arrange files along X axis, other nodes near them
        const files = graphData.nodes.filter(n => n.type === 'file').sort((a, b) => a.id.localeCompare(b.id));
        const fileMap = new Map(files.map((f, i) => [f.id, i]));
        
        simulation
            .force("x", d3.forceX(d => {
                if (d.type === 'file') return (fileMap.get(d.id) / files.length) * width + 50;
                // If linked to a file, pull towards that file's position
                const link = graphData.links.find(l => l.source.id === d.id || l.target.id === d.id);
                if (link) {
                    const otherId = link.source.id === d.id ? link.target.id : link.source.id;
                    if (fileMap.has(otherId)) return (fileMap.get(otherId) / files.length) * width + 50;
                }
                return width / 2;
            }).strength(0.8))
            .force("y", d3.forceY(height / 2).strength(0.1))
            .force("charge", d3.forceManyBody().strength(-30))
            .alphaTarget(0.3).restart();
    } else if (mode === 'cluster') {
        // Cluster by type
        const typePos = {
            'file': { x: width * 0.25, y: height * 0.25 },
            'concept': { x: width * 0.75, y: height * 0.25 },
            'tag': { x: width * 0.25, y: height * 0.75 },
            'event': { x: width * 0.75, y: height * 0.75 }
        };

        simulation
            .force("x", d3.forceX(d => typePos[d.type]?.x || width / 2).strength(0.5))
            .force("y", d3.forceY(d => typePos[d.type]?.y || height / 2).strength(0.5))
            .force("charge", d3.forceManyBody().strength(-50))
            .alphaTarget(0.3).restart();
    }
}

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
        .text(d => d.label);

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
    document.getElementById('node-title').textContent = d.label;
    document.getElementById('node-type').textContent = d.type;
    document.getElementById('node-id').textContent = d.id;
    
    const sourceEl = document.getElementById('node-source');
    sourceEl.textContent = 'LOADING SOURCE...';

    if (d.type === 'file') {
        try {
            const res = await fetch(`/api/source?path=${encodeURIComponent(d.path)}`);
            const text = await res.text();
            sourceEl.textContent = text;
        } catch (err) {
            sourceEl.textContent = 'ERROR LOADING SOURCE.';
        }
    } else if (d.type === 'event') {
        try {
            const res = await fetch(`/api/source?path=${encodeURIComponent(d.source)}`);
            const text = await res.text();
            sourceEl.textContent = text;
        } catch (err) {
            sourceEl.textContent = 'ERROR LOADING SOURCE.';
        }
    } else {
        sourceEl.textContent = `CONCEPT: ${d.label}`;
    }
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
