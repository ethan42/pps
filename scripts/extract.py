#!/usr/bin/env python3
"""Extract every course from the official PDF study guide into data/courses/*.json.

This is a one-time / re-runnable extraction helper. After running it, the JSON
under data/ is the source of truth; the PDF is only provenance.

Usage:
    python scripts/extract.py --dry-run   # parse and print a summary, write nothing
    python scripts/extract.py             # write data/courses/*.json

What it parses:
  * Course tables (pp. 76-83): compulsory, standalone_lab, direction_elective,
    project, general_education, optional. Specialization S1-S6 markers (Υ/Β) are
    read from their own table columns by header position.
  * Instructor schedule (winter pp. 88-89, spring pp. 92-93) -> instructors[].
  * Free-course lists (ΕΛ, pp. 90 & 94) -> category "free".
  * Thesis (ΠΕ) and internship (ΠΑ) are added from the prose description.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "ODIGOS_SPOYDWN_DIT_EKPA_2025-26.pdf"
COURSES_DIR = ROOT / "data" / "courses"

# --- Greek -> Latin transliteration for ASCII filenames (code stays Greek inside JSON) ---
TRANSLIT = {
    "Α": "A", "Β": "B", "Γ": "G", "Δ": "D", "Ε": "E", "Ζ": "Z", "Η": "I",
    "Θ": "TH", "Ι": "I", "Κ": "K", "Λ": "L", "Μ": "M", "Ν": "N", "Ξ": "X",
    "Ο": "O", "Π": "P", "Ρ": "R", "Σ": "S", "Τ": "T", "Υ": "Y", "Φ": "F",
    "Χ": "CH", "Ψ": "PS", "Ω": "O",
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e",
}


def translit(code: str) -> str:
    return "".join(TRANSLIT.get(ch, ch) for ch in code)


# Latin letters that the PDF sometimes substitutes for visually-identical Greek
# ones inside internal course codes (e.g. "K21" -> "Κ21"). Free-course codes from
# other departments legitimately use Latin (ECO, FIN, TEK) and are left untouched.
LATIN_TO_GREEK = str.maketrans({
    "A": "Α", "B": "Β", "E": "Ε", "H": "Η", "I": "Ι", "K": "Κ", "M": "Μ",
    "N": "Ν", "O": "Ο", "P": "Ρ", "T": "Τ", "X": "Χ", "Y": "Υ", "Z": "Ζ",
})


def canon_code(code: str) -> str:
    return clean(code).translate(LATIN_TO_GREEK)


CODE_RE = re.compile(r"^[A-Za-zΑ-Ωα-ω0-9]{2,12}$")
# A course code embedded in free text (prerequisites, schedule lines).
CODE_TOKEN = re.compile(r"[A-Za-zΑ-Ωα-ω]{1,3}\d{1,3}[α-ωΑ-Ω]?")


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


# --------------------------------------------------------------------------- #
# Course tables
# --------------------------------------------------------------------------- #
HEADING_RULES = [
    (re.compile(r"Κατ['’\s]*Επιλογή\s*Υποχρεωτικά"), "direction_elective"),
    (re.compile(r"Υποχρεωτικά\s*Μαθήματα"), "compulsory"),
    (re.compile(r"Αυτοτελή\s*Προαιρετικά\s*Εργαστήρια"), "standalone_lab"),
    (re.compile(r"^Project"), "project"),
    (re.compile(r"Μαθήματα\s*Γενικής\s*Παιδείας"), "general_education"),
    (re.compile(r"Προαιρετικά\s*Μαθήματα"), "optional"),
]


def page_lines(page):
    """Reconstruct text lines with their vertical position."""
    words = page.extract_words()
    lines: dict[int, list] = {}
    for w in words:
        key = round(w["top"] / 3)
        lines.setdefault(key, []).append(w)
    out = []
    for key in sorted(lines):
        ws = sorted(lines[key], key=lambda w: w["x0"])
        text = clean(" ".join(w["text"] for w in ws))
        top = min(w["top"] for w in ws)
        out.append((top, text))
    return out


def heading_for(text: str):
    for rx, cat in HEADING_RULES:
        if rx.search(text):
            return cat
    return None


CODE_RIGHT = 110  # x-center below this is the code column; above starts the title


def center(w):
    return (w["x0"] + w["x1"]) / 2


def table_anchors(header_words):
    """Locate semantic column x-centers from a table's header-row words."""
    a = {}
    for w in header_words:
        t = w["text"]
        if t == "Κωδ.":
            a["code"] = center(w)
        elif t == "Θ":
            a["theta"] = (center(w), w["x0"])
        elif t == "Φ":
            a["phi"] = center(w)
        elif "Κατεύθ" in t:
            a["katef"] = center(w)
        elif "πρ" in t and "να" in t:
            a["prer"] = center(w)
        elif t == "Εξ.":
            a["sem"] = center(w)
    # lab Ε (Greek epsilon), to the right of Φ
    eps = [w for w in header_words if w["text"][:1] == "Ε" and "ξ" not in w["text"]
           and center(w) > a.get("phi", 0)]
    if eps:
        a["eps"] = center(min(eps, key=center))
    # ECTS: Latin 'ECTS' word, else mean of Latin E/C/T/S right of eps
    ects = [w for w in header_words if w["text"] == "ECTS"]
    if ects:
        a["ects"] = center(ects[0])
    else:
        latin = [w for w in header_words if w["text"] in ("E", "C", "T", "S")
                 and center(w) > a.get("eps", 0) and center(w) < a.get("prer", 9999)]
        if latin:
            a["ects"] = sum(center(w) for w in latin) / len(latin)
    # S1..S6: the six rightmost 'S' header words (a stray 'S' from the ECTS
    # header text can appear further left and must be excluded).
    s_words = sorted((w for w in header_words if w["text"] == "S"), key=center)[-6:]
    a["s"] = {i + 1: center(w) for i, w in enumerate(s_words)}
    return a


def column_for(cx, a):
    """Bucket an x-center into a non-title/non-code column via midpoint intervals."""
    cols = [(a[k], k) for k in ("theta", "phi", "eps", "ects", "prer", "sem", "katef") if k in a]
    cols += [(x, f"S{n}") for n, x in a["s"].items()]
    cols.sort()
    best, bestd = None, 1e9
    for x, name in cols:
        d = abs(cx - x)
        if d < bestd:
            best, bestd = name, d
    return best


def parse_int(s: str, default=0):
    s = clean(s)
    return int(s) if s.isdigit() else default


def parse_ects(s: str):
    s = clean(s).replace(",", ".")
    m = re.search(r"\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


def parse_semesters(parts: list[str]):
    sems = set()
    for p in parts:
        for d in re.findall(r"[1-8]", p):
            sems.add(int(d))
    return sorted(sems)


def marker_role(*cells):
    for c in cells:
        c = clean(c)
        if c in ("Y", "Υ"):
            return "mandatory"
        if c in ("Β", "B"):
            return "basic"
    return None


def split_two(centers):
    """Split integer x-centers (lab Ε + ECTS columns) by their largest gap."""
    cs = sorted(centers)
    if not cs:
        return None, None
    gaps = [(cs[i + 1] - cs[i], i) for i in range(len(cs) - 1)]
    if not gaps or max(gaps)[0] < 12:
        return None, sum(cs) / len(cs)  # single column => ECTS only
    _, i = max(gaps)
    left, right = cs[: i + 1], cs[i + 1:]
    return sum(left) / len(left), sum(right) / len(right)


def assign_rows(page, table):
    """Bucket each word into exactly one table row by its vertical centre."""
    x0, top, x1, bottom = table.bbox
    # extend right edge so the rightmost S6 marker column is not clipped
    crop = (x0, top, min(page.width, x1 + 25), bottom)
    words = page.crop(crop).extract_words()
    boxes = [r.bbox for r in table.rows]
    buckets = [[] for _ in boxes]
    for w in words:
        ymid = (w["top"] + w["bottom"]) / 2
        for i, (_, top, _, bot) in enumerate(boxes):
            if top - 0.5 <= ymid <= bot + 0.5:
                buckets[i].append(w)
                break
    # reading order: top-to-bottom (sub-lines within a multi-line cell), then left-to-right
    return [sorted(b, key=lambda w: (round(w["top"] / 3), w["x0"])) for b in buckets]


def word_font(pchars, w):
    """Dominant font name of the characters making up a word."""
    for c in pchars:
        if c["text"].strip() and abs(c["top"] - w["top"]) < 3 and w["x0"] - 0.5 <= c["x0"] <= w["x1"] + 0.5:
            return c["fontname"]
    return ""


def prereq_type(font):
    # PDF legend (p.76): bold black = compulsory ("required"); italic blue = recommended.
    return "recommended" if "Italic" in font else "required"


def parse_table(page, table, category):
    rows = assign_rows(page, table)
    pchars = page.chars
    hdr_i = next((i for i, r in enumerate(rows) if any(w["text"] == "Κωδ." for w in r)), None)
    if hdr_i is None:
        return []
    a = table_anchors(rows[hdr_i])
    if "code" not in a or "theta" not in a:
        return []
    theta_x0 = a["theta"][1]
    a["theta"] = a["theta"][0]

    # Derive lab(Ε) and ECTS column centres from data integers between Φ and πρ/να
    # (their headers collide in the squeezed elective/project tables).
    phi_c, prer_c = a.get("phi", 0), a.get("prer", 1e9)
    nums = []
    for r in rows[hdr_i + 1:]:
        if not any(center(w) < CODE_RIGHT and CODE_RE.match(w["text"]) for w in r):
            continue
        for w in r:
            if re.fullmatch(r"\d", w["text"]) and phi_c < center(w) < prer_c:
                nums.append(center(w))
    eps_c, ects_c = split_two(nums)
    a.pop("eps", None)
    a.pop("ects", None)
    if eps_c is not None:
        a["eps"] = eps_c
    if ects_c is not None:
        a["ects"] = ects_c

    courses = []
    cur = None

    def flush():
        nonlocal cur
        if cur:
            courses.append(cur)
        cur = None

    for row in rows[hdr_i + 1:]:
        code_w = [w for w in row if center(w) < CODE_RIGHT and CODE_RE.match(w["text"])]
        is_new = bool(code_w)

        if is_new:
            flush()
            cur = {
                "code": code_w[0]["text"],
                "category": category,
                "title_parts": [],
                "hours": {"theory": 0, "tutorial": 0, "lab": 0},
                "ects": None,
                "prereq_parts": [],
                "sem_parts": [],
                "direction": None,
                "spec": {},
            }

        if cur is None:
            continue

        for w in row:
            cx = center(w)
            txt = w["text"]
            if cx < CODE_RIGHT:
                continue  # the code itself
            if cx >= CODE_RIGHT and w["x1"] <= theta_x0 - 2:
                cur["title_parts"].append(txt)
                continue
            col = column_for(cx, a)
            if col == "theta" and is_new:
                cur["hours"]["theory"] = parse_int(txt)
            elif col == "phi" and is_new:
                cur["hours"]["tutorial"] = parse_int(txt)
            elif col == "eps" and is_new:
                cur["hours"]["lab"] = parse_int(txt)
            elif col == "ects" and is_new:
                cur["ects"] = parse_ects(txt)
            elif col == "prer":
                cur["prereq_parts"].append((txt, prereq_type(word_font(pchars, w))))
            elif col == "sem":
                cur["sem_parts"].append(txt)
            elif col == "katef":
                if txt in ("CS", "CET"):
                    cur["direction"] = txt
            elif col and col.startswith("S"):
                role = marker_role(txt)
                if role and col not in cur["spec"]:
                    cur["spec"][col] = role

    flush()
    return courses


def finalize(raw):
    title = clean(" ".join(raw["title_parts"]))
    # strip a footnote superscript glued to the end of the title (e.g. "...Σήματος1")
    title = re.sub(r"(?<=[Α-Ωα-ω])\d+$", "", title)
    offered = True
    if "(ΔΠ)" in title:
        offered = False
        title = clean(title.replace("(ΔΠ)", ""))

    seen = {}
    for text, ptype in raw["prereq_parts"]:
        for m in CODE_TOKEN.findall(text):
            code = canon_code(m)
            if code not in seen:
                seen[code] = ptype
    prerequisites = [{"code": c, "type": t} for c, t in seen.items()]

    course = {
        "code": canon_code(raw["code"]),
        "title": {"el": title},
        "category": raw["category"],
        "hours": raw["hours"],
        "ects": raw["ects"],
        "semester": parse_semesters(raw["sem_parts"]),
    }
    course["direction"] = raw["direction"] if raw["direction"] in ("CS", "CET") else None
    if prerequisites:
        course["prerequisites"] = prerequisites
    if raw["spec"]:
        course["specialization_roles"] = raw["spec"]
    if not offered:
        course["offered_this_year"] = False
    return course


def extract_table_courses(pdf):
    courses = []
    category = None
    for pg in range(75, 83):  # pages 76-83
        page = pdf.pages[pg]
        lines = page_lines(page)
        tables = page.find_tables()
        # events sorted by vertical position: headings and tables
        events = []
        for top, text in lines:
            cat = heading_for(text)
            if cat:
                events.append((top, "heading", cat))
        for t in tables:
            events.append((t.bbox[1], "table", t))
        events.sort(key=lambda e: e[0])
        for _, kind, payload in events:
            if kind == "heading":
                category = payload
            elif kind == "table" and category:
                for raw in parse_table(page, payload, category):
                    courses.append(finalize(raw))
    return courses


# --------------------------------------------------------------------------- #
# Instructors (per-semester schedule)
# --------------------------------------------------------------------------- #
def extract_instructors(pdf):
    instr: dict[str, list[str]] = {}
    for pg in [87, 88, 90, 91, 92]:  # winter (pp.88-89) + spring (pp.91-93), 0-based
        page = pdf.pages[pg]
        pending = None
        for _, text in page_lines(page):
            m = re.match(r"^([A-Za-zΑ-Ωα-ω]{1,3}\d{1,3}[α-ωΑ-Ω]?)\s+(.*)$", text)
            if m and "ΕΞΑΜΗΝΟ" not in text:
                code, rest = m.group(1), m.group(2)
                names = split_instructors(rest)
                instr.setdefault(code, [])
                for n in names:
                    if n not in instr[code]:
                        instr[code].append(n)
                pending = code
            elif pending and ("," in text or re.search(r"[Α-Ω]\.", text)):
                # wrapped instructor continuation line
                for n in split_instructors(text):
                    if n and n not in instr[pending]:
                        instr[pending].append(n)
            else:
                pending = None
    return instr


def split_instructors(rest: str):
    # text after the last dash is the instructor list
    parts = re.split(r"\s[-–]\s", rest)
    if len(parts) < 2:
        return []
    names = parts[-1]
    out = []
    for n in re.split(r",|\band\b", names):
        n = clean(n)
        if n and not n.isdigit():
            out.append(n)
    return out


# --------------------------------------------------------------------------- #
# Free courses (ΕΛ)
# --------------------------------------------------------------------------- #
def extract_free_courses(pdf):
    courses = []
    specs = {90: "winter", 94: "spring"}  # page numbers (1-based)
    for pg1, term in specs.items():
        page = pdf.pages[pg1 - 1]
        department = None
        for _, text in page_lines(page):
            if text.startswith("ΤΜΗΜΑ ") or text.startswith("ΣΧΟΛΗ "):
                department = clean(text)
                continue
            m = re.match(
                r"^([A-Za-zΑ-Ωα-ω0-9]{2,10})\s+(.*?)\s*\(([\d.,]+)\s*ECTS\)\s*[-–]?\s*(.*)$",
                text,
            )
            if m:
                code, title, ects, names = m.groups()
                course = {
                    "code": code,
                    "title": {"el": clean(title)},
                    "category": "free",
                    "term": term,
                    "ects": parse_ects(ects),
                }
                if department:
                    course["department"] = {"el": department}
                names = [clean(n) for n in re.split(r",", names) if clean(n)]
                if names:
                    course["instructors"] = names
                courses.append(course)
    return courses


# --------------------------------------------------------------------------- #
# Thesis & internship (from prose, not a table)
# --------------------------------------------------------------------------- #
def manual_courses():
    def make(code, el, en, category):
        return {
            "code": code,
            "title": {"el": el, "en": en},
            "category": category,
            "hours": {"theory": 0, "tutorial": 0, "lab": 0},
            "ects": 8,
            "semester": [7, 8],
            "direction": None,
            "notes": "Annual course described in prose (guide p. 83); code assigned for this dataset.",
        }

    return [
        make("ΠΕ1", "Πτυχιακή Εργασία Ι", "Thesis I", "thesis"),
        make("ΠΕ2", "Πτυχιακή Εργασία ΙΙ", "Thesis II", "thesis"),
        make("ΠΑ1", "Πρακτική Άσκηση Ι", "Internship I", "internship"),
        make("ΠΑ2", "Πρακτική Άσκηση ΙΙ", "Internship II", "internship"),
    ]


# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with pdfplumber.open(PDF) as pdf:
        courses = extract_table_courses(pdf)
        instructors = extract_instructors(pdf)
        free = extract_free_courses(pdf)

    # merge instructors
    for c in courses:
        names = instructors.get(c["code"])
        if names:
            c["instructors"] = names

    all_courses = courses + free + manual_courses()

    # de-dupe by code (keep first)
    by_code = {}
    for c in all_courses:
        by_code.setdefault(c["code"], c)
    all_courses = list(by_code.values())

    by_cat: dict[str, int] = {}
    for c in all_courses:
        by_cat[c["category"]] = by_cat.get(c["category"], 0) + 1

    print(f"Parsed {len(all_courses)} courses:")
    for cat in sorted(by_cat):
        print(f"  {cat:20s} {by_cat[cat]}")

    if args.dry_run:
        for c in sorted(all_courses, key=lambda c: (c["category"], c["code"])):
            sr = c.get("specialization_roles", {})
            sr_s = " ".join(f"{k}:{v[0]}" for k, v in sr.items())
            print(
                f"  {c['code']:7s} {c['category'][:5]:5s} ects={c.get('ects')} "
                f"sem={c.get('semester','-')} dir={c.get('direction')} "
                f"{sr_s:18s} {c['title']['el'][:42]}"
            )
        return

    # write files
    COURSES_DIR.mkdir(parents=True, exist_ok=True)
    for old in COURSES_DIR.glob("*.json"):
        old.unlink()
    for c in all_courses:
        fname = translit(c["code"]) + ".json"
        with (COURSES_DIR / fname).open("w", encoding="utf-8") as fh:
            json.dump(c, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
    print(f"\nWrote {len(all_courses)} files to {COURSES_DIR.relative_to(ROOT)}/")


if __name__ == "__main__":
    sys.exit(main())
