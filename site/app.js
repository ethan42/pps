/* DIT @ EKPA — Curriculum Atlas
   Renders dashboards from the prebuilt dist/curriculum.json bundle. */

const CATEGORY = {
  compulsory:         { el: "Υποχρεωτικά",            en: "Compulsory",          color: "#7c8cff" },
  standalone_lab:     { el: "Προαιρ. Εργαστήρια",     en: "Standalone Labs",     color: "#38bdf8" },
  direction_elective: { el: "Κατ’ επιλογή υποχρ.",    en: "Direction Electives", color: "#a78bfa" },
  project:            { el: "Project",                en: "Project",             color: "#ff6ad5" },
  general_education:  { el: "Γενικής Παιδείας",       en: "General Education",   color: "#43e7c9" },
  optional:           { el: "Προαιρετικά",            en: "Optional",            color: "#f5a524" },
  free:               { el: "Ελεύθερα",               en: "Free Electives",      color: "#94a3b8" },
  thesis:             { el: "Πτυχιακή Εργασία",       en: "Thesis",              color: "#4ade80" },
  internship:         { el: "Πρακτική Άσκηση",        en: "Internship",          color: "#a3e635" },
};
const SPEC_COLORS = ["#7c8cff", "#43e7c9", "#ff6ad5", "#f5a524", "#38bdf8", "#a3e635"];
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

let LANG = "el";
let DATA = null;
let GRAPH_CATS = new Set(["compulsory", "direction_elective", "project", "standalone_lab"]);
let GRAPH_LABEL = "code"; // "code" (default) | "name"
const charts = {};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const catLabel = (c) => (CATEGORY[c] ? CATEGORY[c][LANG] : c);
const catColor = (c) => (CATEGORY[c] ? CATEGORY[c].color : "#888");
const title = (course) => (course.title?.[LANG] || course.title?.el || course.code);

/* ------------------------------------------------------------------ load */
async function load() {
  for (const url of ["./curriculum.json", "../dist/curriculum.json"]) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.json();
    } catch (_) { /* try next */ }
  }
  throw new Error("curriculum.json not found");
}

(async function init() {
  try {
    DATA = await load();
  } catch (e) {
    document.querySelector("main").innerHTML =
      `<div class="loading">Could not load <code>curriculum.json</code>.<br>${e.message}</div>`;
    return;
  }
  Chart.defaults.color = "#9aa3bd";
  Chart.defaults.font.family = "Inter, sans-serif";
  Chart.defaults.borderColor = "rgba(255,255,255,0.06)";

  wireLang();
  wireDrawer();
  wireGraphLabel();
  renderAll();
  applyHash();
  addEventListener("hashchange", applyHash);
})();

// Deep-linking: #names switches the graph to full names; #course=CODE opens a course.
function applyHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has("names") && GRAPH_LABEL !== "name") {
    GRAPH_LABEL = "name";
    $$("#graphLabelToggle button").forEach((x) => x.classList.toggle("on", x.dataset.glabel === "name"));
    renderGraph();
  }
  if (h.get("course")) openDrawer(h.get("course"));
}

function renderAll() {
  renderHero();
  renderStats();
  renderCategoryChart();
  renderSemesterChart();
  renderSpecChart();
  renderHoursChart();
  renderDirectionSplit();
  renderGraphFilters();
  renderGraph();
  renderExplorerFilters();
  renderTable();
  renderTopInstructors();
  renderFooter();
}

/* ------------------------------------------------------------------ hero */
function renderHero() {
  const p = DATA.program;
  $("#yearBadge").textContent = p.academic_year.replace("-", "–");
  $("#deptTitle").textContent = p.department?.[LANG] || p.department?.el;
  $("#instTitle").textContent = `${p.institution?.[LANG] || p.institution?.el} · ${p.degree_title?.[LANG] || p.degree_title?.el}`;
  document.documentElement.lang = LANG;
  const dirs = (p.directions || []).map((d) => d.name?.[LANG] || d.name?.el).join(" · ");
  $("#heroMeta").innerHTML = [
    `<span class="chip"><b>${DATA.courses.length}</b> ${LANG === "el" ? "μαθήματα" : "courses"}</span>`,
    `<span class="chip"><b>8</b> ${LANG === "el" ? "εξάμηνα" : "semesters"}</span>`,
    `<span class="chip"><b>${p.directions.length}</b> ${LANG === "el" ? "κατευθύνσεις" : "directions"}: ${dirs}</span>`,
    `<span class="chip"><b>${DATA.specializations.length}</b> ${LANG === "el" ? "ειδικεύσεις" : "specializations"}</span>`,
  ].join("");
}

/* ------------------------------------------------------------------ stats */
function renderStats() {
  const c = DATA.courses;
  const dept = c.filter((x) => x.category !== "free");
  const sum = (arr) => arr.reduce((a, x) => a + (x.ects || 0), 0);
  const byCat = (cat) => c.filter((x) => x.category === cat);
  const offered = c.filter((x) => x.offered_this_year !== false).length;
  const instructors = new Set(c.flatMap((x) => x.instructors || [])).size;
  const withPre = c.filter((x) => (x.prerequisites || []).length).length;

  const cards = [
    { num: c.length, label: LANG === "el" ? "Μαθήματα συνολικά" : "Total courses", sub: `${byCat("free").length} ${LANG === "el" ? "ελεύθερα" : "free"}`, bar: "#7c8cff" },
    { num: Math.round(sum(dept)), label: LANG === "el" ? "ECTS στο πρόγραμμα" : "ECTS on offer", sub: LANG === "el" ? "εκτός ελευθέρων" : "excl. free electives", bar: "#43e7c9" },
    { num: byCat("compulsory").length, label: LANG === "el" ? "Υποχρεωτικά" : "Compulsory", sub: `${Math.round(sum(byCat("compulsory")))} ECTS`, bar: catColor("compulsory") },
    { num: byCat("optional").length, label: LANG === "el" ? "Προαιρετικά" : "Optional courses", sub: `${byCat("direction_elective").length} ${LANG === "el" ? "κατ’ επιλογή υποχρ." : "direction electives"}`, bar: catColor("optional") },
    { num: `${offered}`, label: LANG === "el" ? "Προσφέρονται φέτος" : "Offered this year", sub: `${c.length - offered} ${LANG === "el" ? "δεν προσφέρονται" : "not offered"}`, bar: "#a3e635" },
    { num: withPre, label: LANG === "el" ? "Με προαπαιτούμενα" : "With prerequisites", sub: `${c.flatMap((x) => x.prerequisites || []).length} ${LANG === "el" ? "σχέσεις" : "links"}`, bar: "#ff6ad5" },
    { num: instructors, label: LANG === "el" ? "Διδάσκοντες" : "Instructors", sub: LANG === "el" ? "στο ωρολόγιο πρόγραμμα" : "in the schedule", bar: "#38bdf8" },
    { num: DATA.specializations.length, label: LANG === "el" ? "Ειδικεύσεις" : "Specializations", sub: LANG === "el" ? "σε 2 κατευθύνσεις" : "across 2 directions", bar: "#a78bfa" },
  ];
  $("#statCards").innerHTML = cards.map((c) =>
    `<div class="stat" style="--bar:${c.bar}"><div class="num">${c.num}</div><div class="label">${c.label}</div><div class="sub">${c.sub}</div></div>`
  ).join("");
}

/* --------------------------------------------------------- category chart */
function renderCategoryChart() {
  const counts = {};
  DATA.courses.forEach((c) => (counts[c.category] = (counts[c.category] || 0) + 1));
  const order = Object.keys(CATEGORY).filter((k) => counts[k]);
  $("#catSubtitle").textContent = `· ${DATA.courses.length} ${LANG === "el" ? "συνολικά" : "total"}`;

  charts.cat?.destroy();
  charts.cat = new Chart($("#categoryChart"), {
    type: "doughnut",
    data: {
      labels: order.map(catLabel),
      datasets: [{ data: order.map((k) => counts[k]), backgroundColor: order.map(catColor), borderWidth: 2, borderColor: "#0a0e1a", hoverOffset: 8 }],
    },
    options: { cutout: "62%", plugins: { legend: { display: false } }, animation: { animateScale: true } },
  });
  $("#categoryLegend").innerHTML = order.map((k) =>
    `<span class="item"><span class="dot" style="background:${catColor(k)}"></span>${catLabel(k)} · ${counts[k]}</span>`
  ).join("");
}

/* --------------------------------------------------------- semester chart */
function renderSemesterChart() {
  const cats = ["compulsory", "standalone_lab", "direction_elective", "project", "general_education", "optional"];
  const datasets = cats.map((cat) => ({
    label: catLabel(cat),
    backgroundColor: catColor(cat),
    data: Array.from({ length: 8 }, (_, i) =>
      DATA.courses.filter((c) => c.category === cat && (c.semester || []).includes(i + 1)).length),
    borderRadius: 4, borderSkipped: false,
  }));
  charts.sem?.destroy();
  charts.sem = new Chart($("#semesterChart"), {
    type: "bar",
    data: { labels: Array.from({ length: 8 }, (_, i) => `${i + 1}${LANG === "el" ? "ο" : ""}`), datasets },
    options: {
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 } } },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, padding: 12, font: { size: 11 } } } },
    },
  });
}

/* ----------------------------------------------------------- spec chart */
function renderSpecChart() {
  const specs = DATA.specializations;
  const mand = [], basic = [];
  specs.forEach((s) => {
    let m = 0, b = 0;
    DATA.courses.forEach((c) => {
      const r = c.specialization_roles?.[s.id];
      if (r === "mandatory") m++; else if (r === "basic") b++;
    });
    mand.push(m); basic.push(b);
  });
  charts.spec?.destroy();
  charts.spec = new Chart($("#specChart"), {
    type: "bar",
    data: {
      labels: specs.map((s) => s.id),
      datasets: [
        { label: LANG === "el" ? "Υποχρεωτικά (Υ)" : "Mandatory (Υ)", data: mand, backgroundColor: specs.map((_, i) => SPEC_COLORS[i]), borderRadius: 4 },
        { label: LANG === "el" ? "Βασικά (Β)" : "Basic (Β)", data: basic, backgroundColor: specs.map((_, i) => SPEC_COLORS[i] + "66"), borderRadius: 4 },
      ],
    },
    options: {
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 } } },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { title: (it) => specs[it[0].dataIndex].name?.[LANG] || specs[it[0].dataIndex].name?.el } },
      },
    },
  });
}

/* ----------------------------------------------------------- hours chart */
function renderHoursChart() {
  const t = { theory: 0, tutorial: 0, lab: 0 };
  DATA.courses.forEach((c) => { if (c.hours) { t.theory += c.hours.theory; t.tutorial += c.hours.tutorial; t.lab += c.hours.lab; } });
  charts.hours?.destroy();
  charts.hours = new Chart($("#hoursChart"), {
    type: "polarArea",
    data: {
      labels: [LANG === "el" ? "Θεωρία" : "Theory", LANG === "el" ? "Φροντιστήριο" : "Tutorial", LANG === "el" ? "Εργαστήριο" : "Lab"],
      datasets: [{ data: [t.theory, t.tutorial, t.lab], backgroundColor: ["#7c8cffcc", "#43e7c9cc", "#ff6ad5cc"], borderWidth: 0 }],
    },
    options: { scales: { r: { ticks: { display: false }, grid: { color: "rgba(255,255,255,0.06)" } } }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, padding: 12, font: { size: 11 } } } } },
  });
}

function renderDirectionSplit() {
  const dirs = DATA.program.directions;
  $("#directionSplit").innerHTML = dirs.map((d) => {
    const n = DATA.courses.filter((c) => c.direction === d.id).length;
    return `<div class="d"><div class="k">${d.name?.[LANG] || d.name?.el}</div><div class="v">${n}</div><div class="k">${LANG === "el" ? "μαθήματα κατεύθυνσης" : "direction courses"}</div></div>`;
  }).join("");
}

/* ----------------------------------------------------------- prereq graph */
function wireGraphLabel() {
  $$("#graphLabelToggle button").forEach((b) => b.onclick = () => {
    GRAPH_LABEL = b.dataset.glabel;
    $$("#graphLabelToggle button").forEach((x) => x.classList.toggle("on", x === b));
    renderGraph();
  });
}

// Greedily wrap a string into at most `maxLines` lines of ~`maxChars`, ellipsizing overflow.
function wrapLabel(text, maxChars, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines) {
    const used = lines.join(" ").split(/\s+/).length;
    if (used < words.length) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, "…");
  }
  return lines;
}

function renderGraphFilters() {
  const cats = ["compulsory", "direction_elective", "project", "standalone_lab", "optional", "general_education"];
  $("#graphFilters").innerHTML = cats.map((c) =>
    `<button data-gcat="${c}" class="${GRAPH_CATS.has(c) ? "on" : ""}" style="${GRAPH_CATS.has(c) ? `background:${catColor(c)};border-color:${catColor(c)}` : ""}">${catLabel(c)}</button>`
  ).join("");
  $$("#graphFilters button").forEach((b) => b.onclick = () => {
    const c = b.dataset.gcat;
    GRAPH_CATS.has(c) ? GRAPH_CATS.delete(c) : GRAPH_CATS.add(c);
    renderGraphFilters(); renderGraph();
  });
}

function renderGraph() {
  const byCode = new Map(DATA.courses.map((c) => [c.code, c]));
  // node set: courses in selected categories with a semester, that participate in a prereq link
  const inScope = (c) => c && GRAPH_CATS.has(c.category) && (c.semester || []).length;
  const linked = new Set();
  DATA.courses.forEach((c) => {
    if (!inScope(c)) return;
    (c.prerequisites || []).forEach((p) => {
      if (inScope(byCode.get(p.code))) { linked.add(c.code); linked.add(p.code); }
    });
  });
  const nodes = DATA.courses.filter((c) => linked.has(c.code) && inScope(c));
  const sem = (c) => Math.min(...c.semester);

  // layout: columns by semester — sizing depends on label mode
  const named = GRAPH_LABEL === "name";
  const COLW = named ? 182 : 132, NODEW = named ? 162 : 96,
        NODEH = named ? 38 : 26, GAPY = named ? 11 : 12, PADTOP = 40, PADX = 18;
  const cols = {};
  nodes.forEach((c) => (cols[sem(c)] ||= []).push(c));
  Object.values(cols).forEach((list) => list.sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code)));
  const maxCol = Math.max(1, ...Object.values(cols).map((l) => l.length));
  const W = PADX * 2 + 8 * COLW, H = PADTOP + maxCol * (NODEH + GAPY) + 20;
  const pos = {};
  for (let s = 1; s <= 8; s++) {
    (cols[s] || []).forEach((c, i) => {
      pos[c.code] = { x: PADX + (s - 1) * COLW + (COLW - NODEW) / 2, y: PADTOP + i * (NODEH + GAPY) };
    });
  }

  const svg = d3.select("#prereqGraph").attr("width", W).attr("height", H);
  svg.selectAll("*").remove();

  // semester column guides
  for (let s = 1; s <= 8; s++) {
    svg.append("rect").attr("class", "sem-col").attr("x", PADX + (s - 1) * COLW + 4).attr("y", PADTOP - 8)
      .attr("width", COLW - 8).attr("height", H - PADTOP).attr("rx", 10);
    svg.append("text").attr("class", "sem-label").attr("x", PADX + (s - 1) * COLW + COLW / 2).attr("y", 22)
      .text(`${LANG === "el" ? "Εξ." : "Sem"} ${ROMAN[s]}`);
  }

  // links
  const linkData = [];
  nodes.forEach((c) => (c.prerequisites || []).forEach((p) => {
    if (pos[p.code] && pos[c.code]) linkData.push({ source: p.code, target: c.code, type: p.type });
  }));
  const linkSel = svg.append("g").selectAll("path").data(linkData).join("path")
    .attr("class", "link")
    .attr("stroke", (d) => d.type === "recommended" ? "#43e7c9" : "#7c8cff")
    .attr("stroke-width", 1.4)
    .attr("stroke-dasharray", (d) => d.type === "recommended" ? "4 3" : null)
    .attr("opacity", 0.32)
    .attr("d", (d) => {
      const a = pos[d.source], b = pos[d.target];
      const x1 = a.x + NODEW, y1 = a.y + NODEH / 2, x2 = b.x, y2 = b.y + NODEH / 2;
      const mx = (x1 + x2) / 2;
      return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    });

  // nodes
  const nodeSel = svg.append("g").selectAll("g").data(nodes).join("g")
    .attr("class", "node").attr("transform", (c) => `translate(${pos[c.code].x},${pos[c.code].y})`);
  nodeSel.append("rect").attr("width", NODEW).attr("height", NODEH).attr("rx", 7)
    .attr("fill", (c) => catColor(c.category))
    .attr("opacity", (c) => c.offered_this_year === false ? 0.45 : 1);
  if (named) {
    nodeSel.each(function (c) {
      const lines = wrapLabel(title(c), 24, 2);
      const t = d3.select(this).append("text").attr("x", NODEW / 2).attr("text-anchor", "middle")
        .style("font-size", "8px");
      const y0 = NODEH / 2 - (lines.length - 1) * 4.6 + 3;
      lines.forEach((ln, i) => t.append("tspan").attr("x", NODEW / 2).attr("y", y0 + i * 9.2).text(ln));
    });
  } else {
    nodeSel.append("text").attr("x", NODEW / 2).attr("y", NODEH / 2 + 3).attr("text-anchor", "middle").text((c) => c.code);
  }

  // interactivity: hover highlights connected chain
  const adj = new Map();
  linkData.forEach((l) => {
    (adj.get(l.source) || adj.set(l.source, new Set()).get(l.source)).add(l.target);
    (adj.get(l.target) || adj.set(l.target, new Set()).get(l.target)).add(l.source);
  });
  const tip = $("#graphTooltip");
  nodeSel.on("mouseenter", (e, c) => {
    const keep = new Set([c.code]); (adj.get(c.code) || []).forEach((x) => keep.add(x));
    nodeSel.classed("dim", (n) => !keep.has(n.code));
    linkSel.classed("dim", (l) => l.source !== c.code && l.target !== c.code)
      .attr("opacity", (l) => (l.source === c.code || l.target === c.code) ? 0.95 : 0.32)
      .attr("stroke-width", (l) => (l.source === c.code || l.target === c.code) ? 2.4 : 1.4);
    const pre = (c.prerequisites || []).map((p) => p.code).join(", ") || "—";
    tip.hidden = false;
    tip.innerHTML = `<div class="t-code">${c.code}</div><div>${title(c)}</div>
      <div class="t-meta">${catLabel(c.category)} · ${c.ects} ECTS · ${LANG === "el" ? "Εξ." : "Sem"} ${c.semester.join("/")}</div>
      <div class="t-meta">${LANG === "el" ? "Προαπ." : "Prereq"}: ${pre}</div>`;
  }).on("mousemove", (e) => {
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 280) + "px";
    tip.style.top = e.clientY + 14 + "px";
  }).on("mouseleave", () => {
    nodeSel.classed("dim", false); linkSel.classed("dim", false)
      .attr("opacity", 0.32).attr("stroke-width", 1.4);
    tip.hidden = true;
  }).on("click", (e, c) => openDrawer(c.code));
}

/* ----------------------------------------------------------- explorer */
let filterState = { cats: new Set(), sem: null, dir: null, spec: null, offered: false, q: "" };
let sortState = { key: "code", dir: 1 };

function renderExplorerFilters() {
  const cats = [...new Set(DATA.courses.map((c) => c.category))].filter((k) => CATEGORY[k]);
  const parts = [];
  parts.push(`<button class="${filterState.cats.size === 0 ? "on" : ""}" data-allcat style="${filterState.cats.size === 0 ? "background:#7c8cff;border-color:#7c8cff;color:#0a0e1a" : ""}">${LANG === "el" ? "Όλα" : "All"}</button>`);
  cats.forEach((c) => parts.push(`<button data-cat="${c}" class="${filterState.cats.has(c) ? "on" : ""}" style="${filterState.cats.has(c) ? `background:${catColor(c)};border-color:${catColor(c)};color:#0a0e1a` : ""}">${catLabel(c)}</button>`));
  parts.push(`<span style="width:10px"></span>`);
  for (let s = 1; s <= 8; s++) parts.push(`<button data-sem="${s}" class="${filterState.sem === s ? "on" : ""}" style="${filterState.sem === s ? "background:#43e7c9;border-color:#43e7c9;color:#0a0e1a" : ""}">${LANG === "el" ? "Εξ." : "S"}${s}</button>`);
  parts.push(`<span style="width:10px"></span>`);
  DATA.specializations.forEach((s, i) => parts.push(`<button data-spec="${s.id}" class="${filterState.spec === s.id ? "on" : ""}" style="${filterState.spec === s.id ? `background:${SPEC_COLORS[i]};border-color:${SPEC_COLORS[i]};color:#0a0e1a` : ""}">${s.id}</button>`));
  parts.push(`<button data-offered class="${filterState.offered ? "on" : ""}" style="${filterState.offered ? "background:#a3e635;border-color:#a3e635;color:#0a0e1a" : ""}">${LANG === "el" ? "Μόνο φετινά" : "Offered only"}</button>`);
  $("#explorerFilters").innerHTML = parts.join("");

  $$("#explorerFilters button").forEach((b) => b.onclick = () => {
    if (b.hasAttribute("data-allcat")) filterState.cats.clear();
    else if (b.dataset.cat) { const c = b.dataset.cat; filterState.cats.has(c) ? filterState.cats.delete(c) : filterState.cats.add(c); }
    else if (b.dataset.sem) filterState.sem = filterState.sem === +b.dataset.sem ? null : +b.dataset.sem;
    else if (b.dataset.spec) filterState.spec = filterState.spec === b.dataset.spec ? null : b.dataset.spec;
    else if (b.hasAttribute("data-offered")) filterState.offered = !filterState.offered;
    renderExplorerFilters(); renderTable();
  });
}

function filteredCourses() {
  const q = filterState.q.toLowerCase();
  return DATA.courses.filter((c) => {
    if (filterState.cats.size && !filterState.cats.has(c.category)) return false;
    if (filterState.sem && !(c.semester || []).includes(filterState.sem)) return false;
    if (filterState.spec && !c.specialization_roles?.[filterState.spec]) return false;
    if (filterState.offered && c.offered_this_year === false) return false;
    if (q) {
      const hay = `${c.code} ${c.title?.el} ${c.title?.en || ""} ${(c.instructors || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortCourses(list) {
  const k = sortState.key, d = sortState.dir;
  const val = (c) => ({
    code: c.code, title: title(c), category: catLabel(c.category),
    semester: Math.min(...(c.semester || [99])), ects: c.ects || 0,
    prereq: (c.prerequisites || []).length, spec: Object.keys(c.specialization_roles || {}).join(""),
  }[k]);
  return [...list].sort((a, b) => {
    const va = val(a), vb = val(b);
    return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb))) * d;
  });
}

function renderTable() {
  const list = sortCourses(filteredCourses());
  $("#explorerCount").textContent = `· ${list.length}`;
  $("#courseTableBody").innerHTML = list.map((c) => {
    const specPills = Object.entries(c.specialization_roles || {}).map(([s, r]) => {
      const i = DATA.specializations.findIndex((x) => x.id === s);
      return `<span class="spec-pill ${r === "basic" ? "b" : ""}" style="background:${SPEC_COLORS[i]};color:#0a0e1a" title="${s} ${r}">${s.slice(1)}</span>`;
    }).join("");
    return `<tr data-code="${c.code}" class="${c.offered_this_year === false ? "not-offered" : ""}">
      <td class="code-cell">${c.code}</td>
      <td>${title(c)}${c.offered_this_year === false ? ` <span class="muted small">(${LANG === "el" ? "δεν προσφέρεται" : "not offered"})</span>` : ""}</td>
      <td><span class="tag" style="background:${catColor(c.category)}22;color:${catColor(c.category)}"><span class="dot" style="background:${catColor(c.category)}"></span>${catLabel(c.category)}</span></td>
      <td class="num">${(c.semester || []).join("/") || "—"}</td>
      <td class="num">${c.ects ?? "—"}</td>
      <td class="num">${(c.prerequisites || []).length || ""}</td>
      <td><span class="spec-pills">${specPills}</span></td>
    </tr>`;
  }).join("");
  $$("#courseTableBody tr").forEach((tr) => tr.onclick = () => openDrawer(tr.dataset.code));
}

$("#search").addEventListener("input", (e) => { filterState.q = e.target.value; renderTable(); });
$$("#courseTable thead th").forEach((th) => th.onclick = () => {
  const k = th.dataset.sort;
  sortState.dir = sortState.key === k ? -sortState.dir : 1;
  sortState.key = k; renderTable();
});

/* ----------------------------------------------------------- instructors */
function renderTopInstructors() {
  const counts = {};
  DATA.courses.forEach((c) => (c.instructors || []).forEach((n) => (counts[n] = (counts[n] || 0) + 1)));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max = top[0]?.[1] || 1;
  $("#topInstructors").innerHTML = top.map(([n, v]) =>
    `<div class="row"><div>${n}</div><div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div><div class="cnt">${v}</div></div>`
  ).join("");
}

/* ----------------------------------------------------------- drawer */
function wireDrawer() {
  $$("#drawer [data-close]").forEach((el) => el.onclick = closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
}
function closeDrawer() { $("#drawer").hidden = true; }

const T = (el, en) => (LANG === "el" ? el : en);
const TERM = {
  winter: () => T("Χειμερινό", "Winter"),
  spring: () => T("Εαρινό", "Spring"),
  annual: () => T("Ετήσιο", "Annual"),
};

function openDrawer(code) {
  const c = DATA.courses.find((x) => x.code === code);
  if (!c) return;
  const dependents = DATA.courses.filter((x) => (x.prerequisites || []).some((p) => p.code === code));
  const chip = (cc, extra = "") => {
    const t = DATA.courses.find((x) => x.code === cc);
    return `<span class="d-chip ${extra}" data-jump="${cc}">${cc}${t ? ` <small>${title(t)}</small>` : ""}</span>`;
  };
  const roleName = (r) => r === "mandatory" ? T("Υποχρεωτικό (Υ)", "Mandatory (Υ)") : T("Βασικό (Β)", "Basic (Β)");
  const dirName = (id) => { const d = DATA.program.directions.find((x) => x.id === id); return d ? `${id} · ${d.name?.[LANG] || d.name?.el}` : id; };
  const enTitle = c.title?.en && c.title.en !== c.title?.el ? c.title.en : null;
  const weekly = c.hours ? c.hours.theory + c.hours.tutorial + c.hours.lab : null;
  const cell = (k, v) => `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`;

  const cells = [];
  cells.push(cell("ECTS", c.ects ?? "—"));
  if ((c.semester || []).length) cells.push(cell(T("Εξάμηνο", "Semester"), c.semester.map((s) => `${s}${T("ο", "")}`).join(" / ")));
  if (c.hours) cells.push(cell(T("Ώρες Θ/Φ/Ε", "Hours Th/Tut/Lab"), `${c.hours.theory}/${c.hours.tutorial}/${c.hours.lab}`));
  if (weekly != null) cells.push(cell(T("Ώρες/εβδομάδα", "Weekly hours"), weekly));
  if (c.direction) cells.push(cell(T("Κατεύθυνση", "Direction"), dirName(c.direction)));
  if (c.term) cells.push(cell(T("Περίοδος", "Term"), (TERM[c.term] || (() => c.term))()));
  cells.push(cell(T("Προσφέρεται φέτος", "Offered this year"), c.offered_this_year === false ? T("Όχι", "No") : T("Ναι", "Yes")));

  const sections = [];
  if ((c.prerequisites || []).length)
    sections.push(`<div class="d-sec"><h4>${T("Προαπαιτούμενα", "Prerequisites")}</h4>
      <div class="d-chiplist">${c.prerequisites.map((p) => chip(p.code, p.type === "recommended" ? "rec" : "req")).join("")}</div>
      <p class="muted small" style="margin:8px 0 0">${T("Συνεχόμενο = υποχρεωτικό, διακεκομμένο = συνιστώμενο", "Solid = required, dashed = recommended")}</p></div>`);
  if (dependents.length)
    sections.push(`<div class="d-sec"><h4>${T("Απαιτείται για", "Required by")}</h4><div class="d-chiplist">${dependents.map((d) => chip(d.code)).join("")}</div></div>`);
  if (c.specialization_roles && Object.keys(c.specialization_roles).length)
    sections.push(`<div class="d-sec"><h4>${T("Ειδικεύσεις", "Specializations")}</h4><div class="d-chiplist">${Object.entries(c.specialization_roles).map(([s, r]) => {
      const sp = DATA.specializations.find((x) => x.id === s);
      const i = DATA.specializations.findIndex((x) => x.id === s);
      return `<span class="d-chip"><span class="spec-pill ${r === "basic" ? "b" : ""}" style="background:${SPEC_COLORS[i]};color:#0a0e1a">${s.slice(1)}</span> ${sp?.name?.[LANG] || sp?.name?.el} <small>${roleName(r)}</small></span>`;
    }).join("")}</div></div>`);
  if ((c.instructors || []).length)
    sections.push(`<div class="d-sec"><h4>${T("Διδάσκοντες", "Instructors")} <span class="muted">· ${c.instructors.length}</span></h4><div class="d-people">${c.instructors.join(" · ")}</div></div>`);
  if (c.department)
    sections.push(`<div class="d-sec"><h4>${T("Τμήμα", "Department")}</h4><div class="d-people">${c.department?.[LANG] || c.department?.el}</div></div>`);
  if (c.description_url)
    sections.push(`<div class="d-sec"><h4>${T("Αναλυτική περιγραφή", "Full description")}</h4><a class="d-link" href="${c.description_url}" target="_blank" rel="noopener">${T("Άνοιγμα συνδέσμου", "Open link")} ↗</a></div>`);
  if (c.notes)
    sections.push(`<div class="d-sec"><h4>${T("Σημειώσεις", "Notes")}</h4><div class="muted small">${c.notes}</div></div>`);

  $("#drawerContent").innerHTML = `
    <div class="d-code">${c.code}</div>
    <div class="d-title">${c.title?.el || c.code}</div>
    ${enTitle ? `<div class="d-title-en">${enTitle}</div>` : ""}
    <div class="d-tags">
      <span class="tag" style="background:${catColor(c.category)}22;color:${catColor(c.category)}"><span class="dot" style="background:${catColor(c.category)}"></span>${catLabel(c.category)}</span>
      ${c.offered_this_year === false ? `<span class="tag" style="background:#ef444422;color:#f87171">${T("Δεν προσφέρεται φέτος", "Not offered this year")}</span>` : ""}
    </div>
    <div class="d-grid">${cells.join("")}</div>
    ${sections.join("")}
    <details class="d-raw"><summary>${T("Πλήρη δεδομένα (JSON)", "Raw data (JSON)")}</summary><pre>${JSON.stringify(c, null, 2)}</pre></details>
  `;
  $("#drawer").hidden = false;
  $$("#drawerContent [data-jump]").forEach((el) => el.onclick = () => openDrawer(el.dataset.jump));
}

/* ----------------------------------------------------------- lang + footer */
function wireLang() {
  $$(".lang-toggle button").forEach((b) => b.onclick = () => {
    LANG = b.dataset.lang;
    $$(".lang-toggle button").forEach((x) => x.classList.toggle("active", x === b));
    renderAll();
  });
}

function renderFooter() {
  $("#footerNote").textContent = LANG === "el"
    ? `Αυτόματα από το dist/curriculum.json · ${DATA.courses.length} μαθήματα · ${DATA.program.academic_year}`
    : `Generated from dist/curriculum.json · ${DATA.courses.length} courses · ${DATA.program.academic_year}`;
}
