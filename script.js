/* =========================================================
   Smart Parking System – script.js
   Firebase Realtime Database integration
   Config loaded securely from /api/config (Vercel env vars)
   Layout: Section A (8 slots) | Section B (8 slots)
   Booking: click on any available slot to open booking modal
   States: available | occupied | booked (available+reserved) | booked-occupied
   ========================================================= */

// ── Configuration ──
const SECTION_A_COUNT = 8;
const SECTION_B_COUNT = 8;

// Which slots in Section A are connected to Firebase
// Map firebase path -> slot index (0-based in that section)
const FIREBASE_SLOTS_A = {
  'slot1': 0,  // Firebase "slot1" → A1
  'slot2': 1   // Firebase "slot2" → A2
};

// Which slots in Section B are connected to Firebase (none currently)
const FIREBASE_SLOTS_B = {};

// ── In-memory booking store (persisted to localStorage) ──
// bookings[slotLabel] = { name, phone, time } | null
let bookings = {};

function loadBookings() {
  try {
    const raw = localStorage.getItem('parkingBookings');
    if (raw) bookings = JSON.parse(raw);
  } catch (e) { bookings = {}; }
}

function saveBookings() {
  try { localStorage.setItem('parkingBookings', JSON.stringify(bookings)); } catch (e) {}
}

// Current Firebase-reported states (so we can combine with bookings)
const firebaseStates = {}; // slotLabel -> 'occupied' | 'available' | 'default'

// ── SVG Icons ──
function carIconSVG(color = '#94A3B8') {
  return `<svg class="slot-car-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="18" width="32" height="16" rx="4" fill="${color}" opacity="0.3"/>
    <rect x="12" y="12" width="24" height="14" rx="3" fill="${color}" opacity="0.5"/>
    <circle cx="15" cy="36" r="3" fill="${color}" opacity="0.6"/>
    <circle cx="33" cy="36" r="3" fill="${color}" opacity="0.6"/>
  </svg>`;
}

// ── Build Slot HTML ──
function createSlotHTML(label, isFirebase = false) {
  const firebaseClass = isFirebase ? ' firebase-slot' : '';
  return `
    <div class="slot${firebaseClass}" id="slot-${label}" data-slot="${label}" tabindex="0" role="button" aria-label="Parking slot ${label}">
      ${carIconSVG()}
      <span class="slot-number">${label}</span>
      <span class="slot-indicator"></span>
      <span class="slot-status">—</span>
      <span class="slot-book-hint">Click to Book</span>
      <span class="slot-timer" style="display: none; font-family: monospace; font-size: 0.75rem; font-weight: bold; margin-top: 2px;"></span>
    </div>
  `;
}

// ── Render Slots ──
function renderSlots() {
  const zoneA = document.getElementById('zoneA');
  const zoneB = document.getElementById('zoneB');

  // Section A: A1 to A8
  let htmlA = '';
  for (let i = 1; i <= SECTION_A_COUNT; i++) {
    const label = `A${i}`;
    const isFirebase = Object.values(FIREBASE_SLOTS_A).includes(i - 1);
    htmlA += createSlotHTML(label, isFirebase);
  }
  zoneA.innerHTML = htmlA;

  // Section B: B1 to B8
  let htmlB = '';
  for (let i = 1; i <= SECTION_B_COUNT; i++) {
    const label = `B${i}`;
    const isFirebase = Object.values(FIREBASE_SLOTS_B).includes(i - 1);
    htmlB += createSlotHTML(label, isFirebase);
  }
  zoneB.innerHTML = htmlB;

  // attach click listeners
  document.querySelectorAll('.slot').forEach(el => {
    el.addEventListener('click', () => onSlotClick(el.dataset.slot));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') onSlotClick(el.dataset.slot);
    });
  });

  // Apply saved bookings
  Object.keys(bookings).forEach(slotLabel => {
    if (bookings[slotLabel]) applySlotState(slotLabel);
  });

  updateMeta();
}

// ── Resolve Effective Visual State ──
// Priority: Firebase state + booking together
function resolveState(slotLabel) {
  const firebase = firebaseStates[slotLabel] || 'default';
  const hasBooking = !!bookings[slotLabel];

  if (firebase === 'occupied' && hasBooking) return 'booked-occupied';
  if (firebase === 'occupied') return 'occupied';
  if (hasBooking) return 'booked';
  if (firebase === 'available') return 'available';
  return 'default';
}

// ── Apply Slot Visual State ──
function applySlotState(slotLabel) {
  const el = document.getElementById(`slot-${slotLabel}`);
  if (!el) return;

  const state = resolveState(slotLabel);

  el.classList.remove('available', 'occupied', 'booked', 'booked-occupied');

  const statusEl = el.querySelector('.slot-status');
  const hintEl   = el.querySelector('.slot-book-hint');
  const timerEl  = el.querySelector('.slot-timer');

  switch (state) {
    case 'available':
      el.classList.add('available');
      statusEl.textContent = 'Empty';
      if (hintEl) hintEl.style.display = '';
      if (timerEl && !bookings[slotLabel]) timerEl.style.display = 'none';
      break;
    case 'occupied':
      el.classList.add('occupied');
      statusEl.textContent = 'Occupied';
      if (hintEl) hintEl.style.display = 'none';
      if (timerEl && !bookings[slotLabel]) timerEl.style.display = 'none';
      break;
    case 'booked':
      el.classList.add('booked');
      statusEl.textContent = 'Booked';
      if (hintEl) hintEl.style.display = 'none';
      break;
    case 'booked-occupied':
      el.classList.add('booked-occupied');
      statusEl.textContent = 'Booked + Occupied';
      if (hintEl) hintEl.style.display = 'none';
      break;
    default:
      statusEl.textContent = '—';
      if (hintEl) hintEl.style.display = 'none';
      if (timerEl && !bookings[slotLabel]) timerEl.style.display = 'none';
  }
}

// ── Update Slot State (Firebase) ──
function setSlotState(slotLabel, state) {
  firebaseStates[slotLabel] = state;
  applySlotState(slotLabel);
}

// ── Update Meta Counters ──
function updateMeta() {
  const zoneA = document.getElementById('zoneA');
  const zoneB = document.getElementById('zoneB');

  const totalA = zoneA.querySelectorAll('.slot').length;
  const availA = zoneA.querySelectorAll('.slot.available').length;

  const totalB = zoneB.querySelectorAll('.slot').length;
  const availB = zoneB.querySelectorAll('.slot.available').length;

  document.getElementById('zoneAMeta').textContent = `${availA} / ${totalA} Available`;
  document.getElementById('zoneBMeta').textContent = `${availB} / ${totalB} Available`;
}

// ── Firebase Listeners ──
function setupFirebaseListeners(db) {
  Object.entries(FIREBASE_SLOTS_A).forEach(([fbPath, slotIndex]) => {
    const slotLabel = `A${slotIndex + 1}`;
    db.ref(`parking/${fbPath}`).on('value', (snapshot) => {
      const val = snapshot.val();
      if (val === 'occupied' || val === 1 || val === '1' || val === true) {
        setSlotState(slotLabel, 'occupied');
      } else if (val === 'empty' || val === 0 || val === '0' || val === false) {
        setSlotState(slotLabel, 'available');
      } else {
        setSlotState(slotLabel, 'default');
      }
      updateMeta();
    });
  });

  Object.entries(FIREBASE_SLOTS_B).forEach(([fbPath, slotIndex]) => {
    const slotLabel = `B${slotIndex + 1}`;
    db.ref(`parking/${fbPath}`).on('value', (snapshot) => {
      const val = snapshot.val();
      if (val === 'occupied' || val === 1 || val === '1' || val === true) {
        setSlotState(slotLabel, 'occupied');
      } else if (val === 'empty' || val === 0 || val === '0' || val === false) {
        setSlotState(slotLabel, 'available');
      } else {
        setSlotState(slotLabel, 'default');
      }
      updateMeta();
    });
  });
}

// ── Booking Modal ──
let currentSlot = null;

function onSlotClick(slotLabel) {
  const state = resolveState(slotLabel);
  // Only open for available or default slots (not already fully occupied without booking option)
  if (state === 'occupied') return; // purely occupied by sensor – can't book

  openBookingModal(slotLabel);
}

function openBookingModal(slotLabel) {
  currentSlot = slotLabel;

  const modal   = document.getElementById('bookingModal');
  const badge   = document.getElementById('modalSlotBadge');
  const form    = document.getElementById('bookingForm');
  const success = document.getElementById('bookingSuccess');

  // Set slot badge
  badge.textContent = slotLabel;

  // Detect zone for badge colour
  badge.className = 'modal-slot-badge';
  if (slotLabel.startsWith('A')) badge.classList.add('badge-zone-a');
  else badge.classList.add('badge-zone-b');

  // Pre-fill if already booked
  const existing = bookings[slotLabel];
  document.getElementById('bookingName').value  = existing ? existing.name  : '';
  document.getElementById('bookingPhone').value = existing ? existing.phone : '';
  document.getElementById('bookingTime').value  = existing ? existing.time  : defaultDateTime();
  document.getElementById('bookingDuration').value = existing ? existing.duration : '1';

  const btnDelete = document.getElementById('btnDeleteBooking');
  if (existing) {
    btnDelete.style.display = 'block';
  } else {
    btnDelete.style.display = 'none';
  }

  // Reset errors & show form
  clearErrors();
  form.hidden    = false;
  success.hidden = true;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('bookingName').focus();
}

function closeBookingModal() {
  const modal = document.getElementById('bookingModal');
  modal.classList.remove('open');
  document.body.style.overflow = '';
  currentSlot = null;
}

function defaultDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function clearErrors() {
  ['nameError','phoneError','timeError'].forEach(id => {
    document.getElementById(id).classList.remove('visible');
  });
  ['bookingName','bookingPhone','bookingTime'].forEach(id => {
    document.getElementById(id).classList.remove('input-error');
  });
}

function validateForm() {
  let valid = true;
  clearErrors();

  const name  = document.getElementById('bookingName').value.trim();
  const phone = document.getElementById('bookingPhone').value.trim();
  const time  = document.getElementById('bookingTime').value;

  if (!name) {
    document.getElementById('nameError').classList.add('visible');
    document.getElementById('bookingName').classList.add('input-error');
    valid = false;
  }
  if (!phone || !/^[\d\s\+\-]{7,15}$/.test(phone)) {
    document.getElementById('phoneError').classList.add('visible');
    document.getElementById('bookingPhone').classList.add('input-error');
    valid = false;
  }
  if (!time) {
    document.getElementById('timeError').classList.add('visible');
    document.getElementById('bookingTime').classList.add('input-error');
    valid = false;
  }

  return valid;
}

function handleBookingSubmit(e) {
  e.preventDefault();
  if (!validateForm() || !currentSlot) return;

  const name  = document.getElementById('bookingName').value.trim();
  const phone = document.getElementById('bookingPhone').value.trim();
  const time  = document.getElementById('bookingTime').value;

  const duration = document.getElementById('bookingDuration').value;

  // Save booking
  bookings[currentSlot] = { name, phone, time, duration };
  saveBookings();

  // Update slot card
  applySlotState(currentSlot);
  updateMeta();

  // Show success
  const dt = new Date(time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  document.getElementById('successDesc').textContent =
    `Slot ${currentSlot} reserved for ${name} at ${dt} for ${duration} hour(s).`;

  document.getElementById('bookingForm').hidden    = true;
  document.getElementById('bookingSuccess').hidden = false;

  // Auto-close after 2.5 s
  setTimeout(closeBookingModal, 2500);
}

function handleCancelBooking() {
  if (!currentSlot || !bookings[currentSlot]) return;
  delete bookings[currentSlot];
  saveBookings();
  applySlotState(currentSlot);
  updateMeta();
  closeBookingModal();
}

function formatZ(n) { return n < 10 ? '0'+n : n; }

function updateTimers() {
  const now = new Date();
  
  Object.keys(bookings).forEach(slotLabel => {
    const booking = bookings[slotLabel];
    if (!booking) return;
    
    const startTime = new Date(booking.time);
    const durationMs = parseInt(booking.duration || '1', 10) * 3600 * 1000;
    const endTime = new Date(startTime.getTime() + durationMs);
    
    const el = document.getElementById(`slot-${slotLabel}`);
    if (!el) return;
    const timerSpan = el.querySelector('.slot-timer');
    
    if (now >= endTime) {
      // Expired -> auto cancel
      delete bookings[slotLabel];
      saveBookings();
      applySlotState(slotLabel);
      updateMeta();
      if (timerSpan) timerSpan.style.display = 'none';
      if (currentSlot === slotLabel) closeBookingModal();
    } else if (now >= startTime) {
      // Active -> countdown
      const diff = endTime - now;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (timerSpan) {
        timerSpan.textContent = `${formatZ(h)}:${formatZ(m)}:${formatZ(s)}`;
        timerSpan.style.display = 'block';
        timerSpan.style.color = '#B91C1C';
      }
    } else {
      // Future -> countdown to start
      const diff = startTime - now;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (timerSpan) {
        timerSpan.textContent = `Starts in ${h}h ${m}m`;
        timerSpan.style.display = 'block';
        timerSpan.style.color = '#C2410C';
      }
    }
  });
}

// ── Footer Timestamp ──
function updateFooterTime() {
  const el = document.getElementById('footerTime');
  if (el) el.textContent = 'Last refreshed: ' + new Date().toLocaleString();
}

// ── Bootstrap: fetch config from /api/config, then init Firebase ──
async function bootstrap() {
  loadBookings();
  renderSlots();
  updateFooterTime();
  setInterval(updateFooterTime, 30000);
  setInterval(updateTimers, 1000);
  updateTimers(); // initial call

  // Modal close triggers
  document.getElementById('modalClose').addEventListener('click', closeBookingModal);
  document.getElementById('btnCancel').addEventListener('click', closeBookingModal);
  document.getElementById('bookingModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBookingModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeBookingModal();
  });

  // Form submit
  document.getElementById('bookingForm').addEventListener('submit', handleBookingSubmit);
  document.getElementById('btnDeleteBooking').addEventListener('click', handleCancelBooking);

  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
    const firebaseConfig = await res.json();

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    setupFirebaseListeners(db);
  } catch (err) {
    console.error('Firebase init failed:', err);
    // Show a non-blocking error in the footer
    const el = document.getElementById('footerTime');
    if (el) el.textContent = '⚠️ Could not connect to Firebase. Check your environment variables.';
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
