# Low Temperature Plasma Knowledge Graph

This folder is a self-contained static viewer for `ALL_relations.json`. The included `data.js` bundles its 2,077 relations, so opening `index.html` loads the graph without a server or external JavaScript service. The 31 source documents and their evidence, confidence, and block indices remain available in the inspector.

## Open the viewer

Open `index.html` in a browser, or serve this folder:

```bash
python -m http.server 8000 --directory ontology/kg_viewer2
```

Then visit http://localhost:8000. The graph has 2,151 entities and 2,034 unique directed relations. Search for an entity, filter by source document, relation, or entity type, or use the Triples table. Select a node or edge to inspect its evidence. Export view downloads the filtered evidence rows as CSV.

## Update the bundled relations

After editing `ALL_relations.json`, run:

```bash
python ontology/kg_viewer2/build_data.py
```

The builder validates that the input is an array of objects with nonempty `subject`, `subject_type`, `relation`, `object`, and `object_type` strings. It writes `data.js` in this folder and retains the other fields, including `source_file`, `confidence`, `evidence`, and `block_index`. The viewer groups identical directed triples while retaining every evidence row. Entity identity includes both its text and type.

To bundle a different JSON file without changing the source file, pass `--input /path/to/file.json`. You can also import a JSON relation array or CSV triples temporarily in the browser. Imports do not alter the bundled collection; Restore collection reloads `data.js`.

## Package and validate

```bash
python ontology/kg_viewer2/package_site.py
python -m unittest discover -s ontology/kg_viewer2/tests -p 'test_*.py'
node --test ontology/kg_viewer2/tests/core.test.cjs
```

The package script writes `kg_viewer2_site.zip` inside this folder. It contains the six website assets: `index.html`, `styles.css`, `app.js`, `ui.js`, `core.js`, and `data.js`. It does not include the source JSON. Browser checks can also be run with `python ontology/kg_viewer2/tests/browser_smoke.py` and `python ontology/kg_viewer2/tests/responsive_smoke.py` when Playwright and Chromium are installed.
