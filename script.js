// Firebase подключается через CDN в index.html.
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
let schedule = readLocalJSON('attendanceSchedule', {});

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

function saveSchedule() {
  localStorage.setItem('attendanceSchedule', JSON.stringify(schedule));
  if (firebaseReady && currentRole === 'admin') {
    db.ref('schedule').set(schedule).catch(err => console.error('Firebase schedule:', err));
  }
}

/** Правильное склонение слова «студент» */
function pluralStudents(n) {
  n = Math.abs(n) | 0;
  const mod100 = n % 100;
  const mod10 = n % 10;

  if (mod100 >= 11 && mod100 <= 19) return `${n} студентов`;
  if (mod10 === 1) return `${n} студент`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} студента`;
  return `${n} студентов`;
}

async function initFirebaseData() {
  try {
    const groupsSnap = await db.ref('groups').once('value');
    const attendanceSnap = await db.ref('attendance').once('value');

    const cloudGroups = groupsSnap.val();
    const cloudAttendance = attendanceSnap.val();

    if (cloudGroups && typeof cloudGroups === 'object') {
      GROUPS = normalizeGroups(cloudGroups);
    } else if (currentRole === 'admin') {
      await db.ref('groups').set(GROUPS);
    }

    if (cloudAttendance && typeof cloudAttendance === 'object') {
      data = cloudAttendance;
    } else if (Object.keys(data).length > 0 && (currentRole === 'admin' || currentRole === 'checker' || currentRole === 'starosta')) {
      try {
        await db.ref('attendance').set(data);
      } catch (e) {
        console.warn('Не удалось записать attendance:', e);
      }
    }

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

    // Расписание
    try {
      const scheduleSnap = await db.ref('schedule').once('value');
      const cloudSchedule = scheduleSnap.val();
      if (cloudSchedule && typeof cloudSchedule === 'object') {
        schedule = cloudSchedule;
      } else if (Object.keys(schedule).length > 0 && currentRole === 'admin') {
        await db.ref('schedule').set(schedule);
      }
    } catch (e) {
      console.warn('Schedule недоступен:', e);
    }

    localStorage.setItem('attendanceGroups', JSON.stringify(GROUPS));
    localStorage.setItem('attendanceData', JSON.stringify(data));
    localStorage.setItem('attendanceArchive', JSON.stringify(archive));
    localStorage.setItem('attendanceSchedule', JSON.stringify(schedule));

    firebaseReady = true;

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

    db.ref('schedule').on('value', snap => {
      const value = snap.val();
      schedule = (value && typeof value === 'object') ? value : {};
      localStorage.setItem('attendanceSchedule', JSON.stringify(schedule));
    });

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
    showToast('✓ Данные синхронизированы с базой данных');
  } catch (error) {
    console.error('Firebase error:', error);
    firebaseReady = false;
    renderHome();
    showToast('⚠️ База данных недоступна.');
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
  document.getElementById('modalTitle').textContent = 'Вход';

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

// ===== SEARCH (группы + студенты) =====
const searchInput = document.getElementById('search');
const suggestions = document.getElementById('suggestions');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    suggestions.classList.remove('show');
    return;
  }

  const results = [];

  Object.keys(GROUPS).forEach(g => {
    if (g.toLowerCase().includes(q)) {
      results.push({
        type: 'group',
        group: g,
        label: g,
        sub: pluralStudents(GROUPS[g].students.length)
      });
    }
  });

  Object.keys(GROUPS).forEach(g => {
    GROUPS[g].students.forEach(name => {
      if (name.toLowerCase().includes(q)) {
        results.push({
          type: 'student',
          group: g,
          name: name,
          label: name,
          sub: g
        });
      }
    });
  });

  const unique = [];
  const seen = new Set();
  for (const r of results) {
    const key = r.type === 'group' ? 'g:' + r.group : 's:' + r.group + '|' + r.name;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  if (unique.length === 0) {
    suggestions.classList.remove('show');
    return;
  }

  suggestions.innerHTML = unique.slice(0, 12).map(r => {
    if (r.type === 'group') {
      return `<div class="suggestion-item" data-type="group" data-group="${r.group}">
        <span><strong>${r.label}</strong></span>
        <span>${r.sub}</span>
      </div>`;
    } else {
      return `<div class="suggestion-item" data-type="student" data-group="${r.group}" data-name="${r.name}">
        <span>${r.label}</span>
        <span>${r.sub}</span>
      </div>`;
    }
  }).join('');

  suggestions.classList.add('show');
});

suggestions.addEventListener('click', e => {
  const item = e.target.closest('.suggestion-item');
  if (!item) return;

  const type = item.dataset.type;
  const group = item.dataset.group;

  if (type === 'group') {
    selectGroup(group);
  } else {
    selectGroup(group);
    setTimeout(() => {
      highlightStudent(item.dataset.name);
    }, 150);
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-box')) suggestions.classList.remove('show');
});

function highlightStudent(name) {
  const rows = document.querySelectorAll('.student-row');
  rows.forEach(row => {
    const nameEl = row.querySelector('.student-name');
    if (nameEl && nameEl.textContent === name) {
      row.style.outline = '2px solid var(--gold)';
      row.style.background = '#FFF8E7';
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        row.style.outline = '';
        row.style.background = '';
      }, 3500);
    }
  });
}

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
            <div class="count">${pluralStudents(count)}</div>
            ${curator ? `<div class="curator-mini">Куратор: ${curator}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;

  updateHeaderUI();
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
        <button class="tab ${currentView === 'journal' ? 'active' : ''}" onclick="setView('journal')">Журнал</button>
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
  } else if (currentView === 'month') {
    el.innerHTML = renderPeriodView('month');
  } else if (currentView === 'journal') {
    el.innerHTML = renderJournalView();
  }
}

// ===== ЖУРНАЛ =====
function renderJournalView() {
  const groupData = data[currentGroup] || {};
  const records = [];

  Object.keys(groupData).forEach(date => {
    const day = groupData[date];
    if (!day) return;
    Object.keys(day).forEach(name => {
      if (day[name]) records.push({ date, name });
    });
  });

  records.sort((a, b) => b.date.localeCompare(a.date));

  if (records.length === 0) {
    return `
      <div class="empty" style="padding:40px 20px">
        <div class="empty-icon">📋</div>
        <p>В журнале пока нет отметок</p>
      </div>
    `;
  }

  const byDate = {};
  records.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r.name);
  });

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const rows = dates.map(date => {
    const names = byDate[date];
    return `
      <div class="journal-day">
        <div class="journal-date">${formatDate(date)}</div>
        <div class="journal-names">
          ${names.map(n => `<span class="journal-name">${n}</span>`).join('')}
        </div>
        <div class="journal-count">${names.length}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="report-section">
      <div class="report-meta" style="margin-bottom:14px">
        Всего записей в журнале: <strong>${records.length}</strong> · 
        Дней с пропусками: <strong>${dates.length}</strong>
      </div>
      <div class="journal-list">
        ${rows}
      </div>
    </div>
  `;
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
           ${isAbsent ? '❌ ' : '✓ '}
         </button>`
      : `<span class="toggle-btn ${isAbsent ? 'absent' : 'present'}" style="cursor:default; opacity:0.85;">
           ${isAbsent ? '❌ ' : '✓ '}
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

  renderViewContent();
  localStorage.setItem('attendanceData', JSON.stringify(data));

  if (firebaseReady) {
    const path = `attendance/${currentGroup}/${currentDate}`;
    if (data[currentGroup] && data[currentGroup][currentDate]) {
      db.ref(path).set(data[currentGroup][currentDate])
        .catch(err => console.error('Firebase attendance:', err));
    } else {
      db.ref(path).remove()
        .catch(err => console.error('Firebase attendance remove:', err));
    }
  }
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

// ===== ГЛАВНОЕ МЕНЮ =====
function openMainMenu() {
  const old = document.querySelector('.main-menu-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'main-menu-overlay';
  overlay.id = 'mainMenuOverlay';

  const isAdmin = currentRole === 'admin';

  overlay.innerHTML = `
    <div class="main-menu">
      <div class="main-menu-header">
        <h3>Меню</h3>
        <button class="main-menu-close" onclick="closeMainMenu()">×</button>
      </div>
      <div class="main-menu-body">
        <button class="menu-item" onclick="openSchedule()">
          <div class="icon schedule">📅</div>
          <div class="text">
            Расписание
            <div class="desc">${isAdmin ? 'Просмотр и редактирование' : 'Только просмотр'}</div>
          </div>
        </button>
        
        ${isAdmin ? `
          <button class="menu-item" onclick="openAdminFromMenu()">
            <div class="icon admin">⚙️</div>
            <div class="text">
              Админ-панель
              <div class="desc">Группы, пользователи, архив</div>
            </div>
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeMainMenu();
  });
}

function closeMainMenu() {
  const overlay = document.getElementById('mainMenuOverlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 200);
}

function openAdminFromMenu() {
  closeMainMenu();
  openAdmin();
}

// ===== РАСПИСАНИЕ =====
const DAYS = [
  { key: 'monday', label: 'Понедельник' },
  { key: 'tuesday', label: 'Вторник' },
  { key: 'wednesday', label: 'Среда' },
  { key: 'thursday', label: 'Четверг' },
  { key: 'friday', label: 'Пятница' },
  { key: 'saturday', label: 'Суббота' }
];

let scheduleMode = 'table'; // 'table' | 'group'
let scheduleSelectedDay = 'monday';
let scheduleSelectedGroup = null;

function openSchedule() {
  closeMainMenu();

  // Создаём полноэкранный контейнер, если его ещё нет
  let fs = document.getElementById('scheduleFullscreen');
  if (!fs) {
    fs = document.createElement('div');
    fs.id = 'scheduleFullscreen';
    fs.className = 'schedule-fullscreen';
    document.body.appendChild(fs);
  }

  fs.innerHTML = `
    <div class="schedule-topbar">
      <h2>Расписание</h2>
      
      <div class="schedule-topbar-controls">
        <div class="schedule-mode-btns">
          <button class="btn ${scheduleMode === 'table' ? 'btn-primary' : 'btn-secondary'}" 
                  onclick="setScheduleMode('table')">Общая таблица</button>
          <button class="btn ${scheduleMode === 'group' ? 'btn-primary' : 'btn-secondary'}" 
                  onclick="setScheduleMode('group')">По группам</button>
        </div>
        
        <div id="scheduleSelectWrap"></div>
      </div>
      
      <button class="schedule-close-btn" onclick="closeSchedule()" title="Закрыть">×</button>
    </div>
    
    <div class="schedule-body" id="scheduleBody"></div>
  `;

  fs.classList.add('show');
  renderScheduleSelect();
  renderScheduleBody();
}

function closeSchedule() {
  const fs = document.getElementById('scheduleFullscreen');
  if (fs) fs.classList.remove('show');
}

function setScheduleMode(mode) {
  scheduleMode = mode;
  openSchedule();
}

function renderScheduleSelect() {
  const wrap = document.getElementById('scheduleSelectWrap');
  if (!wrap) return;

  if (scheduleMode === 'table') {
    wrap.innerHTML = `
      <select id="scheduleDaySelect" onchange="scheduleSelectedDay=this.value; renderScheduleBody()">
        ${DAYS.map(d => `<option value="${d.key}" ${d.key === scheduleSelectedDay ? 'selected' : ''}>${d.label}</option>`).join('')}
      </select>
    `;
  } else {
    const groups = Object.keys(GROUPS).sort();
    if (!scheduleSelectedGroup || !GROUPS[scheduleSelectedGroup]) {
      scheduleSelectedGroup = groups[0] || null;
    }
    wrap.innerHTML = `
      <select id="scheduleGroupSelect" onchange="scheduleSelectedGroup=this.value; renderScheduleBody()">
        ${groups.map(g => `<option value="${g}" ${g === scheduleSelectedGroup ? 'selected' : ''}>${g}</option>`).join('')}
      </select>
    `;
  }
}

function renderScheduleBody() {
  const body = document.getElementById('scheduleBody');
  if (!body) return;

  if (scheduleMode === 'table') {
    renderAllGroupsTable(body);
  } else {
    renderOneGroupSchedule(body);
  }
}

// ===== ОБЩАЯ ТАБЛИЦА (все группы) =====
function renderAllGroupsTable(container) {
  const dayKey = scheduleSelectedDay || 'monday';
  const dayLabel = DAYS.find(d => d.key === dayKey)?.label || dayKey;
  const groups = Object.keys(GROUPS).sort();
  const canEdit = currentRole === 'admin';

  // Собираем все времена
  const allTimes = new Set();
  groups.forEach(g => {
    (schedule[g]?.[dayKey] || []).forEach(l => {
      if (l.time) allTimes.add(l.time);
    });
  });
  const times = Array.from(allTimes).sort();

  let html = `
    <div style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div style="font-size:1.05rem;">
        <strong>${dayLabel}</strong>
        <span style="color:var(--text-muted); font-size:0.9rem; margin-left:10px;">
          групп: ${groups.length}
        </span>
      </div>
      ${canEdit ? `
        <div style="font-size:0.85rem; color:var(--text-muted);">
          Чтобы редактировать — переключись в «По группам»
        </div>
      ` : ''}
    </div>
  `;

  if (groups.length === 0) {
    html += `<div class="empty"><div class="empty-icon">📁</div><p>Нет групп</p></div>`;
    container.innerHTML = html;
    return;
  }

  html += `<div class="schedule-table-wrap"><table class="schedule-table"><thead><tr>`;
  html += `<th>Время</th>`;
  groups.forEach(g => {
    html += `<th>${g}</th>`;
  });
  html += `</tr></thead><tbody>`;

  if (times.length === 0) {
    html += `
      <tr>
        <td colspan="${groups.length + 1}" style="text-align:center; padding:40px; color:var(--text-muted);">
          На этот день пар пока нет
        </td>
      </tr>
    `;
  } else {
    times.forEach(time => {
      html += `<tr>`;
      html += `<td>${time}</td>`;

      groups.forEach(g => {
        const lessons = (schedule[g]?.[dayKey] || []).filter(l => l.time === time);

        if (lessons.length === 0) {
          html += `<td class="schedule-empty-cell">—</td>`;
        } else {
          const cells = lessons.map(l => {
            let cell = `<div class="schedule-cell-subject">${l.subject || '—'}</div>`;
            if (l.room || l.teacher) {
              cell += `<div class="schedule-cell-meta">`;
              if (l.room) cell += `ауд. ${l.room}`;
              if (l.teacher) cell += (l.room ? ' · ' : '') + l.teacher;
              cell += `</div>`;
            }
            return cell;
          }).join('<div style="height:8px;"></div>');

          html += `<td>${cells}</td>`;
        }
      });

      html += `</tr>`;
    });
  }

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// ===== ПО ГРУППАМ =====
function renderOneGroupSchedule(container) {
  const group = scheduleSelectedGroup || document.getElementById('scheduleGroupSelect')?.value;
  if (!group) {
    container.innerHTML = `<div class="empty"><p>Выберите группу</p></div>`;
    return;
  }

  if (!schedule[group]) schedule[group] = {};
  const canEdit = currentRole === 'admin';

  let html = `
    <div class="schedule-group-view">
      <div style="margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <h3 style="margin:0; color:var(--red); font-size:1.3rem;">${group}</h3>
        ${canEdit ? `
          <button class="btn btn-primary" onclick="addLesson()">+ Добавить пару</button>
        ` : `
          <span style="font-size:0.85rem; color:var(--text-muted);">Только просмотр</span>
        `}
      </div>
  `;

  DAYS.forEach(day => {
    const lessons = schedule[group][day.key] || [];

    html += `
      <div class="schedule-day">
        <div class="schedule-day-title">
          <span>${day.label}</span>
          ${canEdit ? `<button class="btn-sm btn-secondary" onclick="addLesson('${day.key}')">+ Пара</button>` : ''}
        </div>
    `;

    if (lessons.length === 0) {
      html += `<div class="schedule-empty">Нет пар</div>`;
    } else {
      lessons.forEach((lesson, idx) => {
        html += `
          <div class="schedule-lesson">
            <div class="schedule-time">${lesson.time || '—'}</div>
            <div class="schedule-info">
              <div class="schedule-subject">${lesson.subject || 'Без названия'}</div>
              <div class="schedule-meta">
                ${lesson.room ? `ауд. ${lesson.room}` : ''}
                ${lesson.teacher ? ` · ${lesson.teacher}` : ''}
              </div>
            </div>
            ${canEdit ? `
              <div class="schedule-actions">
                <button class="btn-sm btn-secondary" onclick="editLesson('${group}', '${day.key}', ${idx})">Изменить</button>
                <button class="btn-sm btn-danger" onclick="deleteLesson('${group}', '${day.key}', ${idx})">×</button>
              </div>
            ` : ''}
          </div>
        `;
      });
    }

    html += `</div>`;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function addLesson(dayKey = null) {
  if (currentRole !== 'admin') {
    showToast('Только администратор может изменять расписание');
    return;
  }

  const group = scheduleSelectedGroup || document.getElementById('scheduleGroupSelect')?.value;
  if (!group) {
    showToast('Сначала выберите группу');
    return;
  }

  // Используем обычную модалку для формы
  const body = document.getElementById('adminBody');
  const modal = document.getElementById('adminModal');
  document.getElementById('modalTitle').textContent = 'Новая пара';

  body.innerHTML = `
    <div class="admin-section">
      <h4>+ Новая пара · ${group}</h4>
      
      <div class="form-group">
        <label>День недели</label>
        <select id="lessonDay">
          ${DAYS.map(d => `<option value="${d.key}" ${d.key === dayKey ? 'selected' : ''}>${d.label}</option>`).join('')}
        </select>
      </div>
      
      <div class="form-group">
        <label>Время (например 09:00–10:30)</label>
        <input type="text" id="lessonTime" placeholder="09:00–10:30" autofocus>
      </div>
      
      <div class="form-group">
        <label>Предмет</label>
        <input type="text" id="lessonSubject" placeholder="Математика">
      </div>
      
      <div class="form-group">
        <label>Аудитория</label>
        <input type="text" id="lessonRoom" placeholder="101">
      </div>
      
      <div class="form-group">
        <label>Преподаватель</label>
        <input type="text" id="lessonTeacher" placeholder="Иванов И.И.">
      </div>
      
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveNewLesson()">Сохранить</button>
        <button class="btn btn-secondary" onclick="closeAdmin()">Отмена</button>
      </div>
    </div>
  `;

  modal.classList.add('show');
}

function saveNewLesson() {
  if (currentRole !== 'admin') return;

  const group = scheduleSelectedGroup || document.getElementById('scheduleGroupSelect')?.value 
    || Object.keys(GROUPS).sort()[0];
  const day = document.getElementById('lessonDay').value;
  const time = document.getElementById('lessonTime').value.trim();
  const subject = document.getElementById('lessonSubject').value.trim();
  const room = document.getElementById('lessonRoom').value.trim();
  const teacher = document.getElementById('lessonTeacher').value.trim();

  if (!subject) {
    showToast('Укажите название предмета');
    return;
  }

  if (!schedule[group]) schedule[group] = {};
  if (!schedule[group][day]) schedule[group][day] = [];

  schedule[group][day].push({ time, subject, room, teacher });
  schedule[group][day].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  saveSchedule();
  showToast('Пара добавлена');
  closeAdmin();
  renderScheduleBody();
}

function editLesson(group, dayKey, index) {
  if (currentRole !== 'admin') {
    showToast('Только администратор может изменять расписание');
    return;
  }

  const lesson = schedule[group]?.[dayKey]?.[index];
  if (!lesson) return;

  const body = document.getElementById('adminBody');
  const modal = document.getElementById('adminModal');
  document.getElementById('modalTitle').textContent = 'Редактировать пару';

  body.innerHTML = `
    <div class="admin-section">
      <h4>Редактировать пару · ${group}</h4>
      
      <div class="form-group">
        <label>День недели</label>
        <select id="lessonDay">
          ${DAYS.map(d => `<option value="${d.key}" ${d.key === dayKey ? 'selected' : ''}>${d.label}</option>`).join('')}
        </select>
      </div>
      
      <div class="form-group">
        <label>Время</label>
        <input type="text" id="lessonTime" value="${lesson.time || ''}">
      </div>
      
      <div class="form-group">
        <label>Предмет</label>
        <input type="text" id="lessonSubject" value="${lesson.subject || ''}">
      </div>
      
      <div class="form-group">
        <label>Аудитория</label>
        <input type="text" id="lessonRoom" value="${lesson.room || ''}">
      </div>
      
      <div class="form-group">
        <label>Преподаватель</label>
        <input type="text" id="lessonTeacher" value="${lesson.teacher || ''}">
      </div>
      
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveEditedLesson('${group}', '${dayKey}', ${index})">Сохранить</button>
        <button class="btn btn-secondary" onclick="closeAdmin()">Отмена</button>
      </div>
    </div>
  `;

  modal.classList.add('show');
}

function saveEditedLesson(oldGroup, oldDay, index) {
  if (currentRole !== 'admin') return;

  const newDay = document.getElementById('lessonDay').value;
  const time = document.getElementById('lessonTime').value.trim();
  const subject = document.getElementById('lessonSubject').value.trim();
  const room = document.getElementById('lessonRoom').value.trim();
  const teacher = document.getElementById('lessonTeacher').value.trim();

  if (!subject) {
    showToast('Укажите название предмета');
    return;
  }

  if (schedule[oldGroup]?.[oldDay]) {
    schedule[oldGroup][oldDay].splice(index, 1);
    if (schedule[oldGroup][oldDay].length === 0) {
      delete schedule[oldGroup][oldDay];
    }
  }

  if (!schedule[oldGroup]) schedule[oldGroup] = {};
  if (!schedule[oldGroup][newDay]) schedule[oldGroup][newDay] = [];
  
  schedule[oldGroup][newDay].push({ time, subject, room, teacher });
  schedule[oldGroup][newDay].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  saveSchedule();
  showToast('Пара обновлена');
  closeAdmin();
  renderScheduleBody();
}

async function deleteLesson(group, dayKey, index) {
  if (currentRole !== 'admin') {
    showToast('Только администратор может изменять расписание');
    return;
  }

  const ok = await showConfirm('Удалить пару?', 'Вы уверены, что хотите удалить эту пару из расписания?');
  if (!ok) return;

  if (schedule[group]?.[dayKey]) {
    schedule[group][dayKey].splice(index, 1);
    if (schedule[group][dayKey].length === 0) {
      delete schedule[group][dayKey];
    }
  }

  saveSchedule();
  showToast('Пара удалена');
  renderScheduleBody();
}
// ===== ADMIN =====
function openAdmin() {
  if (currentRole !== 'admin') {
    showToast('Ошибка: у вас нет прав администратора');
    return;
  }

  const modal = document.getElementById('adminModal');
  document.getElementById('modalTitle').textContent = 'Админ-панель';
  modal.classList.add('show');
  renderAdminPanel();
}

function closeAdmin() {
  document.getElementById('adminModal').classList.remove('show');
}

let secondaryApp = null;
function getSecondaryAuth() {
  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
  }
  return secondaryApp.auth();
}

async function createAccountFromAdmin() {
  const email = document.getElementById('newAccEmail')?.value.trim();
  const password = document.getElementById('newAccPass')?.value;
  const role = document.getElementById('newAccRole')?.value || 'guest';
  const group = role === 'starosta'
    ? (document.getElementById('newAccGroup')?.value || null)
    : null;

  if (!email || !password) {
    showToast('Заполните email и пароль');
    return;
  }
  if (password.length < 6) {
    showToast('Пароль должен быть не меньше 6 символов');
    return;
  }
  if (role === 'starosta' && !group) {
    showToast('Для старосты нужно выбрать группу');
    return;
  }

  try {
    const secondaryAuth = getSecondaryAuth();
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;
    await secondaryAuth.signOut();

    await db.ref('users/' + uid).set({
      email,
      role,
      group: group || null,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.uid || null
    });

    showToast(`Аккаунт ${email} создан (${role})`);

    document.getElementById('newAccEmail').value = '';
    document.getElementById('newAccPass').value = '';
    document.getElementById('newAccRole').value = 'guest';
    document.getElementById('newAccGroupWrap').style.display = 'none';

    loadUsersList();
  } catch (err) {
    console.error(err);
    let msg = 'Ошибка создания аккаунта';
    if (err.code === 'auth/email-already-in-use') msg = 'Этот email уже зарегистрирован';
    if (err.code === 'auth/invalid-email') msg = 'Некорректный email';
    if (err.code === 'auth/weak-password') msg = 'Слишком слабый пароль';
    showToast(msg);
  }
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
      <h4>Создать новый аккаунт</h4>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="newAccEmail" placeholder="user@example.com" autocomplete="off">
      </div>
      <div class="form-group" style="position:relative">
        <label>Пароль (мин. 6 символов)</label>
        <input type="password" id="newAccPass" placeholder="••••••••">
      </div>
      <div class="form-group">
        <label>Роль</label>
        <select id="newAccRole">
          <option value="guest">Гость (только просмотр)</option>
          <option value="starosta">Староста</option>
          <option value="checker">Отмечающий</option>
          <option value="admin">Админ</option>
        </select>
      </div>
      <div class="form-group" id="newAccGroupWrap" style="display:none">
        <label>Группа (для старосты)</label>
        <select id="newAccGroup">
          <option value="">— выберите —</option>
          ${Object.keys(GROUPS).sort().map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" onclick="createAccountFromAdmin()">Создать аккаунт</button>
      <p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px">
        Аккаунт появится в Firebase Authentication, роль сохранится автоматически.
      </p>
    </div>

    <div class="admin-section">
      <h4>Пользователи и роли</h4>
      <div id="usersList">Загрузка...</div>
    </div>

    <div class="admin-section">
      <button class="btn btn-danger" onclick="resetAllData()">Сбросить все отметки (активные группы)</button>
    </div>
  `;

  const roleSelect = document.getElementById('newAccRole');
  if (roleSelect) {
    roleSelect.addEventListener('change', e => {
      document.getElementById('newAccGroupWrap').style.display =
        e.target.value === 'starosta' ? 'block' : 'none';
    });
  }

  loadUsersList();
}

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
      const isMe = currentUser && uid === currentUser.uid;

      return `
        <li>
          <span>
            <strong>${u.email || uid}</strong>${isMe ? ' <small style="color:var(--gold)">(вы)</small>' : ''}<br>
            <small style="color:var(--text-muted)">${roleLabel}${groupInfo}</small>
          </span>
          <span>
            ${isMe
              ? `<span style="font-size:0.8rem;color:var(--text-muted)">нельзя менять себя</span>`
              : `
                <button class="btn-sm btn-secondary" onclick="editUserRole('${uid}')">Изменить</button>
                <button class="btn-sm btn-danger" onclick="removeUserRole('${uid}')">Удалить роль</button>
              `}
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

async function saveUserRole(existingUid = null) {
  const uid = existingUid || document.getElementById('userUid')?.value.trim();
  const email = document.getElementById('userEmail')?.value.trim() || '';
  const role = document.getElementById('userRole')?.value;
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
  if (currentUser && uid === currentUser.uid) {
    showToast('Нельзя менять роль своего аккаунта');
    return;
  }

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
  if (currentUser && uid === currentUser.uid) {
    showToast('Нельзя удалить роль своего аккаунта');
    return;
  }

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
  showToast(`Группа ${key} создана (${pluralStudents(list.length)})`);

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
