/* Static canvas viewer: no server, external scripts, or network requests. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const initialRecords = window.KG_DATA?.records || [];
  let records = initialRecords, allGraph, graph = {nodes: [], edges: []}, nodeMap = new Map();
  let activeTypes = new Set(), selected = null, selectedEdge = null, focus = null;
  let hovered = null, edgeHovered = null, frame = 0, paused = false, tableMode = false, touched = false;
  let width = 1, height = 1, scale = 1, offsetX = 0, offsetY = 0, drag = null;
  let edgePaths = [], noticeTimer;
  const canvas = $('graph'), ctx = canvas.getContext('2d');
  const emptyInspector = $('inspector').innerHTML;
  let uiScale = 1, theme = {};
  function updateGraphStyle() {
    const style = getComputedStyle(document.documentElement);
    uiScale = parseFloat(style.fontSize) / 16;
    for (const key of ['edge','edge-active','edge-dim','arrow','label-bg','label-text','node-outline','text']) theme[key] = style.getPropertyValue('--' + key).trim();
  }
  updateGraphStyle();
  window.addEventListener('kg-theme-change', () => { updateGraphStyle(); draw(); });
  function element(tag, className, text) {
    const el = document.createElement(tag); if (className) el.className = className;
    if (text !== undefined) el.textContent = text; return el;
  }
  function dot(type) { const el = element('span', 'dot'); el.style.setProperty('--node-color', KG.colorFor(type)); return el; }
  function notify(message, error = false) {
    clearTimeout(noticeTimer); $('notice').textContent = message; $('notice').className = error ? 'error' : ''; $('notice').hidden = false;
    noticeTimer = setTimeout(() => { $('notice').hidden = true; }, error ? 12000 : 5000);
  }
  function fillSelect(id, values, label) {
    $(id).replaceChildren(new Option(label, ''));
    for (const value of values) $(id).add(new Option(value.replace(/\.(csv|txt|json)$/i, ''), value));
  }
  function loadDataset(next) {
    clearTimeout(noticeTimer); $('notice').hidden = true;
    records = next; allGraph = KG.buildGraph(records);
    const types = [...new Set(allGraph.nodes.map(n => n.type))].sort(); activeTypes = new Set(types);
    fillSelect('source', [...new Set(records.map(r => r.source_file))].sort(), 'All documents');
    fillSelect('predicate', [...new Set(records.map(r => r.predicate))].sort(), 'All relations');
    $('type-total').textContent = types.length; $('type-list').replaceChildren();
    for (const type of types) {
      const label = element('label', 'type-row'), input = element('input'); input.type = 'checkbox'; input.checked = true; input.value = type;
      input.addEventListener('change', () => { input.checked ? activeTypes.add(type) : activeTypes.delete(type); focus = null; rebuild(); });
      label.append(input, dot(type), element('span', '', type), element('span', 'type-count', allGraph.nodes.filter(n => n.type === type).length));
      $('type-list').append(label);
    }
    $('search').value = ''; selected = null; selectedEdge = null; focus = null;
    rebuild();
  }
  function baseRecords() { return KG.filterRecords(records, {types: activeTypes, source: $('source').value, predicate: $('predicate').value}); }
  function rebuild() {
    graph = KG.buildGraph(baseRecords());
    if (focus) {
      const neighbors = new Set([focus]);
      for (const edge of graph.edges) if (edge.source === focus || edge.target === focus) { neighbors.add(edge.source); neighbors.add(edge.target); }
      graph.nodes = graph.nodes.filter(n => neighbors.has(n.id));
      graph.edges = graph.edges.filter(e => neighbors.has(e.source) && neighbors.has(e.target));
    }
    nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
    if (!nodeMap.has(selected)) selected = null;
    if (!graph.edges.some(e => e.id === selectedEdge)) selectedEdge = null;
    hovered = null; edgeHovered = null; $('tooltip').hidden = true;
    layout(); frame = 0; touched = false; fit();
    $('node-count').textContent = graph.nodes.length;
    $('edge-count').textContent = graph.edges.length;
    const visibleRecords = graph.edges.flatMap(e => e.records);
    $('row-count').textContent = visibleRecords.length;
    $('paper-count').textContent = new Set(visibleRecords.map(r => r.source_file)).size;
    $('empty').hidden = graph.nodes.length > 0 || tableMode;
    renderInspector(); renderSearch(); renderTable(); draw();
  }
  function layout() {
    const adjacency = new Map(graph.nodes.map(n => [n.id, []]));
    for (const e of graph.edges) { adjacency.get(e.source).push(e.target); adjacency.get(e.target).push(e.source); }
    const seen = new Set(), components = [];
    for (const n of graph.nodes) {
      if (seen.has(n.id)) continue;
      const ids = [n.id]; seen.add(n.id);
      for (let i = 0; i < ids.length; i++) for (const next of adjacency.get(ids[i])) if (!seen.has(next)) { seen.add(next); ids.push(next); }
      components.push(ids.map(id => nodeMap.get(id)).sort((a, b) => b.degree - a.degree));
    }
    components.sort((a, b) => b.length - a.length);
    // Largest component in the middle; smaller ones spiral outwards around it, so the whole graph forms one disc.
    // Each ring sits just outside the area already used by the components placed before it.
    let usedArea = 0;
    components.forEach((component, k) => {
      const size = Math.sqrt(component.length) * 120 + 110, area = size * size;
      const ring = k ? Math.sqrt((usedArea + area / 2) / Math.PI) : 0, turn = k * 2.3999632297;
      const cx = Math.cos(turn) * ring, cy = Math.sin(turn) * ring;
      usedArea += area;
      component.forEach((n, i) => {
        const angle = i * 2.3999632297, radius = 55 * Math.sqrt(i + .5);
        Object.assign(n, {x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, vx: 0, vy: 0, cx, cy, r: 38 + Math.min(18, Math.sqrt(n.degree) * 2.5), pinned: false});
      });
    });
    const pairs = new Map();
    for (const e of graph.edges) {
      const key = JSON.stringify([e.source, e.target].sort());
      if (!pairs.has(key)) pairs.set(key, []); pairs.get(key).push(e);
    }
    for (const group of pairs.values()) group.forEach((edge, i) => { edge.bend = (i - (group.length - 1) / 2) * 27 * (edge.source < edge.target ? 1 : -1); });
  }
  function physics() {
    const nodes = graph.nodes, alpha = Math.max(.06, 1 - frame / 300);
    // Nearby nodes repel one another. Buckets avoid comparing every pair in a large collection.
    const cellSize = 400, buckets = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], x = Math.floor(n.x / cellSize), y = Math.floor(n.y / cellSize), key = `${x},${y}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i], x = Math.floor(a.x / cellSize), y = Math.floor(a.y / cellSize);
      for (let bx = x - 1; bx <= x + 1; bx++) for (let by = y - 1; by <= y + 1; by++) for (const j of buckets.get(`${bx},${by}`) || []) {
        if (j <= i) continue;
        const b = nodes[j], dx = a.x - b.x || .01, dy = a.y - b.y || .01, d2 = Math.max(100, dx * dx + dy * dy);
        if (d2 > 160000) continue;
        const distance = Math.sqrt(d2), clearance = a.r + b.r + 14;
        const force = 1100 * alpha / d2 + Math.max(0, clearance - distance) / distance * .12;
        a.vx += dx * force; a.vy += dy * force; b.vx -= dx * force; b.vy -= dy * force;
      }
    }
    for (const e of graph.edges) {
      const a = nodeMap.get(e.source), b = nodeMap.get(e.target); if (a === b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1;
      const force = (distance - 110) / distance * .014 * alpha;
      a.vx += dx * force; a.vy += dy * force; b.vx -= dx * force; b.vy -= dy * force;
    }
    for (const n of nodes) {
      if (n.pinned || drag?.node === n) { n.vx = 0; n.vy = 0; continue; }
      n.vx = (n.vx + (n.cx - n.x) * .004 * alpha) * .75;
      n.vy = (n.vy + (n.cy - n.y) * .004 * alpha) * .75;
      n.x += Math.max(-15, Math.min(15, n.vx)); n.y += Math.max(-15, Math.min(15, n.vy));
    }
  }
  function fit() {
    if (!graph.nodes.length) return;
    const xs = graph.nodes.map(n => n.x), ys = graph.nodes.map(n => n.y);
    const padding = Math.max(...graph.nodes.map(n => n.r)) + 10;
    const minX = Math.min(...xs) - padding, maxX = Math.max(...xs) + padding, minY = Math.min(...ys) - padding, maxY = Math.max(...ys) + padding;
    scale = Math.max(.04, Math.min(2, (width - 60) / (maxX - minX), (height - 60) / (maxY - minY)));
    offsetX = width / 2 - (minX + maxX) / 2 * scale; offsetY = height / 2 - (minY + maxY) / 2 * scale; draw();
  }
  const nodeRadius = n => Math.max(6 * uiScale, n.r * scale);
  const screen = n => ({x: n.x * scale + offsetX, y: n.y * scale + offsetY});
  function edgeGeometry(e) {
    const a = screen(nodeMap.get(e.source)), b = screen(nodeMap.get(e.target));
    if (e.source === e.target) {
      const r = 23 * scale + Math.abs(e.bend) * scale;
      return {a, b, c: {x: a.x + r * 2, y: a.y - r * 3}, d: {x: a.x - r * 2, y: a.y - r * 3}, loop: true};
    }
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    return {a, b, c: {x: (a.x + b.x) / 2 - dy / length * e.bend * scale, y: (a.y + b.y) / 2 + dx / length * e.bend * scale}};
  }
  function point(g, t) {
    const u = 1 - t;
    if (g.loop) return {x: u*u*u*g.a.x + 3*u*u*t*g.c.x + 3*u*t*t*g.d.x + t*t*t*g.b.x, y: u*u*u*g.a.y + 3*u*u*t*g.c.y + 3*u*t*t*g.d.y + t*t*t*g.b.y};
    return {x: u*u*g.a.x + 2*u*t*g.c.x + t*t*g.b.x, y: u*u*g.a.y + 2*u*t*g.c.y + t*t*g.b.y};
  }
  function drawNodeLabel(n, p, radius) {
    const preferredSize = Math.min(20 * uiScale, radius * .4), maxWidth = radius * 1.6;
    if (preferredSize < 4) return; // Too small to read when zoomed far out.
    ctx.font = `600 ${preferredSize}px system-ui`;
    // Keep ordinary words intact where possible instead of splitting a short name.
    const widestWord = Math.max(...n.label.split(/\s+/).map(word => ctx.measureText(word).width), 1);
    const fontSize = Math.min(preferredSize, Math.max(radius * .28, preferredSize * maxWidth / widestWord));
    ctx.font = `600 ${fontSize}px system-ui`;
    // Cache wrapping while the layout moves; recalculate only when zoom changes.
    const key = radius.toFixed(2) + ":" + fontSize.toFixed(2);
    if (n.labelLayout?.key !== key) {
      const lines = []; let remaining = n.label.replace(/\s+/g, ' ').trim();
      while (remaining && lines.length < 3) {
        if (ctx.measureText(remaining).width <= maxWidth) { lines.push(remaining); remaining = ''; break; }
        let end = 1;
        while (end < remaining.length && ctx.measureText(remaining.slice(0, end + 1)).width <= maxWidth) end++;
        const space = remaining.lastIndexOf(' ', end);
        if (space > 0) end = space;
        lines.push(remaining.slice(0, end).trim()); remaining = remaining.slice(end).trim();
      }
      if (remaining) {
        let last = lines.pop();
        while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
        lines.push(last + '…');
      }
      n.labelLayout = {key, lines};
    }
    const lines = n.labelLayout.lines, lineHeight = fontSize * 1.2;
    ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, radius - 1), 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0b1524'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, p.x, p.y + (i - (lines.length - 1) / 2) * lineHeight));
    ctx.restore();
  }
  function draw() {
    if (tableMode) return;
    ctx.clearRect(0, 0, width, height); edgePaths = [];
    const active = hovered || selected, neighbors = new Set(active ? [active] : []);
    if (active) for (const e of graph.edges) if (e.source === active || e.target === active) { neighbors.add(e.source); neighbors.add(e.target); }
    const query = $('search').value.trim().toLocaleLowerCase();
    for (const e of graph.edges) {
      const highlight = e.source === active || e.target === active || e.id === selectedEdge || e.id === edgeHovered;
      const g = edgeGeometry(e); edgePaths.push({edge: e, geometry: g});
      ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y);
      if (g.loop) ctx.bezierCurveTo(g.c.x, g.c.y, g.d.x, g.d.y, g.b.x, g.b.y);
      else ctx.quadraticCurveTo(g.c.x, g.c.y, g.b.x, g.b.y);
      ctx.strokeStyle = highlight ? theme['edge-active'] : active ? theme['edge-dim'] : theme.edge; ctx.lineWidth = (highlight ? 1.8 : 1) * uiScale; ctx.stroke();
      const targetRadius = nodeRadius(nodeMap.get(e.target)) + 2;
      let t = .97;
      while (t > .45 && Math.hypot(point(g,t).x - g.b.x, point(g,t).y - g.b.y) < targetRadius) t -= .02;
      const tip = point(g, t), before = point(g, Math.max(0, t - .04)), angle = Math.atan2(tip.y - before.y, tip.x - before.x), arrow = (highlight ? 8 : 5) * uiScale;
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - arrow * Math.cos(angle - .45), tip.y - arrow * Math.sin(angle - .45)); ctx.lineTo(tip.x - arrow * Math.cos(angle + .45), tip.y - arrow * Math.sin(angle + .45)); ctx.closePath(); ctx.fillStyle = highlight ? theme['edge-active'] : active ? theme['edge-dim'] : theme.arrow; ctx.fill();
      // Scale predicates with zoom so they stay just below the smallest node label (about r * .28).
      const edgeFontSize = Math.min(14 * uiScale, 14 * scale);
      if ((highlight || ($('labels').checked && scale > .9)) && edgeFontSize >= 4) {
        const mid = point(g, .5), fontSize = edgeFontSize, padding = fontSize * .35;
        ctx.save(); ctx.font = `500 ${fontSize}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(e.predicate).width; ctx.fillStyle = theme['label-bg'];
        ctx.fillRect(mid.x - w / 2 - padding, mid.y - fontSize * .7, w + padding * 2, fontSize * 1.4);
        ctx.fillStyle = theme['label-text']; ctx.fillText(e.predicate, mid.x, mid.y); ctx.restore();
      }
    }
    for (const n of graph.nodes) {
      const p = screen(n), matched = query && n.label.toLocaleLowerCase().includes(query), dim = (active && !neighbors.has(n.id)) || (query && !matched && !neighbors.has(n.id));
      const radius = nodeRadius(n);
      ctx.globalAlpha = dim ? .16 : 1;
      if (n.id === selected || matched) { ctx.beginPath(); ctx.arc(p.x,p.y,radius + 4,0,Math.PI*2); ctx.strokeStyle = matched ? theme.text : n.color; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(p.x,p.y,radius,0,Math.PI*2); ctx.fillStyle = n.color; ctx.fill();
      ctx.strokeStyle = theme['node-outline']; ctx.lineWidth = 1.2; ctx.stroke();
      if (!dim && (($('labels').checked && scale > .35) || n.id === active || matched || (active && neighbors.has(n.id)) || (scale > .55 && n.degree >= 6))) {
        drawNodeLabel(n, p, radius);
      }
      ctx.globalAlpha = 1;
    }
  }
  function animate() {
    if (!paused && !tableMode && frame < 320 && graph.nodes.length) {
      physics(); frame++;
      if (!touched && [30,100,250,320].includes(frame)) fit();
      draw();
    }
    requestAnimationFrame(animate);
  }
  function nodeButton(n) { const button = element('button', 'node-link', n.label); button.addEventListener('click', () => selectNode(n.id, true)); return button; }
  function evidenceCard(e, owner) {
    const card = element('div', 'relation-card');
    const outgoing = e.source === owner, other = nodeMap.get(outgoing ? e.target : e.source);
    card.append(element('div', 'relation-predicate', `${outgoing ? '→' : '←'} ${e.predicate}`), nodeButton(other));
    const pill = element('span', 'type-pill', other.type); pill.prepend(dot(other.type)); card.append(pill);
    const details = element('details'), summary = element('summary', '', `${e.records.length} evidence row${e.records.length === 1 ? '' : 's'}`); details.append(summary);
    for (const record of e.records) {
      const item = element('div', 'evidence'); item.append(element('div', '', (record.source_file || 'Unknown source').replace(/\.(csv|txt|json)$/i, '')));
      if (record.source_row != null) item.append(element('div', '', `CSV line ${record.source_row}`));
      if (record.block_index != null) item.append(element('div', '', `Block ${record.block_index}`));
      for (const [key, value] of Object.entries(record)) if (!KG.required.includes(key) && !['source_file','source_row','block_index'].includes(key) && value != null && value !== '') item.append(element('div', '', `${key.replaceAll('_',' ')}: ${value}`));
      details.append(item);
    }
    card.append(details); return card;
  }
  function renderInspector() {
    const box = $('inspector'); box.replaceChildren();
    if (selected || selectedEdge) document.querySelector('.workspace').classList.remove('inspector-closed');
    $('details').classList.toggle('selected', !!(selected || selectedEdge));
    if (selectedEdge) {
      const e = graph.edges.find(edge => edge.id === selectedEdge);
      box.append(element('h2', 'entity-title', e.predicate), element('p', 'entity-summary', 'Directed relation · subject → object'), nodeButton(nodeMap.get(e.source)), evidenceCard(e, e.source)); return;
    }
    const n = nodeMap.get(selected);
    if (!n) { box.innerHTML = emptyInspector; return; }
    box.append(element('h2', 'entity-title', n.label));
    const pill = element('span', 'type-pill', n.type); pill.prepend(dot(n.type)); box.append(pill);
    const edges = graph.edges.filter(e => e.source === selected || e.target === selected);
    const sources = new Set(edges.flatMap(e => e.records.map(r => r.source_file)));
    box.append(element('p', 'entity-summary', `${edges.length} connections across ${sources.size} paper${sources.size === 1 ? '' : 's'} in this view.`));
    const button = element('button', 'focus-button', focus ? '↗ Show full filtered graph' : '◎ Focus on neighbourhood');
    button.addEventListener('click', () => { focus = focus ? null : selected; rebuild(); }); box.append(button, element('h3', 'relations-heading', 'CONNECTED RELATIONS'));
    edges.sort((a,b) => a.predicate.localeCompare(b.predicate)).forEach(e => box.append(evidenceCard(e, selected)));
  }
  function selectNode(id, center = false) {
    if (!nodeMap.has(id)) return;
    selected = id; selectedEdge = null; renderInspector();
    if (center && !tableMode) { const n = nodeMap.get(id); scale = Math.max(scale, 1.15); offsetX = width / 2 - n.x * scale; offsetY = height / 2 - n.y * scale; touched = true; }
    draw();
  }
  function renderSearch() {
    const box = $('search-results'); box.replaceChildren(); const query = $('search').value.trim().toLocaleLowerCase();
    if (!query) return;
    const matches = graph.nodes.filter(n => n.label.toLocaleLowerCase().includes(query) || n.type.toLocaleLowerCase().includes(query));
    box.append(element('div','search-note', `${matches.length} matches in this view${matches.length > 40 ? ' · showing first 40' : ''}`));
    for (const n of matches.slice(0,40)) {
      const button = element('button','search-result'), label = element('span','', n.label); label.append(element('small','',n.type)); button.append(dot(n.type),label); button.addEventListener('click',() => selectNode(n.id,true)); box.append(button);
    }
  }
  function renderTable() {
    if (!tableMode) return;
    const body = $('triples-body'); body.replaceChildren();
    for (const edge of graph.edges) {
      const row = element('tr');
      for (const value of [edge.source, edge.predicate, edge.target]) {
        const cell = element('td');
        if (value === edge.predicate) cell.textContent = edge.predicate;
        else { const n = nodeMap.get(value); cell.append(nodeButton(n)); const small = element('small','',n.type); small.prepend(dot(n.type)); cell.append(small); }
        row.append(cell);
      }
      const cell = element('td'), button = element('button','text-button', `${edge.records.length} row${edge.records.length === 1 ? '' : 's'}`); button.addEventListener('click',() => { selectedEdge = edge.id; selected = null; renderInspector(); draw(); }); cell.append(button); row.append(cell); body.append(row);
    }
    if (!graph.edges.length) { const row = element('tr'), cell = element('td','', 'No relations match your filters.'); cell.colSpan = 4; row.append(cell); body.append(row); }
  }
  function setView(table) {
    tableMode = table; $('canvas-wrap').hidden = table; $('table-wrap').hidden = !table;
    for (const [id, active] of [['graph-tab',!table],['table-tab',table]]) { $(id).classList.toggle('active',active); $(id).setAttribute('aria-pressed',String(active)); }
    document.querySelector('.graph-controls').hidden = table;
    $('graph-help').textContent = table ? 'Select any entity or evidence count to inspect.' : 'Drag to explore · Scroll to zoom · Click to inspect';
    $('empty').hidden = graph.nodes.length > 0 || table;
    if (table) renderTable(); else { resize(); draw(); }
  }
  function resize() {
    if (tableMode) return;
    const previousWidth = width, previousHeight = height;
    const rect = $('canvas-wrap').getBoundingClientRect(); width = rect.width; height = rect.height;
    updateGraphStyle();
    const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); ctx.setTransform(ratio,0,0,ratio,0,0);
    if (touched) { offsetX += (width-previousWidth)/2; offsetY += (height-previousHeight)/2; draw(); }
    else fit();
  }
  function hitNode(x,y) { return [...graph.nodes].reverse().find(n => { const p = screen(n); return Math.hypot(p.x-x,p.y-y) < nodeRadius(n)+3; }); }
  function hitEdge(x,y) {
    let best, distance = 5;
    for (const path of edgePaths) {
      let previous = point(path.geometry,0);
      for (let i = 1; i <= 20; i++) {
        const next = point(path.geometry,i/20), dx = next.x - previous.x, dy = next.y - previous.y;
        const t = Math.max(0, Math.min(1, ((x-previous.x)*dx+(y-previous.y)*dy)/(dx*dx+dy*dy || 1)));
        const d = Math.hypot(x-previous.x-t*dx,y-previous.y-t*dy);
        if (d < distance) { best = path.edge; distance = d; } previous = next;
      }
    }
    return best;
  }
  function pointer(event) { const rect = canvas.getBoundingClientRect(); return {x:event.clientX-rect.left,y:event.clientY-rect.top}; }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    const p = pointer(event); drag = {...p, startX:p.x,startY:p.y, node:hitNode(p.x,p.y), moved:false, id:event.pointerId}; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    const p = pointer(event);
    if (drag) {
      if (event.pointerId !== drag.id) return;
      if (Math.hypot(p.x-drag.startX,p.y-drag.startY)>3) drag.moved = true;
      if (drag.moved) {
        touched = true;
        if (drag.node) { drag.node.x += (p.x-drag.x)/scale; drag.node.y += (p.y-drag.y)/scale; drag.node.pinned = true; }
        else { offsetX += p.x-drag.x; offsetY += p.y-drag.y; }
      }
      drag.x=p.x;drag.y=p.y; $('tooltip').hidden=true; draw(); return;
    }
    const node = hitNode(p.x,p.y), edge = node ? null : hitEdge(p.x,p.y);
    hovered = node?.id || null; edgeHovered = edge?.id || null; canvas.style.cursor = node || edge ? 'pointer' : 'grab';
    $('tooltip').hidden = !(node || edge);
    if (node || edge) {
      $('tooltip').textContent = node ? `${node.label} · ${node.type}` : `${nodeMap.get(edge.source).label} → ${edge.predicate} → ${nodeMap.get(edge.target).label}`;
      const tw = $('tooltip').offsetWidth, th = $('tooltip').offsetHeight;
      $('tooltip').style.left = `${Math.max(0,Math.min(width-tw-8,p.x+15))}px`; $('tooltip').style.top = `${Math.max(0,Math.min(height-th-8,p.y+15))}px`;
    }
    draw();
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (drag.node) selectNode(drag.node.id);
      else { const p=pointer(event), edge=hitEdge(p.x,p.y); selected=null; selectedEdge=edge?.id || null;renderInspector();draw(); }
    }
    drag=null;
  });
  canvas.addEventListener('pointercancel', () => { drag=null; });
  canvas.addEventListener('pointerleave', () => { hovered=null;edgeHovered=null;$('tooltip').hidden=true;draw(); });
  function zoom(factor,x=width/2,y=height/2) {
    const next = Math.max(.04,Math.min(6,scale*factor)), ratio=next/scale;
    offsetX=x-(x-offsetX)*ratio;offsetY=y-(y-offsetY)*ratio;scale=next;touched=true;draw();
  }
  canvas.addEventListener('wheel',event => {event.preventDefault();const p=pointer(event);const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);zoom(Math.exp(Math.max(-1, Math.min(1, -delta * .0025))),p.x,p.y);},{passive:false});
  canvas.addEventListener('keydown',event => {
    if (event.key==='+' || event.key==='=') zoom(1.6);
    else if(event.key==='-') zoom(1 / 1.6);
    else if(event.key.toLowerCase()==='f') fit();
    else return; event.preventDefault();
  });
  $('zoom-in').onclick=()=>zoom(1.6);$('zoom-out').onclick=()=>zoom(1 / 1.6);$('fit').onclick=()=>{touched=true;fit();};
  $('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';$('pause').setAttribute('aria-label',paused?'Resume layout':'Pause layout');$('pause').title=paused?'Resume layout':'Pause layout';if(!paused)frame=0;};
  $('labels').onchange=draw;
  $('source').onchange=$('predicate').onchange=()=>{focus=null;rebuild();};
  $('search').addEventListener('input',()=>{renderSearch();draw();});
  $('search').addEventListener('keydown',event=>{if(event.key==='Enter')$('search-results').querySelector('button')?.click();});
  function reset() {
    $('source').value='';$('predicate').value='';$('search').value='';focus=null;selected=null;selectedEdge=null;
    document.querySelectorAll('.type-row input').forEach(input=>{input.checked=true;activeTypes.add(input.value);});rebuild();
  }
  $('reset').onclick=$('empty-reset').onclick=reset;
  for (const [id,checked] of [['all-types',true],['no-types',false]]) $(id).onclick=()=>{activeTypes.clear();document.querySelectorAll('.type-row input').forEach(input=>{input.checked=checked;if(checked)activeTypes.add(input.value);});focus=null;rebuild();};
  $('close-details').onclick=()=>{selected=null;selectedEdge=null;document.querySelector('.workspace').classList.add('inspector-closed');renderInspector();draw();};
  $('graph-tab').onclick=()=>setView(false);$('table-tab').onclick=()=>setView(true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){selected=null;selectedEdge=null;renderInspector();draw();}
    if(event.key==='/' && !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();$('search').focus();}
  });
  $('import').onclick=()=>$('file-input').click();
  $('file-input').onchange=async event=>{
    const files=[...event.target.files];if(!files.length)return;
    $('import').disabled=true;
    try {
      if(files.reduce((sum,f)=>sum+f.size,0)>20*1024*1024)throw new Error('Please import at most 20 MB of relation files at a time.');
      const imported=(await Promise.all(files.map(async file=>file.name.toLowerCase().endsWith('.json') ? KG.parseJSON(await file.text(),file.name) : KG.parseCSV(await file.text(),file.name)))).flat();
      if(!imported.length)throw new Error('The selected files contain no relation rows.');
      if(KG.buildGraph(imported).nodes.length>3000)throw new Error('This viewer supports up to 3,000 entities per import. Please choose a smaller subset.');
      loadDataset(imported);$('restore').hidden=false;if($('dataset-label'))$('dataset-label').textContent='Imported collection';notify(`Loaded ${imported.length} rows from ${files.length} files. This import stays in your browser for this session.`);
    }catch(error){notify(error.message,true);}finally{$('import').disabled=false;event.target.value='';}
  };
  $('restore').onclick=()=>{loadDataset(initialRecords);$('restore').hidden=true;if($('dataset-label'))$('dataset-label').textContent='Research collection';};
  $('export').onclick=()=>{
    const visible=graph.edges.flatMap(e=>e.records);if(!visible.length){notify('There are no rows to export in this view.');return;}
    const headers=[...KG.required,...new Set(visible.flatMap(r=>Object.keys(r)).filter(k=>!KG.required.includes(k)))];
    const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
    const csv='\uFEFF'+[headers,...visible.map(r=>headers.map(h=>r[h]))].map(row=>row.map(quote).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=element('a');link.href=url;link.download='knowledge-graph-view.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify(`Exported ${visible.length} evidence rows from the current filtered view.`);
  };
  new ResizeObserver(resize).observe($('canvas-wrap'));
  resize();loadDataset(initialRecords);animate();
  if(!initialRecords.length)notify('No bundled data found. Import a JSON or CSV file, or run build_data.py to create data.js.',true);
})();
