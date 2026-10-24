import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('build_data', Path(__file__).resolve().parents[1] / 'build_data.py')
build_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_data)


class BuildDataTest(unittest.TestCase):
    def test_preserves_relations_and_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder, 'ALL_relations.json')
            path.write_text(json.dumps([{
                'subject': ' α, β ', 'subject_type': 'Species', 'relation': ' has_property ',
                'object': 'temperature', 'object_type': 'PhysicalQuantity',
                'confidence': 0.95, 'evidence': 'measured temperature',
                'source_file': 'paper.txt', 'block_index': 0,
            }]), encoding='utf-8')
            rows = build_data.read_relations(path)
        self.assertEqual(rows[0]['subject_text'], 'α, β')
        self.assertEqual(rows[0]['predicate'], 'has_property')
        self.assertEqual(rows[0]['object_text'], 'temperature')
        self.assertEqual(rows[0]['source_file'], 'paper.txt')
        self.assertEqual(rows[0]['block_index'], 0)
        self.assertEqual(rows[0]['confidence'], 0.95)
        self.assertNotIn('subject', rows[0])

    def test_rejects_incomplete_relation(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder, 'broken.json')
            path.write_text(json.dumps([{'subject': 'a'}]), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'missing or empty fields'):
                build_data.read_relations(path)

    def test_rejects_non_array(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder, 'broken.json')
            path.write_text('{}', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'JSON array'):
                build_data.read_relations(path)


if __name__ == '__main__':
    unittest.main()
