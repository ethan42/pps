# DIT@EKPA Undergraduate Curriculum

Structured, schema-validated representation of the undergraduate curriculum of the
Department of Informatics and Telecommunications, National and Kapodistrian
University of Athens (EKPA). This branch tracks the **2026 redesign proposal**
(`PPS-26-6-2026.pdf`); the repo turns it into machine-readable data so it can be
consumed by tools, drive UIs, and — crucially for the redesign — be **reviewed
change-by-change through Git** by every stakeholder.

> The previous, in-force curriculum (`ODIGOS_SPOYDWN_DIT_EKPA_2025-26.pdf`) is kept
> in the repo for reference. See `git log` / the PR description for the diff between
> the in-force programme and this proposal.

## What's new in the 2026 proposal

The programme is restructured from two **directions** (CS / CET) with six
specializations into a **single 240-ECTS programme** built around:

- **21 Core courses** (Μαθήματα Κορμού) — 138 ECTS, taken by everyone. Includes a
  new AI spine: ΚΤΝ1 *Intro to AI*, ΚΤΝ2 *Machine Learning*, ΚΤΝ3 *Deep Learning*.
- **7 Basic courses** chosen from 16 (Βασικά Μαθήματα) — 42 ECTS.
- **1 Capstone Project** (Συνθετική Εργασία, ΣΕ1–ΣΕ5) chosen from 5 — 6 ECTS.
- **Thesis _or_ Internship** — 12 ECTS, mutually exclusive.
- **≥ 1 of 5 Concentrations** (Ειδικεύσεις): Foundations of CS & ML; Software &
  Systems Security; Systems, Architecture & Hardware; Intelligent Communications &
  Networks; Artificial Intelligence. A concentration is claimed by passing all 4 of
  its basic courses plus any 3 of its electives.
- Plus enough additional **electives** (Μαθήματα Επιλογής) to reach 240 ECTS.

The CS/CET direction split and the old "free elective" / "general education"
buckets are removed.

## Layout

```
schema/                     JSON Schema (Draft 2020-12), one per entity type
  course.schema.json
  program.schema.json
  concentration.schema.json
data/                       Source of truth — hand-editable JSON
  program.json              Academic year, institution, graduation rules
  concentrations/C1..C5.json
  courses/<CODE>.json       One file per course → clean, line-level diffs
scripts/
  validate.py               Schema validation + cross-file referential integrity
  build.py                  Bundle data/ → dist/curriculum.json
dist/
  curriculum.json           Generated single-file bundle for consumers
site/                       Static dashboard (Curriculum Atlas) — reads the bundle
  index.html  styles.css  app.js
.github/workflows/
  validate.yml              CI: validate on every push / PR
  deploy-site.yml           Build + deploy the dashboard to GitHub Pages
```

## Website (Curriculum Atlas)

`site/` is a dependency-free static dashboard that visualises the whole
curriculum from `dist/curriculum.json`: headline figures (ECTS to graduate, core /
basic / elective counts, concentrations, prerequisite links), charts (category mix,
course load per semester, concentration depth, teaching-hours mix), an interactive
**prerequisite-flow graph** (courses laid out by semester; hover to trace a chain),
and a searchable/filterable course explorer with a detail drawer. Bilingual (EL/EN)
toggle.

**Deploy:** the `deploy-site.yml` workflow validates the data, rebuilds the bundle,
and publishes to GitHub Pages on every push to `main`. One-time setup: repo
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

**Preview locally:** serve the repo root and open the site —

```bash
python -m http.server 8000      # then visit http://localhost:8000/site/
```

(The page loads `./curriculum.json` when deployed, falling back to
`../dist/curriculum.json` for local preview, so no copy step is needed.)

## Usage

```bash
# one-time
python -m venv venv && ./venv/bin/pip install jsonschema

./venv/bin/python scripts/validate.py   # check schemas + integrity (exits non-zero on errors)
./venv/bin/python scripts/build.py       # regenerate dist/curriculum.json
```

## Data model

- **program** — academic year, institution, department, degree title, and the
  structured **graduation rules**: `total_ects` (240), `core` / `basic` / `capstone`
  requirement buckets (`choose` of `offered`, worth `ects`),
  `thesis_or_internship_ects`, and `concentrations` (`required` of `offered`).
- **concentration** — `C1`–`C5`, each with a bilingual `name`, exactly four
  `basic_courses` (all required) and an `elective_courses` pool, plus the `award`
  rule (4 basic + 3 elective).
- **course** — `code`, bilingual `title`, `category`
  (`core` / `basic` / `capstone` / `standalone_lab` / `elective` / `thesis` /
  `internship`), weekly `hours` (theory/tutorial/lab), `ects`, `semester`,
  `prerequisites`, `offered_this_year`, `instructors`.

Course `code` is the natural key; prerequisites and concentration membership
reference it. `validate.py` enforces uniqueness and referential integrity beyond
what JSON Schema alone can express (every prerequisite and every concentration
course code must resolve to a known course).

## Provenance

The 2026 course tables (core, basic, capstone, electives) and the five concentration
definitions were transcribed from `PPS-26-6-2026.pdf` via positional table
extraction (`pdfplumber`). Codes are canonicalised to Greek (e.g. `K17` → `Κ17`),
while filenames use an ASCII transliteration (`Κ17` → `K17.json`, `ΚΤΝ1` →
`KTN1.json`, `ΣΕ1` → `SE1.json`) for clean cross-platform diffs. As a sanity check,
the 21 core courses sum to exactly **138 ECTS**, matching the proposal.

## Status

All **88 courses** are present and validated (0 errors, 0 warnings):
21 core, 16 basic, 5 capstone, 3 standalone labs, 41 electives, 1 thesis,
1 internship — and 5 concentrations.

### Known caveats (worth a visual pass against the PDF)

- **Prerequisites** are taken from the PPS "Προαπ." column and recorded as
  `required`; the proposal does not distinguish required vs recommended.
- **Instructors** and full per-course descriptions (content, learning outcomes,
  assessment, bibliography) are **not** in the proposal document; capture later via
  `instructors` / `description_url` if needed.
- **Κ12** "Σύγχρονη Φυσική" carries a provisional title (name to be finalised by the
  Physics sector). **ΕΘ** "Ειδικά Θέματα" is 4–6 ECTS depending on the topic
  (recorded as 6).
- **Thesis (ΠΕ)** and **Internship (ΠΑ)** codes are assigned by this dataset — the
  proposal describes them in prose without codes.
