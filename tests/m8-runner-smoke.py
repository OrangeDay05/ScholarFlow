from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest
import uuid


RUNNER_PATH = Path(__file__).parents[1] / "scripts" / "m8-figure-runner.py"
SPEC = importlib.util.spec_from_file_location("m8_runner", RUNNER_PATH)
assert SPEC and SPEC.loader
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


def violin_code() -> str:
    return """from __future__ import annotations
import argparse
import json
from pathlib import Path
import random
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
random.seed(42)
np.random.seed(42)
parser = argparse.ArgumentParser()
parser.add_argument('--data', required=True)
parser.add_argument('--output-dir', required=True)
args = parser.parse_args()
data = json.loads(Path(args.data).read_text(encoding='utf-8'))
output_dir = Path(args.output_dir)
output_dir.mkdir(parents=True, exist_ok=True)
frame = pd.DataFrame(data)
fig, ax = plt.subplots(figsize=(5, 4))
groups = [group['score'].to_numpy() for _, group in frame.groupby('condition')]
ax.violinplot(groups, showmeans=True)
fig.savefig(output_dir / 'figure.png', dpi=150)
plt.close(fig)
"""


class RunnerSmokeTest(unittest.TestCase):
    def test_real_violin_png(self) -> None:
        rows = [{"condition": "A", "score": value} for value in (1, 2, 3, 4)] + [{"condition": "B", "score": value} for value in (2, 3, 5, 7)]
        result = RUNNER.execute({"runId": str(uuid.uuid4()), "code": violin_code(), "data": rows, "requiredColumns": ["condition", "score"], "timeoutSeconds": 30, "formats": ["png"]})
        self.assertEqual(result["status"], "succeeded", result)
        self.assertEqual(result["outputs"][0]["format"], "png")
        self.assertGreater(len(result["outputs"][0]["base64"]), 1000)

    def test_missing_column_is_clear(self) -> None:
        result = RUNNER.execute({"runId": str(uuid.uuid4()), "code": violin_code(), "data": [{"condition": "A"}], "requiredColumns": ["condition", "score"], "timeoutSeconds": 30, "formats": ["png"]})
        self.assertEqual(result["errorType"], "MISSING_DATA_COLUMNS")
        self.assertIn("score", result["errorMessage"])

    def test_dangerous_import_is_blocked(self) -> None:
        result = RUNNER.execute({"runId": str(uuid.uuid4()), "code": "import os\nos.remove('x')", "data": [{"x": 1}], "requiredColumns": ["x"], "timeoutSeconds": 30, "formats": ["png"]})
        self.assertEqual(result["errorType"], "CODE_POLICY_BLOCKED")

    def test_svg_safety_rejects_active_or_external_content(self) -> None:
        safe = b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
        self.assertTrue(RUNNER.valid_output("svg", safe))
        self.assertFalse(RUNNER.valid_output("svg", b'<svg><script>alert(1)</script></svg>'))
        self.assertFalse(RUNNER.valid_output("svg", b'<svg><image href="https://example.test/a.png"/></svg>'))

    def test_binary_format_signatures(self) -> None:
        self.assertTrue(RUNNER.valid_output("pdf", b"%PDF-1.7"))
        self.assertTrue(RUNNER.valid_output("tiff", b"II*\x00"))
        self.assertFalse(RUNNER.valid_output("pdf", b"not a pdf"))


if __name__ == "__main__":
    unittest.main()
