// ── Config ────────────────────────────────────────────────────────────────
const API = 'http://localhost:8000';
let token = localStorage.getItem('ht_token');
let currentUser = localStorage.getItem('ht_user');
let weekChart = null;
let habits = [];

// ── DOM Refs ──────────────────────────────────────────────────────────────
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const habitsList = document.getElementById('habits-list');
const toastContainer = document.getElementById('toast-container');
const progressFill = document.getElementById('progress-fill');
const progressPct = document.getElementById('progress-pct');
const statBest = document.getElementById('stat-best');
const statDone = document.getElementById('stat-done');
const character = document.getElementById('character');
const charMood = document.getElementById('char-mood');
const milestonesWrap = document.getElementById('milestones');
const usernameTag = document.getElementById('username-tag');
const newHabitInput = document.getElementById('new-habit-input');

// ── Auth ──────────────────────────────────────────────────────────────────
const authTabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    authTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.tab;
    loginForm.style.display = mode === 'login' ? 'flex' : 'none';
    registerForm.style.display = mode === 'register' ? 'flex' : 'none';
  });
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) { toast('Заполните все поля', 'error'); return; }
  
  const btn = document.getElementById('login-btn');
  btn.textContent = '...';
  btn.disabled = true;
  
  try {
    const form = new URLSearchParams({ username, password });
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка входа');
    token = data.access_token;
    currentUser = username;
    localStorage.setItem('ht_token', token);
    localStorage.setItem('ht_user', username);
    enterApp();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.textContent = 'Войти';
    btn.disabled = false;
  }
});

document.getElementById('register-btn').addEventListener('click', async () => {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!username || !password) { toast('Заполните все поля', 'error'); return; }
  
  const btn = document.getElementById('register-btn');
  btn.textContent = '...';
  btn.disabled = true;
  
  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка регистрации');
    token = data.access_token;
    currentUser = username;
    localStorage.setItem('ht_token', token);
    localStorage.setItem('ht_user', username);
    toast('Добро пожаловать! 🎉', 'success');
    enterApp();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.textContent = 'Создать аккаунт';
    btn.disabled = false;
  }
});

// Enter/Exit App
function enterApp() {
  authScreen.style.display = 'none';
  appScreen.style.display = 'flex';
  usernameTag.innerHTML = `Привет, <span>${currentUser}</span>`;
  loadAll();
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('ht_token');
  localStorage.removeItem('ht_user');
  appScreen.style.display = 'none';
  authScreen.style.display = 'flex';
  if (weekChart) { weekChart.destroy(); weekChart = null; }
}

document.getElementById('logout-btn').addEventListener('click', logout);

// Init
if (token) {
  enterApp();
} else {
  authScreen.style.display = 'flex';
  appScreen.style.display = 'none';
}

// ── API Helpers ───────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (res.status === 401) { logout(); throw new Error('Сессия истекла'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Ошибка запроса');
  return data;
}

// ── Load All ──────────────────────────────────────────────────────────────
async function loadAll() {
  renderHabitsLoading();
  try {
    const [habitsData, statsData, weekData] = await Promise.all([
      api('GET', '/habits'),
      api('GET', '/stats'),
      api('GET', '/stats/week')
    ]);
    habits = habitsData;
    renderHabits(habitsData);
    renderStats(statsData);
    renderChart(weekData);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Habits Rendering ──────────────────────────────────────────────────────
function renderHabitsLoading() {
  habitsList.innerHTML = `
    <div class="loading-overlay"><div class="spinner"></div></div>
  `;
}

const DAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function renderHabits(habitsData) {
  if (!habitsData.length) {
    habitsList.innerHTML = `
      <div class="empty-state">
        <span class="emoji">🌱</span>
        <p>Нет привычек.<br>Добавьте первую через <span>форму слева</span>!</p>
      </div>`;
    return;
  }

  habitsList.innerHTML = '';
  const today = new Date().toISOString().split('T')[0];

  habitsData.forEach(habit => {
    const card = document.createElement('div');
    card.className = `habit-card${habit.done_today ? ' done' : ''}`;
    card.dataset.id = habit.id;

    const weekGridHtml = (habit.week_history || []).map((day, i) => {
      const isToday = day.date === today;
      const date = new Date(day.date);
      const dayLabel = DAYS_SHORT[date.getDay() === 0 ? 6 : date.getDay() - 1];
      return `
        <div class="day-dot-wrap" data-tip="${day.date}" onclick="toggleDay(${habit.id}, '${day.date}', this)">
          <div class="day-dot${day.done ? ' done' : ''}${isToday ? ' today' : ''}"></div>
          <span class="day-label${isToday ? ' today-label' : ''}">${isToday ? '•' : dayLabel}</span>
        </div>`;
    }).join('');

    const streakClass = habit.streak >= 3 ? ' hot' : '';
    const streakIcon = habit.streak >= 7 ? '🔥' : habit.streak >= 3 ? '⚡' : '○';

    card.innerHTML = `
      <div class="habit-top">
        <button class="habit-complete-btn" onclick="toggleHabit(${habit.id}, this)" title="Отметить сегодня">
          ${habit.done_today ? '✓' : ''}
        </button>
        <span class="habit-name" ondblclick="startEdit(${habit.id}, this)">${escHtml(habit.name)}</span>
        <div class="streak-badge${streakClass}">${streakIcon} ${habit.streak}</div>
        <button class="habit-delete-btn" onclick="deleteHabit(${habit.id}, this)" title="Удалить">✕</button>
      </div>
      <div class="week-grid">${weekGridHtml}</div>`;

    habitsList.appendChild(card);
  });
}

// ── Toggle Today ──────────────────────────────────────────────────────────
async function toggleHabit(id, btn) {
  const card = btn.closest('.habit-card');
  btn.disabled = true;
  try {
    const data = await api('POST', `/habits/${id}/complete`);
    const done = data.done;
    card.classList.toggle('done', done);
    btn.innerHTML = done ? '✓' : '';
    // Update dot for today
    const todayStr = new Date().toISOString().split('T')[0];
    const todayDot = card.querySelector(`[data-tip="${todayStr}"] .day-dot`);
    if (todayDot) todayDot.classList.toggle('done', done);
    // Update habit in memory
    const h = habits.find(h => h.id === id);
    if (h) h.done_today = done;
    await refreshStats();
    toast(done ? '✅ Выполнено!' : '↩ Отменено', done ? 'success' : '');
    bounceCharacter();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Toggle Past Day ───────────────────────────────────────────────────────
async function toggleDay(id, date, wrap) {
  const today = new Date().toISOString().split('T')[0];
  if (date === today) return; // handled by complete btn
  const dot = wrap.querySelector('.day-dot');
  try {
    if (date === today) {
      await api('POST', `/habits/${id}/complete`);
    } else {
      await api('POST', `/habits/${id}/backfill`, { date });
    }
    dot.classList.toggle('done');
    await refreshStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Edit Habit Name ───────────────────────────────────────────────────────
function startEdit(id, nameEl) {
  const current = nameEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'habit-name-input';
  input.value = current;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const save = async () => {
    const newName = input.value.trim();
    if (!newName || newName === current) {
      input.replaceWith(nameEl);
      return;
    }
    try {
      await api('PATCH', `/habits/${id}`, { name: newName });
      nameEl.textContent = newName;
      input.replaceWith(nameEl);
      const h = habits.find(h => h.id === id);
      if (h) h.name = newName;
      toast('✏️ Переименовано', 'success');
    } catch (e) {
      toast(e.message, 'error');
      input.replaceWith(nameEl);
    }
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') input.replaceWith(nameEl);
  });
}

// ── Delete Habit ──────────────────────────────────────────────────────────
async function deleteHabit(id, btn) {
  if (!confirm('Удалить привычку?')) return;
  const card = btn.closest('.habit-card');
  card.style.opacity = '0.5';
  try {
    await api('DELETE', `/habits/${id}`);
    card.style.animation = 'fadeInUp 0.3s ease reverse';
    setTimeout(() => card.remove(), 280);
    habits = habits.filter(h => h.id !== id);
    if (!habits.length) renderHabits([]);
    await refreshStats();
    toast('🗑️ Удалено', '');
  } catch (e) {
    card.style.opacity = '1';
    toast(e.message, 'error');
  }
}

// ── Add Habit ─────────────────────────────────────────────────────────────
document.getElementById('add-habit-btn').addEventListener('click', addHabit);
newHabitInput.addEventListener('keydown', e => { if (e.key === 'Enter') addHabit(); });

async function addHabit() {
  const name = newHabitInput.value.trim();
  if (!name) { toast('Введите название', 'error'); return; }
  const btn = document.getElementById('add-habit-btn');
  btn.textContent = '...';
  btn.disabled = true;
  try {
    const habit = await api('POST', '/habits', { name });
    habits.push({ ...habit, week_history: [] });
    newHabitInput.value = '';
    // Reload to get proper week_history
    await loadAll();
    toast('🌱 Привычка добавлена!', 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.textContent = '+ Добавить';
    btn.disabled = false;
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────
async function refreshStats() {
  try {
    const [statsData, weekData] = await Promise.all([
      api('GET', '/stats'),
      api('GET', '/stats/week')
    ]);
    renderStats(statsData);
    renderChart(weekData);
  } catch {}
}

function renderStats(data) {
  const pct = data.progress || 0;
  progressFill.style.width = `${pct}%`;
  progressPct.textContent = `${pct}%`;
  statBest.textContent = `🔥 ${data.best_streak}д`;
  statDone.textContent = `${data.done_today}/${data.total}`;

  updateCharacter(pct);

  milestonesWrap.innerHTML = '';
  (data.milestones || []).forEach(m => {
    const el = document.createElement('div');
    el.className = `milestone-badge ${m.level}`;
    el.innerHTML = `
      <span class="milestone-icon">${m.level === 'week' ? '🏆' : '⚡'}</span>
      <span class="milestone-text">${escHtml(m.name)}</span>
      <span class="milestone-count">${m.streak}д</span>`;
    milestonesWrap.appendChild(el);
  });
}

// ── Character ─────────────────────────────────────────────────────────────
const MOODS = [
  { min: 0,  emoji: '😴', mood: 'дремлет...' },
  { min: 1,  emoji: '😐', mood: 'просыпается' },
  { min: 40, emoji: '😊', mood: 'доволен' },
  { min: 70, emoji: '😄', mood: 'счастлив!' },
  { min: 100, emoji: '🤩', mood: 'восхищён!' },
];

function updateCharacter(pct) {
  const mood = [...MOODS].reverse().find(m => pct >= m.min) || MOODS[0];
  if (character.textContent !== mood.emoji) {
    character.textContent = mood.emoji;
    character.classList.remove('bounce');
    void character.offsetWidth;
    character.classList.add('bounce');
  }
  charMood.textContent = mood.mood;
}

function bounceCharacter() {
  character.classList.remove('bounce');
  void character.offsetWidth;
  character.classList.add('bounce');
}

// ── Chart ─────────────────────────────────────────────────────────────────
function renderChart(weekData) {
  const ctx = document.getElementById('week-chart').getContext('2d');
  const labels = weekData.map(d => d.label);
  const doneData = weekData.map(d => d.done);
  const totalData = weekData.map(d => d.total);

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const accent = isDark ? '#c4f135' : '#7aaa00';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#8888a0' : '#555568';

  if (weekChart) weekChart.destroy();

  weekChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Выполнено',
          data: doneData,
          backgroundColor: accent + 'cc',
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Всего',
          data: totalData.map((t, i) => t - doneData[i]),
          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 0) return ` Выполнено: ${ctx.raw}`;
              const total = totalData[ctx.dataIndex];
              return ` Всего: ${total}`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: textColor, font: { family: 'Inter', size: 11 } }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: textColor,
            font: { family: 'Inter', size: 11 }
          },
          grid: { color: gridColor }
        }
      }
    }
  });
}

// ── Theme ─────────────────────────────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('ht_theme') || 'dark';
applyTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('ht_theme', next);
  // Re-render chart for new colors
  api('GET', '/stats/week').then(renderChart).catch(() => {});
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ── Export ────────────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', async () => {
  try {
    const data = await api('GET', '/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `привычкин_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('📤 Данные экспортированы', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
});

// ── Date Display ──────────────────────────────────────────────────────────
const dateBadge = document.getElementById('date-badge');
const now = new Date();
const opts = { day: 'numeric', month: 'long', weekday: 'long' };
dateBadge.textContent = now.toLocaleDateString('ru-RU', opts);

// ── Toast ─────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

// ── Mobile Menu ───────────────────────────────────────────────────────────
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('overlay');

mobileMenuBtn?.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('visible');
});

overlay?.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
});

// ── Escape HTML ───────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
