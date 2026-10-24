/* Shared, dependency-free data logic. Also loaded by Node's test runner. */
(function (root) {
  'use strict';
  const required = ['subject_text', 'subject_type', 'predicate', 'object_text', 'object_type'];
  const palette = ['#60a5fa','#34d399','#fb923c','#c084fc','#f472b6','#22d3ee','#facc15','#a3e635','#f87171','#818cf8','#2dd4bf','#e879f9','#fbbf24','#a8a29e','#93c5fd','#fda4af'];
  const knownTypes = ['PlasmaApplication','PlasmaSource','PlasmaTarget','PhysicalEffect','Species','PhysicalQuantity','Modelling','PlasmaMedium','Experiment','PlasmaProperties','DiagnosticDevice','ElectrodeConfiguration','ElectrodeMaterial','DischargeRegime','PowerSupply','Unit'];
  const typeColors = new Map(knownTypes.map((type, i) => [type, palette[i]]));
  function colorFor(type) {
    if (typeColors.has(type)) return typeColors.get(type);
    let hash = 2166136261;
    for (const char of type) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return `hsl(${(hash >>> 0) % 360} 70% 68%)`;
  }
  function parseCSV(text, filename) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], field = '', quoted = false, closed = false, line = 1;
    function finishRow() {
      row.push(field);
      if (row.some(value => value.trim())) rows.push({values: row, line});
      row = []; field = ''; closed = false;
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
        else { field += c; if (c === '\n') line++; }
      } else if (c === '"' && !field && !closed) quoted = true;
      else if (c === ',') { row.push(field); field = ''; closed = false; }
      else if (c === '\r' || c === '\n') { finishRow(); if (c === '\r' && text[i + 1] === '\n') i++; line++; }
      else if (closed || c === '"') throw new Error(`${filename}, line ${line}: invalid CSV quoting.`);
      else field += c;
    }
    if (quoted) throw new Error(`${filename}: unclosed quoted field.`);
    finishRow();
    const headers = (rows.shift()?.values || []).map(s => s.trim());
    const missing = required.filter(key => !headers.includes(key));
    if (missing.length) throw new Error(`${filename}: missing columns: ${missing.join(', ')}.`);
    if (new Set(headers).size !== headers.length) throw new Error(`${filename}: duplicate column names.`);
    return rows.map(({values, line}) => {
      if (values.length !== headers.length) throw new Error(`${filename}, line ${line}: incorrect column count.`);
      const record = Object.fromEntries(headers.map((key, i) => [key, values[i].trim()]));
      if (required.some(key => !record[key])) throw new Error(`${filename}, line ${line}: empty required field.`);
      return {...record, source_file: filename, source_row: line};
    });
  }
  function parseJSON(text, filename) {
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (error) { throw new Error(`${filename}: invalid JSON: ${error.message}`); }
    if (!Array.isArray(data)) throw new Error(`${filename}: expected a JSON array of relations.`);
    const fields = ['subject', 'subject_type', 'relation', 'object', 'object_type'];
    return data.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row) || fields.some(key => typeof row[key] !== 'string' || !row[key].trim()))
        throw new Error(`${filename}, relation ${index + 1}: missing or empty subject, subject_type, relation, object, or object_type.`);
      const record = Object.fromEntries(Object.entries(row).filter(([key]) => !['subject', 'relation', 'object'].includes(key)).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
      return {...record, subject_text: row.subject.trim(), predicate: row.relation.trim(), object_text: row.object.trim(), source_file: record.source_file || filename};
    });
  }
  const nodeId = (text, type) => JSON.stringify([text, type]);
  function buildGraph(records) {
    const nodes = new Map(), edges = new Map();
    for (const record of records) {
      for (const role of ['subject', 'object']) {
        const label = record[`${role}_text`], type = record[`${role}_type`], id = nodeId(label, type);
        if (!nodes.has(id)) nodes.set(id, {id, label, type, color: colorFor(type), degree: 0});
      }
      const source = nodeId(record.subject_text, record.subject_type), target = nodeId(record.object_text, record.object_type);
      const id = JSON.stringify([source, record.predicate, target]);
      if (!edges.has(id)) {
        edges.set(id, {id, source, target, predicate: record.predicate, records: []});
        nodes.get(source).degree++; nodes.get(target).degree++;
      }
      edges.get(id).records.push(record);
    }
    return {nodes: [...nodes.values()], edges: [...edges.values()]};
  }
  function filterRecords(records, {types, source = '', predicate = ''}) {
    return records.filter(r => (!source || r.source_file === source) && (!predicate || r.predicate === predicate) &&
      (!types || (types.has(r.subject_type) && types.has(r.object_type))));
  }
  const api = {required, colorFor, parseCSV, parseJSON, nodeId, buildGraph, filterRecords};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KG = api;
})(typeof window === 'undefined' ? globalThis : window);
