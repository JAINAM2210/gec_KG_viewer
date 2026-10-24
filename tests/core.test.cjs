const test = require('node:test');
const assert = require('node:assert/strict');
const KG = require('../core.js');
const header = KG.required.join(',');

test('CSV handles BOM, CRLF, quoted commas, quotes, and multiline fields', () => {
  const rows = KG.parseCSV('\uFEFF' + header + ',confidence_score\r\n"argon, gas",Medium,has,"a ""quoted""\nvalue",Quantity,0.9\r\n', 'paper.csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject_text, 'argon, gas');
  assert.equal(rows[0].object_text, 'a "quoted"\nvalue');
  assert.equal(rows[0].confidence_score, '0.9');
  assert.equal(rows[0].source_row, 3);
});

test('CSV rejects malformed input instead of dropping relations', () => {
  for (const input of ['subject_text\na', header + '\na,A,p,b', header + '\na,A,p,,B', header + '\n"a,A,p,b,B', header + '\n"a"extra,A,p,b,B', header + ',predicate\na,A,p,b,B,q']) {
    assert.throws(() => KG.parseCSV(input, 'broken.csv'), /broken.csv/);
  }
});

test('JSON maps new relations and retains paper evidence', () => {
  const input = [{subject:'argon',subject_type:'PlasmaMedium',relation:'has_property',object:'temperature',object_type:'PhysicalQuantity',confidence:0.95,evidence:'measured',source_file:'paper.txt',block_index:0}];
  const rows = KG.parseJSON(JSON.stringify(input), 'ALL_relations.json');
  assert.equal(rows[0].subject_text, 'argon');
  assert.equal(rows[0].predicate, 'has_property');
  assert.equal(rows[0].object_text, 'temperature');
  assert.equal(rows[0].source_file, 'paper.txt');
  assert.equal(rows[0].block_index, 0);
  assert.equal(rows[0].confidence, 0.95);
  assert.equal(KG.buildGraph(rows).edges.length, 1);
  assert.throws(() => KG.parseJSON('[{"subject":"argon"}]', 'bad.json'), /bad.json, relation 1/);
});

test('identity includes type; duplicates retain provenance; reverse edges and loops survive', () => {
  const rows = KG.parseCSV(header + '\na,A,p,b,B\na,A,p,b,B\nb,B,p,a,A\na,B,p,a,A\na,A,p,a,A', 'paper.csv');
  const graph = KG.buildGraph(rows);
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 4);
  assert.equal(graph.edges[0].records.length, 2);
  assert.notEqual(KG.nodeId('a','A'), KG.nodeId('a','B'));
  assert.notEqual(KG.nodeId('a|b','c'), KG.nodeId('a','b|c'));
});

test('type colors are independent of role, data order, and active filters', () => {
  const rows = KG.parseCSV(header + '\na,PlasmaSource,p,b,PlasmaSource\nb,PlasmaSource,p,c,PlasmaMedium', 'paper.csv');
  const first = KG.buildGraph(rows), second = KG.buildGraph(rows.slice().reverse());
  for (const node of first.nodes) assert.equal(node.color, second.nodes.find(n => n.id === node.id).color);
  assert.equal(first.nodes[0].color, first.nodes[1].color);
  assert.notEqual(first.nodes[0].color, first.nodes[2].color);
  assert.equal(KG.colorFor('New Type'), KG.colorFor('New Type'));
});

test('filters apply to both endpoints and preserve each matching evidence row', () => {
  const rows = [...KG.parseCSV(header + '\na,A,p,b,B\na,A,q,c,C','one.csv'), ...KG.parseCSV(header + '\na,A,p,b,B','two.csv')];
  assert.equal(KG.filterRecords(rows,{types:new Set(['A','B'])}).length,2);
  assert.equal(KG.filterRecords(rows,{types:new Set()}).length,0);
  assert.equal(KG.filterRecords(rows,{source:'two.csv',predicate:'p'}).length,1);
  assert.equal(KG.filterRecords(rows,{source:'two.csv',predicate:'q'}).length,0);
});
