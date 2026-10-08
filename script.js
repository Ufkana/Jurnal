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

const ADMIN_PASSWORD = "Hutao"; 

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
let isAdmin = sessionStorage.getItem('isAdmin') === '1';
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
    const snapshot = await db.ref('/').once('value');
    const cloud = snapshot.val() || {};

    if (cloud.groups && typeof cloud.groups === 'object') {
      GROUPS = cloud.groups;
    } else {
      await db.ref('groups').set(GROUPS);
    }

    if (cloud.attendance && typeof cloud.attendance === 'object') {
      data = cloud.attendance;
    } else if (Object.keys(data).length > 0) {
      await db.ref('attendance').set(data);
    }

    if (cloud.archive && typeof cloud.archive === 'object') {
      archive = cloud.archive;
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
      if (isAdmin) {
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
          <button class="btn btn-secondary" onclick="resetDay()">Сбросить</button>
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

  const rows = students.map(name => {
    const isAbsent = !!dayData[name];
    const totalAbsences = countAbsences(currentGroup, name);
    // Правильное экранирование для onclick
    const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `
      <div class="student-row ${isAbsent ? 'absent' : ''}">
        <div class="student-info">
          <span class="student-name">${name}</span>
          <span class="student-stats ${totalAbsences > 0 ? 'has-absences' : ''}">
            ${totalAbsences > 0 ? `Всего пропусков: ${totalAbsences}` : 'Нет пропусков'}
          </span>
        </div>
        <button class="toggle-btn ${isAbsent ? 'absent' : 'present'}"
                onclick="toggleAbsent('${safeName}')">
          ${isAbsent ? '❌ Отсутствует' : '✓ Присутствует'}
        </button>
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

// ===== ACTIONS =====
function toggleAbsent(studentName) {
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
  const modal = document.getElementById('adminModal');
  const body = document.getElementById('adminBody');
  modal.classList.add('show');

  if (!isAdmin) {
    body.innerHTML = `
      <div class="form-group">
        <label>Пароль администратора</label>
        <div style="position: relative;">
          <input type="password" id="adminPass" placeholder="Введите пароль" autofocus
                 style="padding-right: 46px; width: 100%;">
          <button type="button" id="togglePassBtn"
                  style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
                         background: none; border: none; cursor: pointer; font-size: 1.2rem;
                         color: var(--text-muted); padding: 4px 6px;">
            👁
          </button>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%; margin-top: 12px;" onclick="checkAdminPass()">Войти</button>
      
    `;

    // Показать / скрыть пароль
    const toggleBtn = document.getElementById('togglePassBtn');
    const passInput = document.getElementById('adminPass');

    toggleBtn.addEventListener('click', () => {
      if (passInput.type === 'password') {
        passInput.type = 'text';
        toggleBtn.textContent = '🙈';
      } else {
        passInput.type = 'password';
        toggleBtn.textContent = '👁';
      }
    });

    // Вход по Enter
    passInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') checkAdminPass();
    });

  } else {
    renderAdminPanel();
  }
}

function closeAdmin() {
  document.getElementById('adminModal').classList.remove('show');
}

function checkAdminPass() {
  const pass = document.getElementById('adminPass').value;
  if (pass === ADMIN_PASSWORD) {
    isAdmin = true;
    sessionStorage.setItem('isAdmin', '1');
    renderAdminPanel();
    showToast('Вход выполнен');
  } else {
    alert('Неверный пароль');
  }
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
      <h4>⚠️ Опасная зона</h4>
      <button class="btn btn-danger" onclick="resetAllData()">Сбросить все отметки (активные группы)</button>
    </div>

    <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="logoutAdmin()">Выйти из админки</button>
  `;
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

function logoutAdmin() {
  isAdmin = false;
  sessionStorage.removeItem('isAdmin');
  closeAdmin();
  showToast('Вы вышли из админки');
}

// Close modal on overlay click
document.getElementById('adminModal').addEventListener('click', e => {
  if (e.target.id === 'adminModal') closeAdmin();
});

// ===== INIT =====
const content = document.getElementById('content');
renderHome();
initFirebaseData();
