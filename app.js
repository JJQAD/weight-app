"use strict";

/*
Mass — Phase 1

• LocalStorage persistence
• Swipe horizontally to change day (Medium-style)
• One entry per day (overwrite)
• Auto-save on blur / Enter / swipe away
• 7-day filled area graph
• Axis scaled so line sits in upper third
*/

const STORAGE_KEY = "mass_entries_v1";

const els = {
  dateLabel: document.getElementById("dateLabel"),
  weightInput: document.getElementById("weightInput"),
  statusText: document.getElementById("statusText"),
  chartCanvas: document.getElementById("chart"),
  swipeStage: document.getElementById("swipeStage"),
  swipeTrack: document.getElementById("swipeTrack"),
};

let chart = null;
let entries = [];       // { entryDate: "YYYY-MM-DD", weight: number, createdAt: number }
let selectedISO = null;

/* ---------------- DATE HELPERS ---------------- */

function todayISODate() {
  const d = new Date();
  // Safer local date vs toISOString() timezone drift
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToMMDDYY(iso) {
  const [y, m, d] = iso.split("-");
  return `${m}.${d}.${y.slice(2)}`;
}

function shiftISO(iso, deltaDays) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isFutureISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const selected = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return selected.getTime() > today.getTime();
}

/* ---------------- STORAGE ---------------- */

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(e => e && typeof e.entryDate === "string" && typeof e.weight === "number")
      .map(e => ({
        entryDate: e.entryDate,
        weight: e.weight,
        createdAt: typeof e.createdAt === "number" ? e.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function sortEntries() {
  entries.sort((a, b) => a.entryDate.localeCompare(b.entryDate));
}

function findEntry(iso) {
  return entries.find(e => e.entryDate === iso) || null;
}

function upsertEntry(iso, weight) {
  entries = entries.filter(e => e.entryDate !== iso);
  entries.push({ entryDate: iso, weight, createdAt: Date.now() });
  sortEntries();
  saveEntries();
}

/* ---------------- INPUT ---------------- */

function parseWeight(raw) {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0 || n > 1400) return null;
  return Math.round(n * 10) / 10;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function autoSaveIfValid({ quiet = true } = {}) {
  const weight = parseWeight(els.weightInput.value);
  if (weight === null) {
    if (!quiet && els.weightInput.value.trim() !== "") setStatus("Invalid weight.");
    return false;
  }

  upsertEntry(selectedISO, weight);
  renderChart();

  if (!quiet) setStatus(`Saved ${weight} for ${isoToMMDDYY(selectedISO)}.`);
  return true;
}

/* ---------------- UI ---------------- */

function renderDate() {
  els.dateLabel.textContent = isoToMMDDYY(selectedISO);
}

function updateTodayColor() {
  els.weightInput.classList.toggle("is-today", selectedISO === todayISODate());
}

function fillWeightForSelectedDate() {
  const entry = findEntry(selectedISO);
  els.weightInput.value = entry ? String(entry.weight) : "";
}

function renderAll() {
  renderDate();
  updateTodayColor();
  fillWeightForSelectedDate();
  renderChart();
}

/* ---------------- GRAPH (7 days, upper-third scaling) ---------------- */

function getWeekSeries(endISO) {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(shiftISO(endISO, -i));

  const map = new Map(entries.map(e => [e.entryDate, e.weight]));

  const values = [];
  let last = null;

  for (const iso of days) {
    const v = map.has(iso) ? map.get(iso) : null;
    if (typeof v === "number") {
      last = v;
      values.push(v);
    } else {
      values.push(last);
    }
  }

  const nums = values.filter(v => typeof v === "number");
  const dataMin = nums.length ? Math.min(...nums) : 0;
  const dataMax = nums.length ? Math.max(...nums) : 1;

  const labels = days.map(d => d.split("-")[2].replace(/^0/, ""));
  return { labels, values, dataMin, dataMax };
}

function computeAxisUpperThird(dataMin, dataMax) {
  let range = dataMax - dataMin;
  if (range < 1) range = 1;

  // Place series high: make axis span ~3x data range
  const yMax = dataMax + range * 0.2;     // slight headroom
  const yMin = yMax - range * 3.0;

  // Pick a clean-ish step
  const step = Math.max(1, Math.round(range / 2));

  return { yMin, yMax, step };
}

function renderChart() {
  const { labels, values, dataMin, dataMax } = getWeekSeries(selectedISO);
  const { yMin, yMax, step } = computeAxisUpperThird(dataMin, dataMax);

  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e23b1f";

  const dataset = {
    data: values,
    borderWidth: 0,
    pointRadius: 0,
    tension: 0.2,
    fill: true,
    backgroundColor: accent,
  };

  if (!chart) {
    chart = new Chart(els.chartCanvas, {
      type: "line",
      data: { labels, datasets: [dataset] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#6b6b6b", maxRotation: 0, autoSkip: false },
            title: { display: true, text: "week", color: "#6b6b6b", padding: { top: 6 } },
          },
          y: {
            grid: { display: false },
            min: yMin,
            max: yMax,
            ticks: { color: "#6b6b6b", stepSize: step, maxTicksLimit: 4 },
          },
        },
      },
    });
    return;
  }

  chart.data.labels = labels;
  chart.data.datasets[0] = dataset;
  chart.options.scales.y.min = yMin;
  chart.options.scales.y.max = yMax;
  chart.options.scales.y.ticks.stepSize = step;
  chart.update();
}

/* ---------------- SWIPE (Medium-style + drag translate) ---------------- */

function shiftDay(delta) {
  const next = shiftISO(selectedISO, delta);
  if (isFutureISODate(next)) return;
  selectedISO = next;
  renderAll();
}

function addSwipe() {
  const touchsurface = els.swipeStage;
  const track = els.swipeTrack;

  // Medium-style params
  const threshold = 70;     // required min horizontal distance
  const restraint = 90;     // max vertical drift allowed
  const allowedTime = 450;  // max swipe time (ms)

  let startX = 0;
  let startY = 0;
  let distX = 0;
  let distY = 0;
  let startTime = 0;

  let locked = false;
  let lockDir = null; // "h" or "v"

  function setTranslate(px) {
    track.style.transition = "none";
    track.style.transform = `translateX(${px}px)`;
  }

  function snapBack() {
    track.style.transition = "transform 180ms ease-out";
    track.style.transform = "translateX(0px)";
  }

  function commitSwipe(dir) {
    // dir: "left" -> next day, "right" -> previous day
    const width = touchsurface.clientWidth || 320;
    const off = dir === "left" ? -width : width;

    // Slide offscreen
    track.style.transition = "transform 160ms ease-out";
    track.style.transform = `translateX(${off}px)`;

    window.setTimeout(() => {
      // Save current day before leaving it
      autoSaveIfValid({ quiet: true });

      if (dir === "right") shiftDay(-1);
      else shiftDay(+1);

      // Jump to opposite side, then animate back
      track.style.transition = "none";
      track.style.transform = `translateX(${-off}px)`;

      window.setTimeout(() => {
        track.style.transition = "transform 160ms ease-out";
        track.style.transform = "translateX(0px)";
      }, 16);
    }, 165);
  }

  touchsurface.addEventListener("touchstart", (e) => {
    if (!e.changedTouches || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    startX = t.pageX;
    startY = t.pageY;
    distX = 0;
    distY = 0;
    startTime = Date.now();
    locked = false;
    lockDir = null;
  }, { passive: true });

  touchsurface.addEventListener("touchmove", (e) => {
    if (!e.changedTouches || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    distX = t.pageX - startX;
    distY = t.pageY - startY;

    if (!locked) {
      if (Math.abs(distX) < 10 && Math.abs(distY) < 10) return;
      locked = true;
      lockDir = Math.abs(distX) > Math.abs(distY) ? "h" : "v";
    }

    if (lockDir === "h") {
      // Stop page scroll when user is swiping horizontally
      e.preventDefault();
      setTranslate(distX);
    }
  }, { passive: false });

  touchsurface.addEventListener("touchend", () => {
    const elapsedTime = Date.now() - startTime;
    const absX = Math.abs(distX);
    const absY = Math.abs(distY);

    if (elapsedTime <= allowedTime && absX >= threshold && absY <= restraint) {
      const dir = distX < 0 ? "left" : "right";
      commitSwipe(dir);
      return;
    }

    snapBack();
  }, { passive: true });

  // If the touch is canceled, snap back
  touchsurface.addEventListener("touchcancel", () => {
    snapBack();
  }, { passive: true });
}

/* ---------------- INIT ---------------- */

function init() {
  entries = loadEntries();
  sortEntries();

  selectedISO = todayISODate();

  // Optional seed data if empty (delete if you want blank start)
  if (entries.length === 0) {
    const t = selectedISO;
    entries = [
      { entryDate: shiftISO(t, -6), weight: 186.2, createdAt: Date.now() },
      { entryDate: shiftISO(t, -4), weight: 185.3, createdAt: Date.now() },
      { entryDate: shiftISO(t, -2), weight: 184.8, createdAt: Date.now() },
      { entryDate: shiftISO(t,  0), weight: 184.3, createdAt: Date.now() },
    ];
    sortEntries();
    saveEntries();
  }

  renderAll();

  // Auto-save on leaving the field
  els.weightInput.addEventListener("blur", () => {
    autoSaveIfValid({ quiet: false });
  });

  // Enter saves (by forcing blur)
  els.weightInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.weightInput.blur();
  });

  // Swiping changes day; save occurs inside commitSwipe
  addSwipe();
}

init();
