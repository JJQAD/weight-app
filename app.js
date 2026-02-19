"use strict";

/**
 * Phase 1 storage strategy:
 * - LocalStorage for persistence (single user device).
 * - Later replace storage functions with Supabase calls.
 *
 * Updates in this version:
 * - Selected date concept (selectedISO) separate from created_at
 * - Date displayed as mm.dd.yy, centered below weight
 * - Tap date opens iOS native date scroller
 * - Swipe right = previous day, swipe left = next day (future blocked)
 * - Weight number centered, larger, bold; today’s weight styled via .is-today class
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
  swipeStage: document.getElementById("swipeStage"),
  swipeTrack: document.getElementById("swipeTrack"),
};

let chart = null;
let entries = []; // { entryDate: "YYYY-MM-DD", weight: number, createdAt: number }
let selectedISO = null;

/* ---------- Date helpers ---------- */

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToMMDDYY(iso) {
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

function shiftISO(iso, deltaDays) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ---------- Storage ---------- */

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.entryDate === "string" && typeof e.weight === "number")
      .map((e) => ({
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
  const next = entries.filter((e) => e.entryDate !== entryDate);
  next.push({ entryDate, weight, createdAt: Date.now() });
  entries = sortByEntryDateAsc(next);
  saveEntries(entries);
}

function parseWeightInput(raw) {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > 1400) return null;
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
  els.dateLabel.textContent = isoToMMDDYY(selectedISO);
  els.dateInput.value = selectedISO; // keep picker synced
}

function updateTodayColor() {
  const today = todayISODate();
  els.weightInput.classList.toggle("is-today", selectedISO === today);
}

function renderRecentList() {
  const list = [...entries].slice(-7).reverse();
  els.recentList.innerHTML = "";

  for (const e of list) {
    const li = document.createElement("li");

    const date = document.createElement("span");
    date.className = "recentDate";
    date.textContent = isoToMMDDYY(e.entryDate);

    const w = document.createElement("span");
    w.className = "recentWeight";
    w.textContent = `${e.weight}`;

    li.appendChild(date);
    li.appendChild(w);
    els.recentList.appendChild(li);
  }
}

function renderChart() {
  const labels = entries.map((e) => isoToMMDDYY(e.entryDate));
  const data = entries.map((e) => e.weight);

  if (!chart) {
    chart = new Chart(els.chartCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 6 },
          },
          y: {
            grid: { display: false },
            ticks: { maxTicksLimit: 5 },
          },
        },
      },
    });
    return;
  }

  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

function renderAll() {
  renderDateLabel();
  updateTodayColor();
  renderChart();
  renderRecentList();
}

/* ---------- Date picker ---------- */

function openNativeDatePicker() {
  // iOS: focusing/clicking a date input triggers the vertical scroller
  els.dateInput.showPicker?.();
  els.dateInput.focus();
  els.dateInput.click();
}

/* ---------- Navigation (swipe) ---------- */

function shiftSelectedDay(deltaDays) {
  const next = shiftISO(selectedISO, deltaDays);
  if (isFutureISODate(next)) return; // block future
  selectedISO = next;
  renderAll();
  setSaveButtonState("idle");
  setStatus("");
}

function animateSwipe(dir, commitFn) {
  const cls = dir === "right" ? "slide-right" : "slide-left";
  els.swipeTrack.classList.add(cls);

  window.setTimeout(() => {
    els.swipeTrack.classList.remove(cls);
    commitFn();
  }, 140);
}

function addSwipeNavigation() {
  let startX = 0;
  let startY = 0;
  let active = false;

  const threshold = 40; // px
  const restraint = 60; // px vertical tolerance

  els.swipeStage.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      active = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: true }
  );

  els.swipeStage.addEventListener(
    "touchmove",
    (e) => {
      if (!active || !e.touches || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (Math.abs(dy) > restraint) return;

      els.swipeTrack.classList.remove("slide-left", "slide-right");
      if (dx > 18) els.swipeTrack.classList.add("slide-right");
      if (dx < -18) els.swipeTrack.classList.add("slide-left");
    },
    { passive: true }
  );

  els.swipeStage.addEventListener(
    "touchend",
    (e) => {
      if (!active) return;
      active = false;

      els.swipeTrack.classList.remove("slide-left", "slide-right");

      const touch = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
      const endX = touch ? touch.clientX : startX;
      const endY = touch ? touch.clientY : startY;

      const dx = endX - startX;
      const dy = endY - startY;

      if (Math.abs(dy) > restraint) return;
      if (Math.abs(dx) < threshold) return;

      // Your rule:
      // swipe right -> previous day slides in
      // swipe left  -> next day (future blocked)
      if (dx > 0) {
        animateSwipe("right", () => shiftSelectedDay(-1));
      } else {
        animateSwipe("left", () => shiftSelectedDay(+1));
      }
    },
    { passive: true }
  );
}

/* ---------- Save ---------- */

function onSave() {
  setSaveButtonState("idle");
  setStatus("");

  const iso = selectedISO;
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

  window.setTimeout(() => setSaveButtonState("idle"), 900);
}

/* ---------- Init ---------- */

function init() {
  entries = sortByEntryDateAsc(loadEntries());

  const today = todayISODate();
  selectedISO = today;
  els.dateInput.value = today;

  // Seed minimal demo data if empty (remove later if desired)
  if (entries.length === 0) {
    const seed = [
      { entryDate: shiftISO(today, -14), weight: 184.6, createdAt: Date.now() },
      { entryDate: shiftISO(today, -10), weight: 183.9, createdAt: Date.now() },
      { entryDate: shiftISO(today, -7), weight: 183.2, createdAt: Date.now() },
      { entryDate: shiftISO(today, -3), weight: 182.8, createdAt: Date.now() },
    ];
    entries = sortByEntryDateAsc(seed);
    saveEntries(entries);
  }

  renderAll();
  setSaveButtonState("idle");

  // Date picker
  els.dateButton.addEventListener("click", openNativeDatePicker);
  els.dateInput.addEventListener("change", () => {
    const next = els.dateInput.value;
    if (!next || isFutureISODate(next)) {
      els.dateInput.value = selectedISO;
      renderDateLabel();
      setSaveButtonState("error");
      setStatus("Future dates blocked.");
      window.setTimeout(() => setSaveButtonState("idle"), 900);
      return;
    }
    selectedISO = next;
    renderAll();
    setSaveButtonState("idle");
    setStatus("");
  });

  // Save
  els.saveButton.addEventListener("click", onSave);

  // Enter saves
  els.weightInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSave();
  });

  // Any edits reset state
  els.weightInput.addEventListener("input", () => {
    setSaveButtonState("idle");
    setStatus("");
  });

  // Swipe navigation
  addSwipeNavigation();
}

init();
