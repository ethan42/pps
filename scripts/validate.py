#!/usr/bin/env python3
"""Validate the curriculum data against the JSON schemas and check cross-file integrity.

Usage:  python scripts/validate.py

Exit code is non-zero only on ERRORS (schema violations, duplicate codes,
referential-integrity breaks within the dataset). Dangling prerequisite
references to courses that are not yet present are reported as WARNINGS, so the
dataset can be built up incrementally without failing CI.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "schema"
DATA = ROOT / "data"


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def validate_against(validator: Draft202012Validator, obj: dict, label: str, errors: list[str]) -> None:
    for err in sorted(validator.iter_errors(obj), key=lambda e: e.path):
        loc = "/".join(str(p) for p in err.path) or "(root)"
        errors.append(f"{label}: {loc}: {err.message}")


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    course_validator = Draft202012Validator(load(SCHEMA / "course.schema.json"))
    program_validator = Draft202012Validator(load(SCHEMA / "program.schema.json"))
    conc_validator = Draft202012Validator(load(SCHEMA / "concentration.schema.json"))

    # --- program ---
    validate_against(program_validator, load(DATA / "program.json"), "program.json", errors)

    # --- concentrations ---
    concentrations: list[dict] = []
    conc_ids: set[str] = set()
    for path in sorted((DATA / "concentrations").glob("*.json")):
        conc = load(path)
        validate_against(conc_validator, conc, path.name, errors)
        if conc.get("id") in conc_ids:
            errors.append(f"{path.name}: duplicate concentration id {conc.get('id')}")
        conc_ids.add(conc.get("id"))
        concentrations.append(conc)

    # --- courses ---
    courses: dict[str, dict] = {}
    code_to_file: dict[str, str] = {}
    for path in sorted((DATA / "courses").glob("*.json")):
        course = load(path)
        validate_against(course_validator, course, path.name, errors)
        code = course.get("code")
        if code in code_to_file:
            errors.append(f"{path.name}: duplicate course code {code} (also in {code_to_file[code]})")
        else:
            code_to_file[code] = path.name
            courses[code] = course

    # --- referential integrity ---
    scheduled = ("core", "basic", "capstone", "standalone_lab", "elective")
    for code, course in courses.items():
        for prereq in course.get("prerequisites", []):
            if prereq["code"] not in courses:
                warnings.append(f"{code}: prerequisite {prereq['code']} not found in dataset")
        if course["category"] in scheduled:
            if not course.get("semester"):
                errors.append(f"{code}: category '{course['category']}' requires a semester")
            if "hours" not in course:
                errors.append(f"{code}: category '{course['category']}' requires hours")

    # --- concentration referential integrity ---
    for conc in concentrations:
        for key in ("basic_courses", "elective_courses"):
            for ccode in conc.get(key, []):
                if ccode not in courses:
                    errors.append(f"{conc.get('id')}: {key} references unknown course {ccode}")

    # --- report ---
    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(
        f"\nChecked {len(courses)} courses, {len(conc_ids)} concentrations: "
        f"{len(errors)} error(s), {len(warnings)} warning(s)."
    )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
