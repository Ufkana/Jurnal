// ===== DATABASE =====
const DEFAULT_GROUPS = {
  "ИС-21": ["Абдулаев Тимур", "Белов Артём", "Волкова Мария", "Гусев Иван", "Дмитриева Анна", "Егоров Павел"],
  "ИС-22": ["Жуков Сергей", "Зайцева Ольга", "Иванов Дмитрий", "Кузнецова Елена", "Лебедев Максим"],
  "ПКС-21": ["Морозов Андрей", "Никитина София", "Орлов Виктор", "Петрова Дарья"],
  "ПКС-22": ["Романов Илья", "Соколова Вера", "Тимофеев Никита", "Фёдорова Юлия", "Царёв Артём"],
  "ЭК-21": ["Чернов Егор", "Шилова Алина", "Щербаков Кирилл"]
};

// Admin password (change it!)
const ADMIN_PASSWORD = "iip2025";

// ===== STORAGE =====
let GROUPS = JSON.parse(localStorage.getItem('attendanceGroups') || 'null') || structuredClone(DEFAULT_GROUPS);
let data = JSON.parse(localStorage.getItem('attendanceData') || '{}');
let isAdmin = sessionStorage.getItem('isAdmin') === '1';

function saveGroups() {
  localStorage.setItem('attendanceGroups', JSON.stringify(GROUPS));
}

function save() {
  localStorage.setItem('attendanceData', JSON.stringify(data));
}

// ===== STATE =====
let currentGroup = null;
let currentDate = getToday();
let currentView = 'day'; // day | week | month

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
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

// ===== RENDER HOME =====
function renderHome() {
  currentGroup = null;
  searchInput.value = '';
  const groups = Object.keys(GROUPS).sort();

  if (groups.length === 0) {
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📁</div>
        <p>Нет групп. Добавьте через админ-панель ⚙️</p>
      </div>`;
    return;
  }

  const icons = ['💻', '🖥️', '📊', '🔧', '📱', '🌐', '⚙️', '📈'];
  content.innerHTML = `
    <div class="sync-info">
      <span>💾</span>
      <div>
        <strong>Данные хранятся в этом браузере.</strong><br>
        Чтобы перенести на другой телефон/ПК — используйте кнопки Экспорт ⬇️ и Импорт ⬆️ в шапке.
        После импорта данные появятся на новом устройстве.
      </div>
    </div>
    <div class="section-title">📚 Группы</div>
    <div class="groups-grid">
      ${groups.map((g, i) => `
        <div class="group-card" onclick="selectGroup('${g}')">
          <div class="icon">${icons[i % icons.length]}</div>
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

  const students = GROUPS[currentGroup];

  content.innerHTML = `
    <div class="card">
      <button class="back-btn" onclick="renderHome()">← Все группы</button>
      <div class="group-header">
        <div>
          <h2>${currentGroup}</h2>
        </div>
        <div class="date-picker">
          <label>Дата:</label>
          <input type="date" id="dateInput" value="${currentDate}">
          <button class="btn btn-secondary" onclick="resetDay()">Сбросить день</button>
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
  // re-render only the view part for speed, but simpler to full re-render
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  renderViewContent();
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
    return `
      <div class="student-row ${isAbsent ? 'absent' : ''}">
        <div class="student-info">
          <span class="student-name">${name}</span>
          <span class="student-stats ${totalAbsences > 0 ? 'has-absences' : ''}">
            ${totalAbsences > 0 ? `Всего пропусков: ${totalAbsences}` : 'Нет пропусков'}
          </span>
        </div>
        <button class="toggle-btn ${isAbsent ? 'absent' : 'present'}"
                onclick="toggleAbsent('${name.replace(/'/g, "\\'")}')">
          ${isAbsent ? '❌ Отсутствует' : '✓ Присутствует'}
        </button>
      </div>
    `;
  }).join('');

  const absentCount = Object.values(dayData).filter(Boolean).length;

  return `
    ${rows}
    <div class="summary">
      <span>Всего: <strong>${students.length}</strong></span>
      <span>Отсутствует: <strong style="color:var(--danger)">${absentCount}</strong></span>
      <span>Присутствует: <strong style="color:var(--success)">${students.length - absentCount}</strong></span>
    </div>
  `;
}

// ===== PERIOD VIEWS (week / month) =====
function getPeriodDates(type) {
  const d = new Date(currentDate + 'T12:00:00');
  let start, end;

  if (type === 'week') {
    // Monday-Sunday of the week containing currentDate
    const day = d.getDay(); // 0=Sun
    const diffToMon = day === 0 ? -6 : 1 - day;
    start = new Date(d);
    start.setDate(d.getDate() + diffToMon);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else {
    // month
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
    ? `Неделя: ${formatDate(start.toISOString().split('T')[0])} – ${formatDate(end.toISOString().split('T')[0])}`
    : `Месяц: ${start.toLocaleString('ru', { month: 'long', year: 'numeric' })}`;

  // Count absences per student in period
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

  return `
    <div class="report-section">
      <div class="report-card">
        <h4>📅 ${periodLabel}</h4>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">
          Дней с отметками: <strong>${daysWithData.size}</strong> ·
          Всего пропусков группы: <strong style="color:var(--danger)">${totalGroupAbsences}</strong>
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

function resetDay() {
  if (!confirm('Сбросить все отметки за ' + formatDate(currentDate) + '?')) return;
  if (data[currentGroup]) delete data[currentGroup][currentDate];
  save();
  renderViewContent();
  showToast('День сброшен');
}

// ===== EXPORT / IMPORT (для переноса между устройствами) =====
function exportData() {
  const payload = {
    groups: GROUPS,
    attendance: data,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance_iip_${getToday()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Файл скачан. Перенесите его на другое устройство и нажмите Импорт');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const payload = JSON.parse(ev.target.result);
        if (payload.groups) {
          GROUPS = payload.groups;
          saveGroups();
        }
        if (payload.attendance) {
          data = payload.attendance;
          save();
        }
        showToast('Данные успешно импортированы!');
        if (currentGroup) renderGroup();
        else renderHome();
      } catch (err) {
        alert('Ошибка чтения файла: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
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
        <input type="password" id="adminPass" placeholder="Введите пароль" autofocus>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="checkAdminPass()">Войти</button>
      <p style="margin-top:14px;font-size:0.8rem;color:var(--text-muted);text-align:center">
        Пароль по умолчанию: <code>iip2025</code> (смените в коде)
      </p>
    `;
    document.getElementById('adminPass').addEventListener('keydown', e => {
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
        <button class="btn-sm btn-danger" onclick="deleteGroup('${g}')">Удалить</button>
      </span>
    </li>
  `).join('');

  body.innerHTML = `
    <div class="admin-section">
      <h4>📁 Группы</h4>
      <ul class="admin-list">${groupList || '<li>Нет групп</li>'}</ul>
      <button class="btn btn-primary" onclick="addGroup()">+ Новая группа</button>
    </div>

    <div class="admin-section">
      <h4>🔄 Синхронизация</h4>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">
        Данные хранятся локально в браузере. Для переноса между телефонами/ПК используйте экспорт и импорт JSON-файла.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-gold" onclick="exportData()">⬇️ Экспорт</button>
        <button class="btn btn-secondary" onclick="importData()">⬆️ Импорт</button>
      </div>
    </div>

    <div class="admin-section">
      <h4>⚠️ Опасная зона</h4>
      <button class="btn btn-danger" onclick="resetAllData()">Сбросить все данные посещаемости</button>
    </div>

    <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="logoutAdmin()">Выйти из админки</button>
  `;
}

function addGroup() {
  const name = prompt('Название новой группы (например, ИС-23):');
  if (!name || !name.trim()) return;
  const key = name.trim().toUpperCase();
  if (GROUPS[key]) {
    alert('Группа уже существует');
    return;
  }
  GROUPS[key] = [];
  saveGroups();
  renderAdminPanel();
  showToast('Группа добавлена');
  if (!currentGroup) renderHome();
}

function editGroup(groupName) {
  const students = GROUPS[groupName] || [];
  const text = prompt(
    `Студенты группы ${groupName} (каждый с новой строки):`,
    students.join('\n')
  );
  if (text === null) return;
  const list = text.split('\n').map(s => s.trim()).filter(Boolean);
  GROUPS[groupName] = list;
  saveGroups();
  renderAdminPanel();
  showToast('Группа обновлена');
  if (currentGroup === groupName) renderGroup();
  else if (!currentGroup) renderHome();
}

function deleteGroup(groupName) {
  if (!confirm(`Удалить группу ${groupName} и все её данные посещаемости?`)) return;
  delete GROUPS[groupName];
  if (data[groupName]) delete data[groupName];
  saveGroups();
  save();
  renderAdminPanel();
  showToast('Группа удалена');
  if (currentGroup === groupName) renderHome();
  else if (!currentGroup) renderHome();
}

function resetAllData() {
  if (!confirm('Удалить ВСЕ отметки посещаемости? Группы останутся.')) return;
  data = {};
  save();
  showToast('Все отметки сброшены');
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
