#!/usr/bin/env python3
"""Bundle the per-file curriculum data into a single dist/curriculum.json.

Usage:  python scripts/build.py

Consumers (UIs, scripts) can load the single bundle instead of walking the
data/ tree. The per-file layout under data/ remains the source of truth.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DIST = ROOT / "dist"


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def main() -> None:
    bundle = {
        "program": load(DATA / "program.json"),
        "concentrations": [load(p) for p in sorted((DATA / "concentrations").glob("*.json"))],
        "courses": [load(p) for p in sorted((DATA / "courses").glob("*.json"))],
    }
    DIST.mkdir(exist_ok=True)
    out = DIST / "curriculum.json"
    with out.open("w", encoding="utf-8") as fh:
        json.dump(bundle, fh, ensure_ascii=False, indent=2, sort_keys=False)
        fh.write("\n")
    print(
        f"Wrote {out.relative_to(ROOT)}: "
        f"{len(bundle['courses'])} courses, {len(bundle['concentrations'])} concentrations."
    )


if __name__ == "__main__":
    main()
