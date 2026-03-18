#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-.}"

if [[ ! -d "${TARGET_DIR}" ]]; then
  echo "error: target directory does not exist: ${TARGET_DIR}"
  exit 2
fi

python3 - "${TARGET_DIR}" <<'PY'
import pathlib
import re
import sys

target = pathlib.Path(sys.argv[1]).resolve()

allowed_ext = {
    ".swift", ".m", ".mm", ".h", ".hpp", ".c", ".cpp", ".cc",
    ".py", ".js", ".ts", ".tsx", ".java", ".kt", ".go", ".rs",
    ".cs", ".rb", ".php",
}
skip_dirs = {".git", "build", "DerivedData", "Pods", "node_modules"}

checks = [
    ("Check 1", "Han text joined to code token", re.compile(r"[\u4e00-\u9fff]{2,}[A-Za-z_][A-Za-z0-9_]*\(")),
    ("Check 2", "Duplicated adjacent Han phrase", re.compile(r"([\u4e00-\u9fff]{2,8})\1")),
    ("Check 3", "Suspicious Han phrase near call separator", re.compile(r"[:=,]\s*[\u4e00-\u9fff]{2,}\s*[A-Za-z_][A-Za-z0-9_]*\(")),
]

results = {name: [] for name, _, _ in checks}

for path in target.rglob("*"):
    if not path.is_file():
        continue
    if path.suffix.lower() not in allowed_ext:
        continue
    if any(part in skip_dirs for part in path.parts):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        continue
    lines = text.splitlines()
    for idx, line in enumerate(lines, start=1):
        for name, _, pattern in checks:
            if pattern.search(line):
                results[name].append((path, idx, line.strip()))

print(f"Scanning for suspicious dictation artifacts in: {target}")
status = 0
for name, desc, _ in checks:
    print(f"\n[{name}] {desc}")
    matches = results[name]
    if not matches:
        print("OK")
        continue
    status = 1
    for path, line_no, line in matches[:80]:
        rel = path.relative_to(target)
        print(f"{rel}:{line_no}: {line}")
    if len(matches) > 80:
        print(f"... and {len(matches) - 80} more")

print("\nNo obvious dictation artifacts found." if status == 0 else "\nPotential dictation artifacts found. Please review matches.")
sys.exit(status)
PY
