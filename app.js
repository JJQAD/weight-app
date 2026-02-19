"use strict";

/**
 * Phase 1 storage strategy:
 * - LocalStorage for persistence (single user device).
 * - Later replace storage functions with Supabase calls.
 */

const STORAGE_KEY = "weight_app_entries_v1";

const els = {
  dateButton: document.getElementById("dateButton"),
  dateLabel: document.getElementById("dateLabel"),
  dateInput: document.getElementById("dateInput"),
  weightInput: document.getElementById("weightInput"),
  saveButton: document.getElementById("saveButton"),
  statusText: document.getElementById("statusText"),
  recentList: document.getElementById("recentList"),
  chartCanvas: document.getElementById("chart"),
};

let chart = null;
let entries = []; // { entryDate: "YYYY-MM-DD", weight: number, createdAt: number }

/* ---------- Date helpers ---------- */

function todayISODate() {
  const d = new Date();
  // Local date -> YYYY-MM-DD
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToMMDDYY(iso) {
  // iso = "YYYY-MM-DD"
  const [y, m, d] = iso.split("-");
  const yy = y.slice(2);
  return `${m}.${d}.${yy}`;
}

function isFutureISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const selected = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return selected.getTime() > today.getTime();
}

/* ---------- Storage ---------- */

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Minimal validation
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

function saveEntries(nextEntries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
}

/* ---------- Domain logic ---------- */

function sortByEntryDateAsc(list) {
  return [...list].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
}

function upsertEntry(entryDate, weight) {
  // One entry per day: overwrite if same entryDate exists
  const next = entries.filter(e => e.entryDate !== entryDate);
  next.push({ entryDate, weight, createdAt: Date.now() });
  entries = sortByEntryDateAsc(next);
  saveEntries(entries);
}

function parseWeightInput(raw) {
  // Accept "180", "180.2", "180,2" -> normalize
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  // Bound to something reasonable to catch accidental input
  if (n <= 0 || n > 1400) return null;
  // 1 decimal precision display; store as number
  return Math.round(n * 10) / 10;
}

/* ---------- UI updates ---------- */

function setStatus(text) {
  els.statusText.textContent = text;
}

function setSaveButtonState(state) {
  // state: "idle" | "saved" | "error"
  els.saveButton.classList.remove("is-saved", "is-error");
  if (state === "saved") els.saveButton.classList.add("is-saved");
  if (state === "error") els.saveButton.classList.add("is-error");
}

function renderDateLabel() {
  const iso = els.dateInput.value;
  els.dateLabel.textContent = isoToMMDDYY(iso);
}

function formatListDate(iso) {
  // Keep list minimal: mm.dd.yy
  return isoToMMDDYY(iso);
}

function renderRecentList() {
  const list = [...entries].slice(-7).reverse();
  els.recentList.innerHTML = "";

  for (const e of list) {
    const li = document.createElement("li");

    const date = document.createElement("span");
    date.className = "recentDate";
    date.textContent = formatListDate(e.entryDate);

    const w = document.createElement("span");
    w.className = "recentWeight";
    w.textContent = `${e.weight}`;

    li.appendChild(date);
    li.appendChild(w);
    els.recentList.appendChild(li);
  }
}

function renderChart() {
  const labels = entries.map(e => isoToMMDDYY(e.entryDate));
  const data = entries.map(e => e.weight);

  if (!chart) {
    chart = new Chart(els.chartCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 6 }
          },
          y: {
            grid: { display: false },
            ticks: { maxTicksLimit: 5 }
          }
        }
      }
    });
    return;
  }

  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

function renderAll() {
  renderDateLabel();
  renderChart();
  renderRecentList();
}

/* ---------- Event wiring ---------- */

function openNativeDatePicker() {
  // iOS: programmatically focusing a date input generally triggers the vertical scroller.
  // Keep it visually hidden but accessible.
  els.dateInput.showPicker?.(); // supported in some browsers
  els.dateInput.focus();
  els.dateInput.click();
}

function onSave() {
  setSaveButtonState("idle");
  setStatus("");

  const iso = els.dateInput.value;
  if (!iso) {
    setSaveButtonState("error");
    setStatus("Missing date.");
    return;
  }
  if (isFutureISODate(iso)) {
    setSaveButtonState("error");
    setStatus("Future dates blocked.");
    return;
  }

  const weight = parseWeightInput(els.weightInput.value);
  if (weight === null) {
    setSaveButtonState("error");
    setStatus("Invalid weight.");
    return;
  }

  upsertEntry(iso, weight);
  renderAll();

  setSaveButtonState("saved");
  setStatus(`Saved ${weight} for ${isoToMMDDYY(iso)}.`);

  // Reset saved state after a moment so the button can indicate next action
  window.setTimeout(() => setSaveButtonState("idle"), 900);
}

/* ---------- Init ---------- */

function init() {
  // Load existing entries (or start with a small seed if empty)
  entries = sortByEntryDateAsc(loadEntries());

  // Set date to today by default
  const today = todayISODate();
  els.dateInput.value = today;

  // If empty, seed with a minimal demo series (remove later if you want)
  if (entries.length === 0) {
    const seed = [
      { entryDate: shiftISO(today, -14), weight: 184.6, createdAt: Date.now() },
      { entryDate: shiftISO(today, -10), weight: 183.9, createdAt: Date.now() },
      { entryDate: shiftISO(today, -7),  weight: 183.2, createdAt: Date.now() },
      { entryDate: shiftISO(today, -3),  weight: 182.8, createdAt: Date.now() },
    ];
    entries = sortByEntryDateAsc(seed);
    saveEntries(entries);
  }

  renderAll();
  setSaveButtonState("idle");

  // Date picker behavior
  els.dateButton.addEventListener("click", openNativeDatePicker);
  els.dateInput.addEventListener("change", () => {
    renderDateLabel();
    setSaveButtonState("idle");
    setStatus("");
  });

  // Save behavior
  els.saveButton.addEventListener("click", onSave);

  // Keyboard enter saves
  els.weightInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSave();
  });

  // Any edits reset saved indicator
  els.weightInput.addEventListener("input", () => {
    setSaveButtonState("idle");
    setStatus("");
  });
}

// date shifting helper
function shiftISO(iso, deltaDays) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

init();
