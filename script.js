// aeirebase подключается через CDN в index.html.
// ВАЖНО: этот файл НЕ является module.

const firebaseConfig = {
  
  apiKey: "AIzaSyDTtFgIkuSUseMHo3aNCE9i5YNNJRKR-u0",
  authDomain: "iip-attendance-8113a.firebaseapp.com",
  databaseURL: "https://iip-attendance-8113a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "iip-attendance-8113a",
  storageBucket: "iip-attendance-8113a.firebasestorage.app",
  messagingSenderId: "644444117595",
  appId: "1:644444117595:web:ff88dfc8b2876fa093bd7e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
let firebaseReady = false;
// ===== ПРАВА =====
function canEditAttendance(groupName) {
  if (!currentUser) return false; // гость не вошёл

  if (currentRole === 'admin' || currentRole === 'checker') {
    return true;
  }// Firebase подключается через CDN в index.html.
// ВАЖНО: этот файл НЕ является module.

const firebaseConfig = {
  apiKey: "AIzaSyDTtFgIkuSUseMHo3aNCE9i5YNNJRKR-u0",
  authDomain: "iip-attendance-8113a.firebaseapp.com",
  databaseURL: "https://iip-attendance-8113a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "iip-attendance-8113a",
  storageBucket: "iip-attendance-8113a.firebasestorage.app",
  messagingSenderId: "644444117595",
  appId: "1:644444117595:web:ff88dfc8b2876fa093bd7e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
let firebaseReady = false;

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch(e => console.warn('Persistence:', e));

// Текущий пользователь и его роль
let currentUser = null;
let currentRole = 'guest';       // guest | starosta | checker | admin
let currentUserGroup = null;

// ===== ПРАВА =====
function canEditAttendance(groupName) {
  if (!currentUser) return false;
  if (currentRole === 'admin' || currentRole === 'checker') return true;
  if (currentRole === 'starosta') return currentUserGroup === groupName;
  return false;
}

// ===== DATABASE =====
const DEFAULT_GROUPS = {
  "ИС-21": {
    students: ["Абдулаев Тимур", "Белов Артём", "Волкова Мария", "Гусев Иван", "Дмитриева Анна", "Егоров Павел"],
    curator: "",
    curatorPhone: ""
  },
  "ИС-22": {
    students: ["Жуков Сергей", "Зайцева Ольга", "Иванов Дмитрий", "Кузнецова Елена", "Лебедев Максим"],
    curator: "",
    curatorPhone: ""
  },
  "ПКС-21": {
    students: ["Морозов Андрей", "Никитина София", "Орлов Виктор", "Петрова Дарья"],
    curator: "",
    curatorPhone: ""
  },
  "ПКС-22": {
    students: ["Романов Илья", "Соколова Вера", "Тимофеев Никита", "Фёдорова Юлия", "Царёв Артём"],
    curator: "",
    curatorPhone: ""
  },
  "ЭК-21": {
    students: ["Чернов Егор", "Шилова Алина", "Щербаков Кирилл"],
    curator: "",
    curatorPhone: ""
  }
};

function normalizeGroups(raw) {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_GROUPS);
  const result = {};
  for (const [name, val] of Object.entries(raw)) {
    if (Array.isArray(val)) {
      result[name] = { students: val, curator: '', curatorPhone: '' };
    } else if (val && typeof val === 'object') {
      result[name] = {
        students: Array.isArray(val.students) ? val.students : [],
        curator: val.curator || '',
        curatorPhone: val.curatorPhone || ''
      };
    }
  }
  return result;
}

// ===== STORAGE =====
function readLocalJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn("Не удалось прочитать localStorage:", key, e);
    return fallback;
  }
}

let GROUPS = normalizeGroups(readLocalJSON('attendanceGroups', null) || structuredClone(DEFAULT_GROUPS));
let data = readLocalJSON('attendanceData', {});
let archive = readLocalJSON('attendanceArchive', {});

// ===== Красивые модалки =====
function showConfirm(title, message) {
  return new Promise(resolve => {
    const old = document.querySelector('.confirm-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" id="confirmCancel">Отмена</button>
          <button class="btn btn-primary" id="confirmOk">Да</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 10);

    const close = (result) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    overlay.querySelector('#confirmOk').onclick = () => close(true);
    overlay.querySelector('#confirmCancel').onclick = () => close(false);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(false);
    };
  });
}

function saveGroups() {
  localStorage.setItem('attendanceGroups', JSON.stringify(GROUPS));
  if (firebaseReady) {
    db.ref('groups').set(GROUPS).catch(err => console.error('Firebase groups:', err));
  }
}

function save() {
  localStorage.setItem('attendanceData', JSON.stringify(data));
  if (firebaseReady) {
    db.ref('attendance').set(data).catch(err => console.error('Firebase attendance:', err));
  }
}

function saveArchive() {
  localStorage.setItem('attendanceArchive', JSON.stringify(archive));
  if (firebaseReady) {
    db.ref('archive').set(archive).catch(err => console.error('Firebase archive:', err));
  }
}

async function initFirebaseData() {
  try {
    const groupsSnap = await db.ref('groups').once('value');
    const attendanceSnap = await db.ref('attendance').once('value');

    const cloudGroups = groupsSnap.val();
    const cloudAttendance = attendanceSnap.val();

    // Только читаем. Пишем в groups/attendance только если есть права (admin).
    if (cloudGroups && typeof cloudGroups === 'object') {
      GROUPS = normalizeGroups(cloudGroups);
    } else if (currentRole === 'admin') {
      await db.ref('groups').set(GROUPS);
    }
    // если не admin и в облаке пусто — остаёмся на локальных GROUPS

    if (cloudAttendance && typeof cloudAttendance === 'object') {
      data = cloudAttendance;
    } else if (Object.keys(data).length > 0 && (currentRole === 'admin' || currentRole === 'checker' || currentRole === 'starosta')) {
      // писать attendance могут admin / checker / starosta
      try {
        await db.ref('attendance').set(data);
      } catch (e) {
        console.warn('Не удалось записать attendance:', e);
      }
    }

    // archive — только для admin, ошибка не ломает старт
    try {
      const archiveSnap = await db.ref('archive').once('value');
      const cloudArchive = archiveSnap.val();
      if (cloudArchive && typeof cloudArchive === 'object') {
        archive = cloudArchive;
      } else if (Object.keys(archive).length > 0 && currentRole === 'admin') {
        await db.ref('archive').set(archive);
      }
    } catch (e) {
      console.warn('Archive недоступен:', e);
    }

    localStorage.setItem('attendanceGroups', JSON.stringify(GROUPS));
    localStorage.setItem('attendanceData', JSON.stringify(data));
    localStorage.setItem('attendanceArchive', JSON.stringify(archive));

    firebaseReady = true;

    // Реалтайм
    db.ref('groups').on('value', snap => {
      const value = snap.val();
      if (!value || typeof value !== 'object') return;
      GROUPS = normalizeGroups(value);
      localStorage.setItem('attendanceGroups', JSON.stringify(GROUPS));
      if (currentGroup && !GROUPS[currentGroup]) currentGroup = null;
      if (!currentGroup) renderHome();
      else renderGroup();
    });

    db.ref('attendance').on('value', snap => {
      const value = snap.val();
      data = (value && typeof value === 'object') ? value : {};
      localStorage.setItem('attendanceData', JSON.stringify(data));
      if (currentGroup) renderViewContent();
    });

    // archive слушаем только если admin (иначе permission denied)
    if (currentRole === 'admin') {
      db.ref('archive').on('value', snap => {
        try {
          const value = snap.val();
          archive = (value && typeof value === 'object') ? value : {};
          localStorage.setItem('attendanceArchive', JSON.stringify(archive));
          const modal = document.getElementById('adminModal');
          if (modal && modal.classList.contains('show')) renderAdminPanel();
        } catch (e) {
          console.warn('Archive listener:', e);
        }
      });
    }

    renderHome();
    showToast('✓ Данные синхронизированы с Firebase');
  } catch (error) {
    console.error('Firebase error:', error);
    firebaseReady = false;
    renderHome();
    showToast('⚠️ Firebase недоступен — работаем локально');
  }
}
async function loadUserRole(uid) {
  try {
    const snap = await db.ref('users/' + uid).once('value');
    const userData = snap.val();

    if (userData && userData.role) {
      currentRole = userData.role;
      currentUserGroup = userData.group || null;
    } else {
      currentRole = 'guest';
      currentUserGroup = null;
    }
  } catch (e) {
    console.error('Ошибка загрузки роли:', e);
    currentRole = 'guest';
    currentUserGroup = null;
  }
}

function updateHeaderUI() {
  const container = document.getElementById('headerActions');
  if (!container) return;

  const iconLogin = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`;

  const iconLogout = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

  if (currentUser) {
    const roleNames = {
      admin: 'Админ',
      checker: 'Проверяющий',
      starosta: 'Староста',
      guest: 'Гость'
    };
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:0.85rem;opacity:0.9;white-space:nowrap;">
          ${roleNames[currentRole] || 'Пользователь'}
        </span>
        <button class="btn-icon" type="button" onclick="logout()" title="Выйти">${iconLogout}</button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button class="btn-icon" type="button" onclick="openLogin()" title="Войти">${iconLogin}</button>
    `;
  }
}

function openLogin() {
  const body = document.getElementById('adminBody');
  const modal = document.getElementById('adminModal');

  body.innerHTML = `
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="loginEmail" placeholder="email@example.com" autofocus>
    </div>
    <div class="form-group">
  <label>Пароль</label>
  <div style="position:relative;">
    <input type="password" id="loginPass" placeholder="Пароль" style="padding-right:46px;width:100%;">
    <button type="button" class="pass-toggle" id="toggleLoginPass" title="Показать пароль">
      <svg viewBox="0 0 24 24" id="eyeIcon" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    </button>
  </div>
</div>
    <button class="btn btn-primary" style="width:100%; margin-top: 8px;" onclick="doLogin()">Войти</button>
    <p style="margin-top: 16px; font-size: 0.85rem; color: var(--text-muted); text-align: center;">
      Нет аккаунта? Обратитесь к администратору
    </p>
  `;

  modal.classList.add('show');

  const eyeOpen = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const eyeOff = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

document.getElementById('toggleLoginPass').onclick = () => {
  const input = document.getElementById('loginPass');
  const btn = document.getElementById('toggleLoginPass');
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = eyeOff;
    btn.title = 'Скрыть пароль';
  } else {
    input.type = 'password';
    btn.innerHTML = eyeOpen;
    btn.title = 'Показать пароль';
  }
};
  document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;

  if (!email || !password) {
    showToast('Введите email и пароль');
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    closeAdmin();
    showToast('Вход выполнен');
  } catch (error) {
    console.error(error);
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      showToast('Неверный email или пароль');
    } else {
      showToast('Ошибка входа: ' + error.message);
    }
  }
}

function logout() {
  auth.signOut();
  showToast('Вы вышли');
}

// ===== STATE =====
let currentGroup = null;
let currentDate = getToday();
let currentView = 'day';

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function shiftDate(days) {
  const d = new Date(currentDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  currentDate = d.toISOString().split('T')[0];
  renderGroup();
}

function shiftMonth(delta) {
  const d = new Date(currentDate + 'T12:00:00');
  d.setMonth(d.getMonth() + delta);
  currentDate = d.toISOString().split('T')[0];
  renderGroup();
}

function shiftWeek(delta) {
  shiftDate(delta * 7);
}

// ===== TOAST =====
function showToast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

// ===== SEARCH =====
const searchInput = document.getElementById('search');
const suggestions = document.getElementById('suggestions');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    suggestions.classList.remove('show');
    return;
  }
  const matches = Object.keys(GROUPS).filter(g => g.toLowerCase().includes(q));
  if (matches.length === 0) {
    suggestions.classList.remove('show');
    return;
  }
  suggestions.innerHTML = matches.map(g =>
    `<div class="suggestion-item" data-group="${g}">
      <span>${g}</span>
      <span>${GROUPS[g].students.length} чел.</span>
    </div>`
  ).join('');
  suggestions.classList.add('show');
});

suggestions.addEventListener('click', e => {
  const item = e.target.closest('.suggestion-item');
  if (!item) return;
  selectGroup(item.dataset.group);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-box')) suggestions.classList.remove('show');
});

function renderHome() {
  currentGroup = null;
  searchInput.value = '';
  const groups = Object.keys(GROUPS).sort();

  if (groups.length === 0) {
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📁</div>
        <p>Нет групп. Добавьте через админ-панель</p>
      </div>`;
    updateHeaderUI();
    return;
  }

  content.innerHTML = `
    <div class="section-title">Группы</div>
    <div class="groups-grid">
      ${groups.map(g => {
        const count = GROUPS[g].students.length;
        const curator = GROUPS[g].curator;
        return `
          <div class="group-card" onclick="selectGroup('${g}')">
            <div class="name">${g}</div>
            <div class="count">${count} студентов</div>
            ${curator ? `<div class="curator-mini">Куратор: ${curator}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;

  updateHeaderUI();  // ← ПОСЛЕ строки, не внутри
}

function selectGroup(groupName) {
  currentGroup = groupName;
  searchInput.value = groupName;
  suggestions.classList.remove('show');
  currentView = 'day';
  renderGroup();
}

function renderGroup() {
  if (!currentGroup || !GROUPS[currentGroup]) {
    renderHome();
    return;
  }

  content.innerHTML = `
    <div class="card">
      <div class="top-bar">
        <button class="exit-btn" onclick="renderHome()">Выход</button>
      </div>
      <div class="group-header">
        <div>
          <h2>${currentGroup}</h2>
        </div>
        <div class="date-picker">
          <label>Дата:</label>
          <input type="date" id="dateInput" value="${currentDate}" min="2023-09-01" max="2030-08-31">
          ${canEditAttendance(currentGroup)
            ? `<button class="btn btn-secondary" onclick="resetDay()">Сбросить</button>`
            : ''}
        </div>
      </div>

      <div class="tabs">
        <button class="tab ${currentView === 'day' ? 'active' : ''}" onclick="setView('day')">День</button>
        <button class="tab ${currentView === 'week' ? 'active' : ''}" onclick="setView('week')">Неделя</button>
        <button class="tab ${currentView === 'month' ? 'active' : ''}" onclick="setView('month')">Месяц</button>
      </div>

      <div id="viewContent"></div>
    </div>
  `;

  document.getElementById('dateInput').addEventListener('change', e => {
    currentDate = e.target.value;
    renderGroup();
  });

  renderViewContent();
  updateHeaderUI();
}

function setView(v) {
  currentView = v;
  renderGroup();
}

function renderViewContent() {
  const el = document.getElementById('viewContent');
  if (!el) return;

  if (currentView === 'day') {
    el.innerHTML = renderDayView();
  } else if (currentView === 'week') {
    el.innerHTML = renderPeriodView('week');
  } else {
    el.innerHTML = renderPeriodView('month');
  }
}

function renderDayView() {
  const students = GROUPS[currentGroup].students;
  const dayData = (data[currentGroup] && data[currentGroup][currentDate]) || {};
  const canEdit = canEditAttendance(currentGroup);
  const curator = GROUPS[currentGroup].curator;
  const curatorPhone = GROUPS[currentGroup].curatorPhone;

  const rows = students.map((name, index) => {
    const isAbsent = !!dayData[name];
    const totalAbsences = countAbsences(currentGroup, name);
    const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const buttonHtml = canEdit
      ? `<button class="toggle-btn ${isAbsent ? 'absent' : 'present'}"
                 onclick="toggleAbsent('${safeName}')">
           ${isAbsent ? '❌ Отсутствует' : '✓ Присутствует'}
         </button>`
      : `<span class="toggle-btn ${isAbsent ? 'absent' : 'present'}" style="cursor:default; opacity:0.85;">
           ${isAbsent ? '❌ Отсутствует' : '✓ Присутствует'}
         </span>`;

    return `
      <div class="student-row ${isAbsent ? 'absent' : ''}">
        <div class="student-num">${index + 1}</div>
        <div class="student-info">
          <span class="student-name">${name}</span>
          <span class="student-stats ${totalAbsences > 0 ? 'has-absences' : ''}">
            ${totalAbsences > 0 ? `Всего пропусков: ${totalAbsences}` : 'Нет пропусков'}
          </span>
        </div>
        ${buttonHtml}
      </div>
    `;
  }).join('');

  const absentCount = Object.values(dayData).filter(Boolean).length;

  const curatorBlock = (curator || curatorPhone) ? `
    <div class="curator-info">
      ${curator ? `<span>Куратор: <strong>${curator}</strong></span>` : ''}
      ${curatorPhone ? `<a href="tel:${curatorPhone.replace(/\s/g, '')}"> ${curatorPhone}</a>` : ''}
    </div>
  ` : '';

  return `
    ${curatorBlock}
    <div class="nav-row">
      <button class="btn btn-nav" onclick="shiftDate(-1)">‹ Пред. день</button>
      <span class="nav-label">${formatDate(currentDate)}</span>
      <button class="btn btn-nav" onclick="shiftDate(1)">След. день ›</button>
    </div>
    ${rows}
    <div class="summary">
      <span>Всего: <strong>${students.length}</strong></span>
      <span>Отсутствует: <strong style="color:var(--danger)">${absentCount}</strong></span>
      <span>Присутствует: <strong style="color:var(--success)">${students.length - absentCount}</strong></span>
    </div>
  `;
}

function getPeriodDates(type) {
  const d = new Date(currentDate + 'T12:00:00');
  let start, end;

  if (type === 'week') {
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    start = new Date(d);
    start.setDate(d.getDate() + diffToMon);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }

  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return { start, end, dates };
}

function renderPeriodView(type) {
  const students = GROUPS[currentGroup].students;
  const { start, end, dates } = getPeriodDates(type);
  const periodLabel = type === 'week'
    ? `${formatDate(start.toISOString().split('T')[0])} – ${formatDate(end.toISOString().split('T')[0])}`
    : start.toLocaleString('ru', { month: 'long', year: 'numeric' });

  // absences[name] = { count, days: ['2024-10-01', ...] }
  const absences = {};
  students.forEach(s => {
    absences[s] = { count: 0, days: [] };
  });

  let totalGroupAbsences = 0;
  const daysWithData = new Set();

  if (data[currentGroup]) {
    dates.forEach(date => {
      const dayData = data[currentGroup][date];
      if (!dayData) return;
      daysWithData.add(date);
      Object.keys(dayData).forEach(name => {
        if (dayData[name] && absences[name]) {
          absences[name].count++;
          absences[name].days.push(date);
          totalGroupAbsences++;
        }
      });
    });
  }

  const sorted = [...students].sort((a, b) => absences[b].count - absences[a].count);

  const rows = sorted.map((name, index) => {
    const { count, days } = absences[name];
    const daysLabel = days.length
      ? days.map(d => formatDate(d)).join(', ')
      : '—';

    return `
      <tr>
        <td class="num-cell">${index + 1}</td>
        <td>
          <div class="period-student-name">${name}</div>
          ${count > 0 ? `<div class="period-days">${daysLabel}</div>` : ''}
        </td>
        <td>
          ${count > 0
            ? `<span class="badge badge-danger">${count}</span>`
            : `<span class="badge badge-ok">0</span>`}
        </td>
      </tr>
    `;
  }).join('');

  const navButtons = type === 'week'
    ? `
      <button class="btn btn-nav" onclick="shiftWeek(-1)">‹ Пред. неделя</button>
      <span class="nav-label">${periodLabel}</span>
      <button class="btn btn-nav" onclick="shiftWeek(1)">След. неделя ›</button>
    `
    : `
      <button class="btn btn-nav" onclick="shiftMonth(-1)">‹ Пред. месяц</button>
      <span class="nav-label">${periodLabel}</span>
      <button class="btn btn-nav" onclick="shiftMonth(1)">След. месяц ›</button>
    `;

  return `
    <div class="report-section">
      <div class="nav-row">${navButtons}</div>
      <div class="report-card">
        <p class="report-meta">
          Дней с отметками: <strong>${daysWithData.size}</strong> ·
          Всего пропусков: <strong style="color:var(--danger)">${totalGroupAbsences}</strong>
        </p>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width:40px">№</th>
              <th>Студент / дни отсутствия</th>
              <th>Пропусков</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="3">Нет данных</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function toggleAbsent(studentName) {
  if (!canEditAttendance(currentGroup)) {
    showToast('У вас нет прав отмечать посещаемость');
    return;
  }

  if (!data[currentGroup]) data[currentGroup] = {};
  if (!data[currentGroup][currentDate]) data[currentGroup][currentDate] = {};

  const day = data[currentGroup][currentDate];
  day[studentName] = !day[studentName];

  if (!day[studentName]) delete day[studentName];
  if (Object.keys(day).length === 0) delete data[currentGroup][currentDate];

  save();
  renderViewContent();
}

function countAbsences(group, student) {
  if (!data[group]) return 0;
  return Object.values(data[group]).filter(day => day[student]).length;
}

async function resetDay() {
  if (!canEditAttendance(currentGroup)) {
    showToast('У вас нет прав сбрасывать отметки');
    return;
  }

  const formatted = formatDate(currentDate);
  const ok = await showConfirm(
    'Сбросить день?',
    `Удалить все отметки посещаемости за <strong>${formatted}</strong>?<br><br>Все «Отсутствует» за этот день будут сняты.`
  );
  if (!ok) return;

  if (data[currentGroup]) {
    delete data[currentGroup][currentDate];
  }
  save();
  renderViewContent();
  showToast(`Отметки за ${formatted} сброшены`);
}

// ===== ADMIN =====
function openAdmin() {
  if (currentRole !== 'admin') {
    showToast('Доступ только для администратора. Войдите через 🔑');
    return;
  }

  const modal = document.getElementById('adminModal');
  modal.classList.add('show');
  renderAdminPanel();
}

function closeAdmin() {
  document.getElementById('adminModal').classList.remove('show');
}

function renderAdminPanel() {
  const body = document.getElementById('adminBody');
  const groupList = Object.keys(GROUPS).sort().map(g => `
    <li>
      <span>
        <strong>${g}</strong> (${GROUPS[g].students.length} чел.)
        ${GROUPS[g].curator ? `<br><small style="color:var(--text-muted)">Куратор: ${GROUPS[g].curator}</small>` : ''}
      </span>
      <span>
        <button class="btn-sm btn-secondary" onclick="editGroup('${g}')">Изменить</button>
        <button class="btn-sm btn-danger" onclick="deleteGroup('${g}')">В архив</button>
      </span>
    </li>
  `).join('');

  const archiveKeys = Object.keys(archive).sort();
  const archiveList = archiveKeys.map(g => {
    const a = archive[g];
    const delDate = a.deletedAt ? formatDate(a.deletedAt.split('T')[0]) : '—';
    const daysCount = a.attendance ? Object.keys(a.attendance).length : 0;
    const studCount = a.students?.length || 0;
    return `
      <li>
        <span>
          <strong>${g}</strong><br>
          <small style="color:var(--text-muted)">${studCount} чел. · ${daysCount} дн. · удал. ${delDate}</small>
        </span>
        <span>
          <button class="btn-sm btn-secondary" onclick="viewArchive('${g}')">История</button>
          <button class="btn-sm btn-secondary" onclick="restoreGroup('${g}')">Вернуть</button>
          <button class="btn-sm btn-danger" onclick="purgeArchive('${g}')">Удалить навсегда</button>
        </span>
      </li>
    `;
  }).join('');

  body.innerHTML = `
    <div class="admin-section">
      <h4>Активные группы</h4>
      <ul class="admin-list">${groupList || '<li>Нет групп</li>'}</ul>
      <button class="btn btn-primary" onclick="addGroup()">+ Новая группа</button>
    </div>

    <div class="admin-section">
      <h4>Архив удалённых групп</h4>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px">
        При удалении группа и её история посещаемости сохраняются здесь.
      </p>
      <ul class="admin-list">${archiveList || '<li>Архив пуст</li>'}</ul>
    </div>

    <div class="admin-section">
      <h4>Пользователи и роли</h4>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px">
        Сначала создай аккаунт в Firebase Console → Authentication → Users.<br>
        Потом здесь назначь роль.
      </p>
      <div id="usersList">Загрузка...</div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="showAddUserRole()">+ Назначить роль</button>
    </div>

    <div class="admin-section">

      <button class="btn btn-danger" onclick="resetAllData()">Сбросить все отметки (активные группы)</button>
    </div>
  `;

  loadUsersList();
}

// ===== УПРАВЛЕНИЕ РОЛЯМИ =====
async function loadUsersList() {
  const container = document.getElementById('usersList');
  if (!container) return;

  try {
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};

    const roleNames = {
      admin: 'Админ',
      checker: 'Отмечающий',
      starosta: 'Староста',
      guest: 'Гость'
    };

    const list = Object.entries(users).map(([uid, u]) => {
      const roleLabel = roleNames[u.role] || u.role;
      const groupInfo = u.role === 'starosta' && u.group ? ` · группа ${u.group}` : '';
      return `
        <li>
          <span>
            <strong>${u.email || uid}</strong><br>
            <small style="color:var(--text-muted)">${roleLabel}${groupInfo}</small>
          </span>
          <span>
            <button class="btn-sm btn-secondary" onclick="editUserRole('${uid}')">Изменить</button>
            <button class="btn-sm btn-danger" onclick="removeUserRole('${uid}')">Удалить роль</button>
          </span>
        </li>
      `;
    }).join('');

    container.innerHTML = `
      <ul class="admin-list">
        ${list || '<li>Пользователей пока нет</li>'}
      </ul>
    `;
  } catch (e) {
    console.error(e);
    container.innerHTML = '<p style="color:var(--danger)">Ошибка загрузки пользователей</p>';
  }
}

function showAddUserRole() {
  const body = document.getElementById('adminBody');
  const groupsOptions = Object.keys(GROUPS).sort()
    .map(g => `<option value="${g}">${g}</option>`).join('');

  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад</button>

    <div class="admin-section">
      <h4>+ Назначить роль</h4>

      <div class="form-group">
        <label>UID пользователя (из Firebase Authentication)</label>
        <input type="text" id="userUid" placeholder="Скопируй UID из Firebase Console">
      </div>

      <div class="form-group">
        <label>Email (для удобства)</label>
        <input type="email" id="userEmail" placeholder="email@example.com">
      </div>

      <div class="form-group">
        <label>Роль</label>
        <select id="userRole">
          <option value="guest">Гость (только просмотр)</option>
          <option value="starosta">Староста</option>
          <option value="checker">Отмечающий</option>
          <option value="admin">Админ</option>
        </select>
      </div>

      <div class="form-group" id="groupSelectWrap" style="display:none">
        <label>Группа (только для старосты)</label>
        <select id="userGroup">
          <option value="">— выберите —</option>
          ${groupsOptions}
        </select>
      </div>

      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveUserRole()">Сохранить</button>
        <button class="btn btn-secondary" onclick="renderAdminPanel()">Отмена</button>
      </div>
    </div>
  `;

  document.getElementById('userRole').addEventListener('change', e => {
    document.getElementById('groupSelectWrap').style.display =
      e.target.value === 'starosta' ? 'block' : 'none';
  });
}

async function saveUserRole(existingUid = null) {
  const uid = existingUid || document.getElementById('userUid').value.trim();
  const email = document.getElementById('userEmail')?.value.trim() || '';
  const role = document.getElementById('userRole').value;
  const group = role === 'starosta'
    ? (document.getElementById('userGroup')?.value || null)
    : null;

  if (!uid) {
    showToast('Укажите UID');
    return;
  }

  if (role === 'starosta' && !group) {
    showToast('Для старосты нужно выбрать группу');
    return;
  }

  try {
    await db.ref('users/' + uid).set({
      email: email || null,
      role,
      group: group || null,
      updatedAt: new Date().toISOString()
    });
    showToast('Роль сохранена');
    renderAdminPanel();
  } catch (e) {
    console.error(e);
    showToast('Ошибка: ' + e.message);
  }
}

async function editUserRole(uid) {
  const snap = await db.ref('users/' + uid).once('value');
  const u = snap.val() || {};
  const groupsOptions = Object.keys(GROUPS).sort()
    .map(g => `<option value="${g}" ${u.group === g ? 'selected' : ''}>${g}</option>`).join('');

  const body = document.getElementById('adminBody');
  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад</button>

    <div class="admin-section">
      <h4>Изменить роль</h4>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">UID: ${uid}</p>

      <div class="form-group">
        <label>Email</label>
        <input type="email" id="userEmail" value="${u.email || ''}">
      </div>

      <div class="form-group">
        <label>Роль</label>
        <select id="userRole">
          <option value="guest" ${u.role === 'guest' ? 'selected' : ''}>Гость</option>
          <option value="starosta" ${u.role === 'starosta' ? 'selected' : ''}>Староста</option>
          <option value="checker" ${u.role === 'checker' ? 'selected' : ''}>Отмечающий</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Админ</option>
        </select>
      </div>

      <div class="form-group" id="groupSelectWrap" style="display:${u.role === 'starosta' ? 'block' : 'none'}">
        <label>Группа (для старосты)</label>
        <select id="userGroup">
          <option value="">— выберите —</option>
          ${groupsOptions}
        </select>
      </div>

      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveUserRole('${uid}')">Сохранить</button>
        <button class="btn btn-secondary" onclick="renderAdminPanel()">Отмена</button>
      </div>
    </div>
  `;

  document.getElementById('userRole').addEventListener('change', e => {
    document.getElementById('groupSelectWrap').style.display =
      e.target.value === 'starosta' ? 'block' : 'none';
  });
}

async function removeUserRole(uid) {
  const ok = await showConfirm('Удалить роль?', 'Пользователь станет гостем (только просмотр).');
  if (!ok) return;

  await db.ref('users/' + uid).remove();
  showToast('Роль удалена');
  renderAdminPanel();
}

function addGroup() {
  const body = document.getElementById('adminBody');
  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад</button>
    <div class="admin-section">
      <h4>+ Новая группа</h4>
      <div class="form-group">
        <label>Название группы</label>
        <input type="text" id="newGroupName" placeholder="Например: ИС-23" autofocus>
      </div>
      <div class="form-group">
        <label>Куратор (ФИО)</label>
        <input type="text" id="newGroupCurator" placeholder="Иванова Мария Петровна">
      </div>
      <div class="form-group">
        <label>Телефон куратора</label>
        <input type="tel" id="newGroupPhone" placeholder="+7 900 123-45-67">
      </div>
      <div class="form-group">
        <label>Студенты (каждый с новой строки, можно с отчеством)</label>
        <textarea id="newGroupStudents" style="min-height:180px" placeholder="Иванов Иван Иванович&#10;Петрова Анна Сергеевна"></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="createNewGroup()">Создать группу</button>
        <button class="btn btn-secondary" onclick="renderAdminPanel()">Отмена</button>
      </div>
    </div>
  `;
}

function createNewGroup() {
  const nameInput = document.getElementById('newGroupName').value.trim();
  const studentsText = document.getElementById('newGroupStudents').value;
  const curator = document.getElementById('newGroupCurator').value.trim();
  const curatorPhone = document.getElementById('newGroupPhone').value.trim();

  if (!nameInput) {
    showToast('Введите название группы');
    return;
  }

  const key = nameInput.toUpperCase();

  if (GROUPS[key]) {
    showToast('Группа с таким названием уже существует');
    return;
  }

  if (archive[key]) {
    if (!confirm(`Группа ${key} есть в архиве. Восстановить её?`)) return;
    restoreGroup(key);
    return;
  }

  const list = studentsText.split('\n').map(s => s.trim()).filter(Boolean);

  GROUPS[key] = {
    students: list,
    curator,
    curatorPhone
  };
  saveGroups();
  renderAdminPanel();
  showToast(`Группа ${key} создана (${list.length} студентов)`);

  if (!currentGroup) renderHome();
}

function editGroup(groupName) {
  const g = GROUPS[groupName] || { students: [], curator: '', curatorPhone: '' };
  const body = document.getElementById('adminBody');

  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад</button>
    <div class="admin-section">
      <h4>Редактирование: ${groupName}</h4>
      <div class="form-group">
        <label>Куратор (ФИО)</label>
        <input type="text" id="editCurator" value="${(g.curator || '').replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label>Телефон куратора</label>
        <input type="tel" id="editPhone" value="${(g.curatorPhone || '').replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label>Список студентов (каждый с новой строки)</label>
        <textarea id="studentsText" style="min-height:220px;font-size:15px">${(g.students || []).join('\n')}</textarea>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-primary" onclick="saveGroupStudents('${groupName}')">Сохранить</button>
        <button class="btn btn-secondary" onclick="renderAdminPanel()">Отмена</button>
      </div>
    </div>
  `;
}

function saveGroupStudents(groupName) {
  const list = document.getElementById('studentsText').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const curator = document.getElementById('editCurator').value.trim();
  const curatorPhone = document.getElementById('editPhone').value.trim();

  GROUPS[groupName] = {
    students: list,
    curator,
    curatorPhone
  };
  saveGroups();
  renderAdminPanel();
  showToast(`Группа ${groupName} обновлена (${list.length} чел.)`);

  if (currentGroup === groupName) {
    renderGroup();
  } else if (!currentGroup) {
    renderHome();
  }
}

async function deleteGroup(groupName) {
  const ok = await showConfirm(
    'В архив?',
    `Переместить группу <strong>${groupName}</strong> в архив?<br><br>История посещаемости сохранится.`
  );
  if (!ok) return;

  archive[groupName] = {
    students: GROUPS[groupName]?.students ? [...GROUPS[groupName].students] : [],
    curator: GROUPS[groupName]?.curator || '',
    curatorPhone: GROUPS[groupName]?.curatorPhone || '',
    attendance: data[groupName] ? structuredClone(data[groupName]) : {},
    deletedAt: new Date().toISOString()
  };
  saveArchive();

  delete GROUPS[groupName];
  if (data[groupName]) delete data[groupName];
  saveGroups();
  save();

  renderAdminPanel();
  showToast('Группа перемещена в архив');

  if (currentGroup === groupName || !currentGroup) {
    renderHome();
  }
}

async function restoreGroup(groupName) {
  if (!archive[groupName]) return;

  if (GROUPS[groupName]) {
    await showConfirm('Ошибка', 'Такая группа уже есть среди активных');
    return;
  }

  const ok = await showConfirm(
    'Восстановить группу?',
    `Вернуть группу <strong>${groupName}</strong> из архива?`
  );
  if (!ok) return;

  const a = archive[groupName];
  GROUPS[groupName] = {
    students: a.students || [],
    curator: a.curator || '',
    curatorPhone: a.curatorPhone || ''
  };
  if (a.attendance && Object.keys(a.attendance).length) {
    data[groupName] = structuredClone(a.attendance);
  }
  delete archive[groupName];

  saveGroups();
  save();
  saveArchive();
  renderAdminPanel();
  showToast('Группа восстановлена');
  if (!currentGroup) renderHome();
}

async function purgeArchive(groupName) {
  const ok = await showConfirm(
    'Удалить навсегда?',
    `Удалить группу <strong>${groupName}</strong> из архива навсегда?<br><br>История посещаемости будет потеряна.`
  );
  if (!ok) return;

  delete archive[groupName];
  saveArchive();
  renderAdminPanel();
  showToast('Удалено из архива навсегда');
}

function viewArchive(groupName) {
  const a = archive[groupName];
  if (!a) return;

  const attendance = a.attendance || {};
  const students = a.students || [];
  const dates = Object.keys(attendance).sort().reverse();

  const totals = {};
  students.forEach(s => totals[s] = 0);
  dates.forEach(date => {
    const day = attendance[date] || {};
    Object.keys(day).forEach(name => {
      if (day[name]) {
        if (totals[name] === undefined) totals[name] = 0;
        totals[name]++;
      }
    });
  });

  const sorted = [...students].sort((x, y) => (totals[y] || 0) - (totals[x] || 0));
  Object.keys(totals).forEach(n => {
    if (!students.includes(n)) sorted.push(n);
  });

  const rows = sorted.map((name, index) => {
    const cnt = totals[name] || 0;
    return `<tr>
      <td class="num-cell">${index + 1}</td>
      <td>${name}</td>
      <td>${cnt > 0 ? `<span class="badge badge-danger">${cnt}</span>` : `<span class="badge badge-ok">0</span>`}</td>
    </tr>`;
  }).join('');

  const dayRows = dates.slice(0, 60).map(date => {
    const day = attendance[date] || {};
    const absent = Object.keys(day).filter(n => day[n]);
    return `<tr>
      <td>${formatDate(date)}</td>
      <td>${absent.length ? absent.join(', ') : '—'}</td>
    </tr>`;
  }).join('');

  const body = document.getElementById('adminBody');
  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад в админку</button>
    <div class="admin-section">
      <h4>🗄️ Архив: ${groupName}</h4>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">
        Удалена: ${a.deletedAt ? formatDate(a.deletedAt.split('T')[0]) : '—'} ·
        Дней с отметками: ${dates.length}
        ${a.curator ? ` · Куратор: ${a.curator}` : ''}
      </p>
      <h4 style="margin-top:12px;margin-bottom:8px">Пропуски по студентам (всё время)</h4>
      <table class="report-table">
        <thead><tr><th style="width:40px">№</th><th>Студент</th><th>Пропусков</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3">Нет данных</td></tr>'}</tbody>
      </table>
      <h4 style="margin-top:18px;margin-bottom:8px">По дням (последние 60)</h4>
      <table class="report-table">
        <thead><tr><th>Дата</th><th>Отсутствовали</th></tr></thead>
        <tbody>${dayRows || '<tr><td colspan="2">Нет отметок</td></tr>'}</tbody>
      </table>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="restoreGroup('${groupName}')">Вернуть группу</button>
        <button class="btn btn-danger" onclick="purgeArchive('${groupName}')">Удалить навсегда</button>
      </div>
    </div>
  `;
}

async function resetAllData() {
  const ok = await showConfirm(
    'Сбросить все отметки?',
    'Удалить <strong>ВСЕ</strong> отметки посещаемости у активных групп?<br><br>Группы и архив останутся.'
  );
  if (!ok) return;

  data = {};
  save();
  showToast('Все отметки активных групп сброшены');
  if (currentGroup) renderGroup();
}

// Close modal on overlay click
document.getElementById('adminModal').addEventListener('click', e => {
  if (e.target.id === 'adminModal') closeAdmin();
});

// ===== INIT =====
const content = document.getElementById('content');
renderHome();
initFirebaseData();
// ===== СЛЕДИМ ЗА ВХОДОМ / ВЫХОДОМ =====
auth.onAuthStateChanged(async (user) => {
  currentUser = user;

  if (user) {
    await loadUserRole(user.uid);
  } else {
    currentRole = 'guest';
    currentUserGroup = null;
  }

  updateHeaderUI();

  if (currentGroup && GROUPS[currentGroup]) {
    renderGroup();
  } else {
    renderHome();
  }
});

  if (currentRole === 'starosta') {
    return currentUserGroup === groupName;
  }

  return false; // guest и всё остальное
}
// Текущий пользователь и его роль
let currentUser = null;          // объект Firebase User
let currentRole = 'guest';       // guest | starosta | checker | admin
let currentUserGroup = null;     // для старосты — какая группа разрешена

// ===== DATABASE =====
const DEFAULT_GROUPS = {
  "ИС-21": ["Абдулаев Тимур", "Белов Артём", "Волкова Мария", "Гусев Иван", "Дмитриева Анна", "Егоров Павел"],
  "ИС-22": ["Жуков Сергей", "Зайцева Ольга", "Иванов Дмитрий", "Кузнецова Елена", "Лебедев Максим"],
  "ПКС-21": ["Морозов Андрей", "Никитина София", "Орлов Виктор", "Петрова Дарья"],
  "ПКС-22": ["Романов Илья", "Соколова Вера", "Тимофеев Никита", "Фёдорова Юлия", "Царёв Артём"],
  "ЭК-21": ["Чернов Егор", "Шилова Алина", "Щербаков Кирилл"]
};



// ===== STORAGE =====
function readLocalJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn("Не удалось прочитать localStorage:", key, e);
    return fallback;
  }
}

let GROUPS = readLocalJSON('attendanceGroups', null) || structuredClone(DEFAULT_GROUPS);
let data = readLocalJSON('attendanceData', {});
let archive = readLocalJSON('attendanceArchive', {});
// ===== Красивые модалки вместо alert/confirm =====
function showConfirm(title, message) {
  return new Promise(resolve => {
    const old = document.querySelector('.confirm-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" id="confirmCancel">Отмена</button>
          <button class="btn btn-primary" id="confirmOk">Да</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 10);

    const close = (result) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    overlay.querySelector('#confirmOk').onclick = () => close(true);
    overlay.querySelector('#confirmCancel').onclick = () => close(false);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(false);
    };
  });
}
function saveGroups() {
  localStorage.setItem('attendanceGroups', JSON.stringify(GROUPS));
  if (firebaseReady) {
    db.ref('groups').set(GROUPS).catch(err => console.error('Firebase groups:', err));
  }
}

function save() {
  localStorage.setItem('attendanceData', JSON.stringify(data));
  if (firebaseReady) {
    db.ref('attendance').set(data).catch(err => console.error('Firebase attendance:', err));
  }
}

function saveArchive() {
  localStorage.setItem('attendanceArchive', JSON.stringify(archive));
  if (firebaseReady) {
    db.ref('archive').set(archive).catch(err => console.error('Firebase archive:', err));
  }
}

async function initFirebaseData() {
  try {
    const groupsSnap = await db.ref('groups').once('value');
const attendanceSnap = await db.ref('attendance').once('value');
const archiveSnap = await db.ref('archive').once('value');

const cloudGroups = groupsSnap.val();
const cloudAttendance = attendanceSnap.val();
const cloudArchive = archiveSnap.val();

if (cloudGroups && typeof cloudGroups === 'object') {
  GROUPS = cloudGroups;
} else {
  await db.ref('groups').set(GROUPS);
}

if (cloudAttendance && typeof cloudAttendance === 'object') {
  data = cloudAttendance;
} else if (Object.keys(data).length > 0) {
  await db.ref('attendance').set(data);
}

if (cloudArchive && typeof cloudArchive === 'object') {
  archive = cloudArchive;
} else if (Object.keys(archive).length > 0) {
  await db.ref('archive').set(archive);
}

    localStorage.setItem('attendanceGroups', JSON.stringify(GROUPS));
    localStorage.setItem('attendanceData', JSON.stringify(data));
    localStorage.setItem('attendanceArchive', JSON.stringify(archive));

    firebaseReady = true;

    // Реалтайм-синхронизация
    db.ref('groups').on('value', snap => {
      const value = snap.val();
      if (!value || typeof value !== 'object') return;
      GROUPS = value;
      localStorage.setItem('attendanceGroups', JSON.stringify(GROUPS));
      if (currentGroup && !GROUPS[currentGroup]) {
        currentGroup = null;
      }
      if (!currentGroup) {
        renderHome();
      } else {
        renderGroup();
        
      }
    });

    db.ref('attendance').on('value', snap => {
      const value = snap.val();
      data = (value && typeof value === 'object') ? value : {};
      localStorage.setItem('attendanceData', JSON.stringify(data));
      if (currentGroup) {
        renderViewContent();
      }
    });

    db.ref('archive').on('value', snap => {
      const value = snap.val();
      archive = (value && typeof value === 'object') ? value : {};
      localStorage.setItem('attendanceArchive', JSON.stringify(archive));
      if (currentRole === 'admin') {
  const modal = document.getElementById('adminModal');
  if (modal && modal.classList.contains('show')) renderAdminPanel();
}
    });

    renderHome();
    showToast('✓ Данные синхронизированы с Firebase');
  } catch (error) {
    console.error('Firebase error:', error);
    firebaseReady = false;
    renderHome();
    showToast('⚠️ Firebase недоступен — работаем локально');
  }
}

// ===== STATE =====
let currentGroup = null;
// ===== АВТОРИЗАЦИЯ =====

// Следим за входом/выходом
auth.onAuthStateChanged(async (user) => {
  currentUser = user;

  if (user) {
    // Пользователь вошёл — загружаем его роль
    await loadUserRole(user.uid);
  } else {
    // Пользователь вышел
    currentRole = 'guest';
    currentUserGroup = null;
  }

  updateHeaderUI();
  // Обновляем интерфейс, если нужно
  if (currentGroup) {
    renderGroup();
  } else {
    renderHome();
  }
});

// Загружаем роль пользователя из базы
async function loadUserRole(uid) {
  try {
    const snap = await db.ref('users/' + uid).once('value');
    const userData = snap.val();

    if (userData && userData.role) {
      currentRole = userData.role;               // admin / checker / starosta
      currentUserGroup = userData.group || null; // только для старосты
    } else {
      // Если роли нет — считаем гостем
      currentRole = 'guest';
      currentUserGroup = null;
    }
  } catch (e) {
    console.error('Ошибка загрузки роли:', e);
    currentRole = 'guest';
    currentUserGroup = null;
  }
}

// Обновляем кнопки в шапке
function updateHeaderUI() {
  const container = document.getElementById('headerActions');
  if (!container) return;

  if (currentUser) {
    // Пользователь вошёл
    const roleNames = {
      admin: 'Админ',
      checker: 'Проверяющий',
      starosta: 'Староста',
      guest: 'Гость'
    };

    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 0.85rem; opacity: 0.9;">
          ${roleNames[currentRole] || 'Пользователь'}
        </span>
        <button class="btn-icon" onclick="logout()" title="Выйти">🚪</button>
      </div>
    `;
  } else {
    // Гость
    container.innerHTML = `
      <button class="btn-icon" onclick="openLogin()" title="Войти">🔑</button>
    `;
  }
}

// Открыть окно входа
function openLogin() {
  const body = document.getElementById('adminBody');
  const modal = document.getElementById('adminModal');

  body.innerHTML = `
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="loginEmail" placeholder="email@example.com" autofocus>
    </div>
    <div class="form-group">
      <label>Пароль</label>
      <div style="position: relative;">
        <input type="password" id="loginPass" placeholder="Пароль" style="padding-right: 46px;">
        <button type="button" id="toggleLoginPass"
                style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
                       background: none; border: none; cursor: pointer; font-size: 1.2rem; color: var(--text-muted);">
          👁
        </button>
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%; margin-top: 8px;" onclick="doLogin()">Войти</button>
    <p style="margin-top: 16px; font-size: 0.85rem; color: var(--text-muted); text-align: center;">
      Нет аккаунта? Обратитесь к администратору
    </p>
  `;

  modal.classList.add('show');

  // Показать/скрыть пароль
  document.getElementById('toggleLoginPass').onclick = () => {
    const input = document.getElementById('loginPass');
    const btn = document.getElementById('toggleLoginPass');
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🙈';
    } else {
      input.type = 'password';
      btn.textContent = '👁';
    }
  };

  // Enter для входа
  document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
}

// Вход
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;

  if (!email || !password) {
    showToast('Введите email и пароль');
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    closeAdmin();
    showToast('Вход выполнен');
  } catch (error) {
    console.error(error);
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      showToast('Неверный email или пароль');
    } else {
      showToast('Ошибка входа: ' + error.message);
    }
  }
}

// Выход
function logout() {
  auth.signOut();
  showToast('Вы вышли');
}
let currentDate = getToday();
let currentView = 'day'; // day | week | month

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function shiftDate(days) {
  const d = new Date(currentDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  currentDate = d.toISOString().split('T')[0];
  renderGroup();
}

function shiftMonth(delta) {
  const d = new Date(currentDate + 'T12:00:00');
  d.setMonth(d.getMonth() + delta);
  currentDate = d.toISOString().split('T')[0];
  renderGroup();
}

function shiftWeek(delta) {
  shiftDate(delta * 7);
}

// ===== TOAST =====
function showToast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

// ===== SEARCH =====
const searchInput = document.getElementById('search');
const suggestions = document.getElementById('suggestions');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    suggestions.classList.remove('show');
    return;
  }
  const matches = Object.keys(GROUPS).filter(g => g.toLowerCase().includes(q));
  if (matches.length === 0) {
    suggestions.classList.remove('show');
    return;
  }
  suggestions.innerHTML = matches.map(g =>
    `<div class="suggestion-item" data-group="${g}">
      <span>${g}</span>
      <span>${GROUPS[g].length} чел.</span>
    </div>`
  ).join('');
  suggestions.classList.add('show');
});

suggestions.addEventListener('click', e => {
  const item = e.target.closest('.suggestion-item');
  if (!item) return;
  selectGroup(item.dataset.group);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-box')) suggestions.classList.remove('show');
});

function renderHome() {
  currentGroup = null;
  searchInput.value = '';
  const groups = Object.keys(GROUPS).sort();

  if (groups.length === 0) {
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📁</div>
        <p>Нет групп. Добавьте через админ-панель</p>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="section-title">Группы</div>
    <div class="groups-grid">
      ${groups.map(g => `
        <div class="group-card" onclick="selectGroup('${g}')">
          <div class="name">${g}</div>
          <div class="count">${GROUPS[g].length} студентов</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ===== SELECT GROUP =====
function selectGroup(groupName) {
  currentGroup = groupName;
  searchInput.value = groupName;
  suggestions.classList.remove('show');
  currentView = 'day';
  renderGroup();
}

function renderGroup() {
  
  if (!currentGroup || !GROUPS[currentGroup]) {
    renderHome();
    return;
  }

  content.innerHTML = `
    <div class="card">
      <div class="top-bar">
        <button class="exit-btn" onclick="renderHome()">Выход</button>
      </div>
      <div class="group-header">
        <div>
          <h2>${currentGroup}</h2>
        </div>
        <div class="date-picker">
  <label>Дата:</label>
  <input type="date" id="dateInput" value="${currentDate}" min="2023-09-01" max="2030-08-31">
  ${canEditAttendance(currentGroup)
    ? `<button class="btn btn-secondary" onclick="resetDay()">Сбросить</button>`
    : ''}
</div>
      </div>

      <div class="tabs">
        <button class="tab ${currentView === 'day' ? 'active' : ''}" onclick="setView('day')">День</button>
        <button class="tab ${currentView === 'week' ? 'active' : ''}" onclick="setView('week')">Неделя</button>
        <button class="tab ${currentView === 'month' ? 'active' : ''}" onclick="setView('month')">Месяц</button>
      </div>

      <div id="viewContent"></div>
    </div>
  `;

  document.getElementById('dateInput').addEventListener('change', e => {
    currentDate = e.target.value;
    renderGroup();
  });

  renderViewContent();
}

function setView(v) {
  currentView = v;
  // Перерисовываем весь блок группы, чтобы вкладки обновились корректно
  renderGroup();
}

function renderViewContent() {
  const el = document.getElementById('viewContent');
  if (!el) return;

  if (currentView === 'day') {
    el.innerHTML = renderDayView();
  } else if (currentView === 'week') {
    el.innerHTML = renderPeriodView('week');
  } else {
    el.innerHTML = renderPeriodView('month');
  }
}

// ===== DAY VIEW =====
function renderDayView() {
  const students = GROUPS[currentGroup];
  const dayData = (data[currentGroup] && data[currentGroup][currentDate]) || {};
  const canEdit = canEditAttendance(currentGroup);

  const rows = students.map(name => {
    const isAbsent = !!dayData[name];
    const totalAbsences = countAbsences(currentGroup, name);
    const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    // Если можно редактировать — кнопка, иначе просто текст
    const buttonHtml = canEdit
      ? `<button class="toggle-btn ${isAbsent ? 'absent' : 'present'}"
                 onclick="toggleAbsent('${safeName}')">
           ${isAbsent ? '❌ Отсутствует' : '✓ Присутствует'}
         </button>`
      : `<span class="toggle-btn ${isAbsent ? 'absent' : 'present'}" style="cursor:default; opacity:0.85;">
           ${isAbsent ? '❌ Отсутствует' : '✓ Присутствует'}
         </span>`;

    return `
      <div class="student-row ${isAbsent ? 'absent' : ''}">
        <div class="student-info">
          <span class="student-name">${name}</span>
          <span class="student-stats ${totalAbsences > 0 ? 'has-absences' : ''}">
            ${totalAbsences > 0 ? `Всего пропусков: ${totalAbsences}` : 'Нет пропусков'}
          </span>
        </div>
        ${buttonHtml}
      </div>
    `;
  }).join('');

  const absentCount = Object.values(dayData).filter(Boolean).length;

  return `
    <div class="nav-row">
      <button class="btn btn-nav" onclick="shiftDate(-1)">‹ Пред. день</button>
      <span class="nav-label">${formatDate(currentDate)}</span>
      <button class="btn btn-nav" onclick="shiftDate(1)">След. день ›</button>
    </div>
    ${rows}
    <div class="summary">
      <span>Всего: <strong>${students.length}</strong></span>
      <span>Отсутствует: <strong style="color:var(--danger)">${absentCount}</strong></span>
      <span>Присутствует: <strong style="color:var(--success)">${students.length - absentCount}</strong></span>
    </div>
  `;
}
// ===== PERIOD VIEWS =====
function getPeriodDates(type) {
  const d = new Date(currentDate + 'T12:00:00');
  let start, end;

  if (type === 'week') {
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    start = new Date(d);
    start.setDate(d.getDate() + diffToMon);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }

  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return { start, end, dates };
}

function renderPeriodView(type) {
  const students = GROUPS[currentGroup];
  const { start, end, dates } = getPeriodDates(type);
  const periodLabel = type === 'week'
    ? `${formatDate(start.toISOString().split('T')[0])} – ${formatDate(end.toISOString().split('T')[0])}`
    : start.toLocaleString('ru', { month: 'long', year: 'numeric' });

  const absences = {};
  students.forEach(s => absences[s] = 0);

  let totalGroupAbsences = 0;
  const daysWithData = new Set();

  if (data[currentGroup]) {
    dates.forEach(date => {
      const dayData = data[currentGroup][date];
      if (!dayData) return;
      daysWithData.add(date);
      Object.keys(dayData).forEach(name => {
        if (dayData[name] && absences[name] !== undefined) {
          absences[name]++;
          totalGroupAbsences++;
        }
      });
    });
  }

  const sorted = [...students].sort((a, b) => absences[b] - absences[a]);

  const rows = sorted.map(name => {
    const cnt = absences[name];
    return `
      <tr>
        <td>${name}</td>
        <td>
          ${cnt > 0
            ? `<span class="badge badge-danger">${cnt}</span>`
            : `<span class="badge badge-ok">0</span>`}
        </td>
      </tr>
    `;
  }).join('');

  const navButtons = type === 'week'
    ? `
      <button class="btn btn-nav" onclick="shiftWeek(-1)">‹ Пред. неделя</button>
      <span class="nav-label">${periodLabel}</span>
      <button class="btn btn-nav" onclick="shiftWeek(1)">След. неделя ›</button>
    `
    : `
      <button class="btn btn-nav" onclick="shiftMonth(-1)">‹ Пред. месяц</button>
      <span class="nav-label">${periodLabel}</span>
      <button class="btn btn-nav" onclick="shiftMonth(1)">След. месяц ›</button>
    `;

  return `
    <div class="report-section">
      <div class="nav-row">${navButtons}</div>
      <div class="report-card">
        <p class="report-meta">
          Дней с отметками: <strong>${daysWithData.size}</strong> ·
          Всего пропусков: <strong style="color:var(--danger)">${totalGroupAbsences}</strong>
        </p>
        <table class="report-table">
          <thead>
            <tr>
              <th>Студент</th>
              <th>Пропусков</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="2">Нет данных</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function toggleAbsent(studentName) {
  if (!canEditAttendance(currentGroup)) {
    showToast('У вас нет прав отмечать посещаемость');
    return;
  }

  if (!data[currentGroup]) data[currentGroup] = {};
  if (!data[currentGroup][currentDate]) data[currentGroup][currentDate] = {};

  const day = data[currentGroup][currentDate];
  day[studentName] = !day[studentName];

  if (!day[studentName]) delete day[studentName];
  if (Object.keys(day).length === 0) delete data[currentGroup][currentDate];

  save();
  renderViewContent();
}

function countAbsences(group, student) {
  if (!data[group]) return 0;
  return Object.values(data[group]).filter(day => day[student]).length;
}

async function resetDay() {
  if (!canEditAttendance(currentGroup)) {
    showToast('У вас нет прав сбрасывать отметки');
    return;
  }

  const formatted = formatDate(currentDate);
  const ok = await showConfirm(
    'Сбросить день?',
    `Удалить все отметки посещаемости за <strong>${formatted}</strong>?<br><br>Все «Отсутствует» за этот день будут сняты.`
  );
  if (!ok) return;

  if (data[currentGroup]) {
    delete data[currentGroup][currentDate];
  }
  save();
  renderViewContent();
  showToast(`Отметки за ${formatted} сброшены`);
}
function openAdmin() {
  if (currentRole !== 'admin') {
    showToast('Доступ только для администратора. Войдите через 🔑');
    return;
  }

  const modal = document.getElementById('adminModal');
  modal.classList.add('show');
  renderAdminPanel();
}

function closeAdmin() {
  document.getElementById('adminModal').classList.remove('show');
}



function renderAdminPanel() {
  const body = document.getElementById('adminBody');
  const groupList = Object.keys(GROUPS).sort().map(g => `
    <li>
      <span><strong>${g}</strong> (${GROUPS[g].length} чел.)</span>
      <span>
        <button class="btn-sm btn-secondary" onclick="editGroup('${g}')">Изменить</button>
        <button class="btn-sm btn-danger" onclick="deleteGroup('${g}')">В архив</button>
      </span>
    </li>
  `).join('');

  const archiveKeys = Object.keys(archive).sort();
  const archiveList = archiveKeys.map(g => {
    const a = archive[g];
    const delDate = a.deletedAt ? formatDate(a.deletedAt.split('T')[0]) : '—';
    const daysCount = a.attendance ? Object.keys(a.attendance).length : 0;
    return `
      <li>
        <span>
          <strong>${g}</strong><br>
          <small style="color:var(--text-muted)">${a.students?.length || 0} чел. · ${daysCount} дн. · удал. ${delDate}</small>
        </span>
        <span>
          <button class="btn-sm btn-secondary" onclick="viewArchive('${g}')">История</button>
          <button class="btn-sm btn-secondary" onclick="restoreGroup('${g}')">Вернуть</button>
          <button class="btn-sm btn-danger" onclick="purgeArchive('${g}')">Удалить навсегда</button>
        </span>
      </li>
    `;
  }).join('');

  body.innerHTML = `
    <div class="admin-section">
      <h4>📁 Активные группы</h4>
      <ul class="admin-list">${groupList || '<li>Нет групп</li>'}</ul>
      <button class="btn btn-primary" onclick="addGroup()">+ Новая группа</button>
    </div>

    <div class="admin-section">
      <h4>🗄️ Архив удалённых групп</h4>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px">
        При удалении группа и её история посещаемости сохраняются здесь.
      </p>
      <ul class="admin-list">${archiveList || '<li>Архив пуст</li>'}</ul>
    </div>
    <div class="admin-section">
      <h4>👥 Пользователи и роли</h4>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px">
        Сначала создай аккаунт в Firebase Console → Authentication → Users.<br>
        Потом здесь назначь роль.
      </p>
      <div id="usersList">Загрузка...</div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="showAddUserRole()">+ Назначить роль</button>
    </div>
    <div class="admin-section">
      <h4>⚠️ Опасная зона</h4>
      <button class="btn btn-danger" onclick="resetAllData()">Сбросить все отметки (активные группы)</button>
    </div>
      loadUsersList();

    
  `;
}
// ===== УПРАВЛЕНИЕ РОЛЯМИ =====
async function loadUsersList() {
  const container = document.getElementById('usersList');
  if (!container) return;

  try {
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};

    const roleNames = {
      admin: 'Админ',
      checker: 'Отмечающий',
      starosta: 'Староста',
      guest: 'Гость'
    };

    const list = Object.entries(users).map(([uid, u]) => {
      const roleLabel = roleNames[u.role] || u.role;
      const groupInfo = u.role === 'starosta' && u.group ? ` · группа ${u.group}` : '';
      return `
        <li>
          <span>
            <strong>${u.email || uid}</strong><br>
            <small style="color:var(--text-muted)">${roleLabel}${groupInfo}</small>
          </span>
          <span>
            <button class="btn-sm btn-secondary" onclick="editUserRole('${uid}')">Изменить</button>
            <button class="btn-sm btn-danger" onclick="removeUserRole('${uid}')">Удалить роль</button>
          </span>
        </li>
      `;
    }).join('');

    container.innerHTML = `
      <ul class="admin-list">
        ${list || '<li>Пользователей пока нет</li>'}
      </ul>
    `;
  } catch (e) {
    console.error(e);
    container.innerHTML = '<p style="color:var(--danger)">Ошибка загрузки пользователей</p>';
  }
}

function showAddUserRole() {
  const body = document.getElementById('adminBody');
  const groupsOptions = Object.keys(GROUPS).sort()
    .map(g => `<option value="${g}">${g}</option>`).join('');

  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад</button>

    <div class="admin-section">
      <h4>+ Назначить роль</h4>

      <div class="form-group">
        <label>UID пользователя (из Firebase Authentication)</label>
        <input type="text" id="userUid" placeholder="Скопируй UID из Firebase Console">
      </div>

      <div class="form-group">
        <label>Email (для удобства)</label>
        <input type="email" id="userEmail" placeholder="email@example.com">
      </div>

      <div class="form-group">
        <label>Роль</label>
        <select id="userRole">
          <option value="guest">Гость (только просмотр)</option>
          <option value="starosta">Староста</option>
          <option value="checker">Отмечающий</option>
          <option value="admin">Админ</option>
        </select>
      </div>

      <div class="form-group" id="groupSelectWrap" style="display:none">
        <label>Группа (только для старосты)</label>
        <select id="userGroup">
          <option value="">— выберите —</option>
          ${groupsOptions}
        </select>
      </div>

      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveUserRole()">Сохранить</button>
        <button class="btn btn-secondary" onclick="renderAdminPanel()">Отмена</button>
      </div>
    </div>
  `;

  document.getElementById('userRole').addEventListener('change', e => {
    document.getElementById('groupSelectWrap').style.display =
      e.target.value === 'starosta' ? 'block' : 'none';
  });
}

async function saveUserRole(existingUid = null) {
  const uid = existingUid || document.getElementById('userUid').value.trim();
  const email = document.getElementById('userEmail')?.value.trim() || '';
  const role = document.getElementById('userRole').value;
  const group = role === 'starosta'
    ? (document.getElementById('userGroup')?.value || null)
    : null;

  if (!uid) {
    showToast('Укажите UID');
    return;
  }

  if (role === 'starosta' && !group) {
    showToast('Для старосты нужно выбрать группу');
    return;
  }

  try {
    await db.ref('users/' + uid).set({
      email: email || null,
      role,
      group: group || null,
      updatedAt: new Date().toISOString()
    });
    showToast('Роль сохранена');
    renderAdminPanel();
  } catch (e) {
    console.error(e);
    showToast('Ошибка: ' + e.message);
  }
}

async function editUserRole(uid) {
  const snap = await db.ref('users/' + uid).once('value');
  const u = snap.val() || {};
  const groupsOptions = Object.keys(GROUPS).sort()
    .map(g => `<option value="${g}" ${u.group === g ? 'selected' : ''}>${g}</option>`).join('');

  const body = document.getElementById('adminBody');
  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад</button>

    <div class="admin-section">
      <h4>Изменить роль</h4>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">UID: ${uid}</p>

      <div class="form-group">
        <label>Email</label>
        <input type="email" id="userEmail" value="${u.email || ''}">
      </div>

      <div class="form-group">
        <label>Роль</label>
        <select id="userRole">
          <option value="guest" ${u.role === 'guest' ? 'selected' : ''}>Гость</option>
          <option value="starosta" ${u.role === 'starosta' ? 'selected' : ''}>Староста</option>
          <option value="checker" ${u.role === 'checker' ? 'selected' : ''}>Отмечающий</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Админ</option>
        </select>
      </div>

      <div class="form-group" id="groupSelectWrap" style="display:${u.role === 'starosta' ? 'block' : 'none'}">
        <label>Группа (для старосты)</label>
        <select id="userGroup">
          <option value="">— выберите —</option>
          ${groupsOptions}
        </select>
      </div>

      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveUserRole('${uid}')">Сохранить</button>
        <button class="btn btn-secondary" onclick="renderAdminPanel()">Отмена</button>
      </div>
    </div>
  `;

  document.getElementById('userRole').addEventListener('change', e => {
    document.getElementById('groupSelectWrap').style.display =
      e.target.value === 'starosta' ? 'block' : 'none';
  });
}

async function removeUserRole(uid) {
  const ok = await showConfirm('Удалить роль?', 'Пользователь станет гостем (только просмотр).');
  if (!ok) return;

  await db.ref('users/' + uid).remove();
  showToast('Роль удалена');
  renderAdminPanel();
}
function addGroup() {
  const body = document.getElementById('adminBody');

  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад</button>
    
    <div class="admin-section">
      <h4>+ Новая группа</h4>
      
      <div class="form-group">
        <label>Название группы</label>
        <input type="text" id="newGroupName" placeholder="Например: ИС-23" autofocus>
      </div>
      
      <div class="form-group">
        <label>Студенты (каждый с новой строки)</label>
        <textarea id="newGroupStudents" style="min-height: 180px;" placeholder="Иванов Иван&#10;Петрова Анна"></textarea>
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <button class="btn btn-primary" onclick="createNewGroup()">Создать группу</button>
        <button class="btn btn-secondary" onclick="renderAdminPanel()">Отмена</button>
      </div>
    </div>
  `;
}

function createNewGroup() {
  const nameInput = document.getElementById('newGroupName').value.trim();
  const studentsText = document.getElementById('newGroupStudents').value;

  if (!nameInput) {
    alert('Введите название группы');
    return;
  }

  const key = nameInput.toUpperCase();

  if (GROUPS[key]) {
    alert('Группа с таким названием уже существует');
    return;
  }

  if (archive[key]) {
    if (!confirm(`Группа ${key} есть в архиве. Восстановить её?`)) return;
    restoreGroup(key);
    return;
  }

  const list = studentsText
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  GROUPS[key] = list;
  saveGroups();
  renderAdminPanel();
  showToast(`Группа ${key} создана (${list.length} студентов)`);
  
  if (!currentGroup) renderHome();
}

function editGroup(groupName) {
  const students = GROUPS[groupName] || [];
  const body = document.getElementById('adminBody');

  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад</button>
    
    <div class="admin-section">
      <h4>Редактирование группы: ${groupName}</h4>
      
      <div class="form-group">
        <label>Список студентов (каждый с новой строки)</label>
        <textarea id="studentsText" style="min-height: 220px; font-size: 15px;" placeholder="Иванов Иван&#10;Петров Пётр&#10;Сидорова Анна">${students.join('\n')}</textarea>
      </div>
      
      <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px;">
        <button class="btn btn-primary" onclick="saveGroupStudents('${groupName}')">Сохранить</button>
        <button class="btn btn-secondary" onclick="renderAdminPanel()">Отмена</button>
      </div>
      
      <p style="margin-top: 12px; font-size: 0.85rem; color: var(--text-muted);">
        Просто вставь список — каждый студент с новой строки. Пустые строки будут проигнорированы.
      </p>
    </div>
  `;
}
async function deleteGroup(groupName) {
  const ok = await showConfirm(
    'В архив?',
    `Переместить группу <strong>${groupName}</strong> в архив?<br><br>История посещаемости сохранится.`
  );
  if (!ok) return;

  archive[groupName] = {
    students: GROUPS[groupName] ? [...GROUPS[groupName]] : [],
    attendance: data[groupName] ? structuredClone(data[groupName]) : {},
    deletedAt: new Date().toISOString()
  };
  saveArchive();

  delete GROUPS[groupName];
  if (data[groupName]) delete data[groupName];
  saveGroups();
  save();

  renderAdminPanel();
  showToast('Группа перемещена в архив');
  
  if (currentGroup === groupName) {
    renderHome();
  } else if (!currentGroup) {
    renderHome();
  }
}
function saveGroupStudents(groupName) {
  const text = document.getElementById('studentsText').value;
  const list = text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);           // убираем пустые строки

  GROUPS[groupName] = list;
  saveGroups();
  renderAdminPanel();
  showToast(`Группа ${groupName} обновлена (${list.length} чел.)`);
  
  if (currentGroup === groupName) {
    renderGroup();
  } else if (!currentGroup) {
    renderHome();
  }
}

async function restoreGroup(groupName) {
  if (!archive[groupName]) return;
  
  if (GROUPS[groupName]) {
    await showConfirm('Ошибка', 'Такая группа уже есть среди активных');
    return;
  }

  const ok = await showConfirm(
    'Восстановить группу?',
    `Вернуть группу <strong>${groupName}</strong> из архива?`
  );
  if (!ok) return;

  const a = archive[groupName];
  GROUPS[groupName] = a.students || [];
  if (a.attendance && Object.keys(a.attendance).length) {
    data[groupName] = structuredClone(a.attendance);
  }
  delete archive[groupName];

  saveGroups();
  save();
  saveArchive();
  renderAdminPanel();
  showToast('Группа восстановлена');
  if (!currentGroup) renderHome();
}

async function purgeArchive(groupName) {
  const ok = await showConfirm(
    'Удалить навсегда?',
    `Удалить группу <strong>${groupName}</strong> из архива навсегда?<br><br>История посещаемости будет потеряна.`
  );
  if (!ok) return;

  delete archive[groupName];
  saveArchive();
  renderAdminPanel();
  showToast('Удалено из архива навсегда');
}

function viewArchive(groupName) {
  const a = archive[groupName];
  if (!a) return;

  const attendance = a.attendance || {};
  const students = a.students || [];
  const dates = Object.keys(attendance).sort().reverse();

  const totals = {};
  students.forEach(s => totals[s] = 0);
  dates.forEach(date => {
    const day = attendance[date] || {};
    Object.keys(day).forEach(name => {
      if (day[name]) {
        if (totals[name] === undefined) totals[name] = 0;
        totals[name]++;
      }
    });
  });

  const sorted = [...students].sort((x, y) => (totals[y] || 0) - (totals[x] || 0));
  Object.keys(totals).forEach(n => {
    if (!students.includes(n)) sorted.push(n);
  });

  const rows = sorted.map(name => {
    const cnt = totals[name] || 0;
    return `<tr><td>${name}</td><td>${cnt > 0 ? `<span class="badge badge-danger">${cnt}</span>` : `<span class="badge badge-ok">0</span>`}</td></tr>`;
  }).join('');

  const dayRows = dates.slice(0, 60).map(date => {
    const day = attendance[date] || {};
    const absent = Object.keys(day).filter(n => day[n]);
    return `<tr>
      <td>${formatDate(date)}</td>
      <td>${absent.length ? absent.join(', ') : '—'}</td>
    </tr>`;
  }).join('');

  const body = document.getElementById('adminBody');
  body.innerHTML = `
    <button class="btn btn-secondary" style="margin-bottom:14px" onclick="renderAdminPanel()">← Назад в админку</button>
    <div class="admin-section">
      <h4>🗄️ Архив: ${groupName}</h4>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">
        Удалена: ${a.deletedAt ? formatDate(a.deletedAt.split('T')[0]) : '—'} ·
        Дней с отметками: ${dates.length}
      </p>
      <h4 style="margin-top:12px;margin-bottom:8px">Пропуски по студентам (всё время)</h4>
      <table class="report-table">
        <thead><tr><th>Студент</th><th>Пропусков</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="2">Нет данных</td></tr>'}</tbody>
      </table>
      <h4 style="margin-top:18px;margin-bottom:8px">По дням (последние 60)</h4>
      <table class="report-table">
        <thead><tr><th>Дата</th><th>Отсутствовали</th></tr></thead>
        <tbody>${dayRows || '<tr><td colspan="2">Нет отметок</td></tr>'}</tbody>
      </table>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="restoreGroup('${groupName}')">Вернуть группу</button>
        <button class="btn btn-danger" onclick="purgeArchive('${groupName}')">Удалить навсегда</button>
      </div>
    </div>
  `;
}

async function resetAllData() {
  const ok = await showConfirm(
    'Сбросить все отметки?',
    'Удалить <strong>ВСЕ</strong> отметки посещаемости у активных групп?<br><br>Группы и архив останутся.'
  );
  if (!ok) return;

  data = {};
  save();
  showToast('Все отметки активных групп сброшены');
  if (currentGroup) renderGroup();
}


// Close modal on overlay click
document.getElementById('adminModal').addEventListener('click', e => {
  if (e.target.id === 'adminModal') closeAdmin();
});

// ===== INIT =====
const content = document.getElementById('content');
renderHome();
initFirebaseData();
