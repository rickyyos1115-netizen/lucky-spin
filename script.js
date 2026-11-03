'use strict';
const DEFAULT_ITEMS = ['唱一首歌', '跳一段舞', '回答問題', '請喝飲料', '再抽一次', '安全過關'];
const ITEMS_KEY = 'luckySpin.items';
const HISTORY_KEY = 'luckySpin.history';
const MIN_ITEMS = 2, MAX_ITEMS = 12, MAX_LEN = 20, MAX_HISTORY = 10;
const COLORS = ['#8B5CF6', '#3B82F6', '#EC4899', '#F59E0B', '#10B981', '#EF4444',
                '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#14B8A6', '#E11D48'];
const TWO_PI = Math.PI * 2;
const POINTER_ANGLE = -Math.PI / 2; // 指針在正上方

const $ = (id) => document.getElementById(id);
const canvas = $('wheel'), ctx = canvas.getContext('2d');
const input = $('item-input'), errorBox = $('error'), list = $('item-list');

let items = [], history = [];
let angle = 0;          // 轉盤目前旋轉角度（弧度，順時針為正）
let spinning = false;
let editingIndex = -1;

/* ---------- LocalStorage（失敗時仍可正常運作） ---------- */
function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 忽略，僅保留在記憶體 */ }
}
function isValidItems(arr) {
  return Array.isArray(arr) && arr.length >= MIN_ITEMS && arr.length <= MAX_ITEMS &&
    arr.every((s) => typeof s === 'string' && s.trim() && [...s].length <= MAX_LEN) &&
    new Set(arr).size === arr.length;
}
function isValidHistory(arr) {
  return Array.isArray(arr) && arr.every((r) => r && typeof r.name === 'string' &&
    typeof r.date === 'string' && typeof r.time === 'string');
}
const saveItems = () => saveJSON(ITEMS_KEY, items);
const saveHistory = () => saveJSON(HISTORY_KEY, history);

/* ---------- 驗證與選項管理 ---------- */
function validateName(raw, ignoreIndex = -1) {
  const name = raw.trim();
  if (!name) return '選項不可為空白。';
  if ([...name].length > MAX_LEN) return `選項名稱最多 ${MAX_LEN} 個字元。`;
  if (items.some((it, i) => i !== ignoreIndex && it === name)) return '已經有相同名稱的選項了。';
  return '';
}
const showError = (msg) => { errorBox.textContent = msg; };

function addItem() {
  if (spinning) return;
  if (items.length >= MAX_ITEMS) return showError(`最多只能有 ${MAX_ITEMS} 個選項。`);
  const err = validateName(input.value);
  if (err) return showError(err);
  items.push(input.value.trim());
  input.value = '';
  showError('');
  commitItems();
  input.focus();
}
function deleteItem(i) {
  if (spinning) return;
  if (items.length <= MIN_ITEMS) return showError(`至少要保留 ${MIN_ITEMS} 個選項。`);
  items.splice(i, 1);
  editingIndex = -1;
  showError('');
  commitItems();
}
function saveEdit(i, value) {
  const err = validateName(value, i);
  if (err) return showError(err);
  items[i] = value.trim();
  editingIndex = -1;
  showError('');
  commitItems();
}
function restoreDefaults() {
  if (spinning || !confirm('確定要恢復預設選項嗎？目前的選項將被取代。')) return;
  items = [...DEFAULT_ITEMS];
  editingIndex = -1;
  showError('');
  commitItems();
}
function commitItems() { saveItems(); renderList(); drawWheel(); }

/* ---------- 清單渲染（一律使用 textContent） ---------- */
function makeButton(text, cls, onClick, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-small ' + cls;
  b.textContent = text;
  b.disabled = spinning;
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}
function renderList() {
  list.replaceChildren();
  $('count').textContent = `${items.length}/${MAX_ITEMS}`;
  items.forEach((name, i) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = COLORS[i % COLORS.length];
    li.append(dot);
    if (i === editingIndex) {
      const field = document.createElement('input');
      field.type = 'text';
      field.value = name;
      field.setAttribute('aria-label', '編輯選項');
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEdit(i, field.value);
        if (e.key === 'Escape') { e.stopPropagation(); editingIndex = -1; showError(''); renderList(); }
      });
      li.append(field,
        makeButton('儲存', 'btn-primary', () => saveEdit(i, field.value)),
        makeButton('取消', '', () => { editingIndex = -1; showError(''); renderList(); }));
      list.append(li);
      field.focus();
      return;
    }
    const label = document.createElement('span');
    label.className = 'item-name';
    label.textContent = name;
    li.append(label,
      makeButton('編輯', '', () => { editingIndex = i; showError(''); renderList(); }, `編輯 ${name}`),
      makeButton('刪除', 'btn-danger', () => deleteItem(i), `刪除 ${name}`));
    list.append(li);
  });
  const locked = spinning;
  input.disabled = $('add-btn').disabled = $('restore-btn').disabled = locked;
}

/* ---------- 轉盤繪製 ---------- */
function fitText(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = [...text];
  while (t.length > 1 && ctx.measureText(t.join('') + '…').width > maxWidth) t.pop();
  return t.join('') + '…';
}
function drawWheel() {
  const size = canvas.width, c = size / 2, r = c - 22;
  const slice = TWO_PI / items.length;
  ctx.clearRect(0, 0, size, size);

  // 外框
  ctx.save();
  ctx.shadowColor = 'rgba(139,92,246,.6)';
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(c, c, c - 6, 0, TWO_PI);
  const rim = ctx.createLinearGradient(0, 0, size, size);
  rim.addColorStop(0, '#A78BFA');
  rim.addColorStop(1, '#3B82F6');
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.restore();

  // 扇形與文字
  items.forEach((name, i) => {
    const start = angle + i * slice;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(start + slice / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(18, 30 - items.length)}px "Noto Sans TC","Microsoft JhengHei",sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(fitText(name, r * 0.62), r - 22, 0);
    ctx.restore();
  });

  // 中心圓
  ctx.beginPath();
  ctx.arc(c, c, 34, 0, TWO_PI);
  ctx.fillStyle = '#0F172A';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#FACC15';
  ctx.stroke();
}

/* ---------- 旋轉邏輯 ---------- */
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const mod = (x) => ((x % TWO_PI) + TWO_PI) % TWO_PI;

// 回傳「從目前角度出發，轉到指針對準 winnerIndex 扇形中央」所需的總旋轉量
function computeTotalRotation(currentAngle, winnerIndex, count, fullTurns = 5) {
  const slice = TWO_PI / count;
  const targetAngle = mod(POINTER_ANGLE - (winnerIndex + 0.5) * slice);
  const delta = mod(targetAngle - currentAngle);
  return fullTurns * TWO_PI + delta;
}

function spin() {
  if (spinning || items.length < MIN_ITEMS) return;
  const winnerIndex = Math.floor(Math.random() * items.length); // 先決定結果
  const winnerName = items[winnerIndex];
  const startAngle = angle;
  const total = computeTotalRotation(startAngle, winnerIndex, items.length);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 1200 : 4000;
  setSpinning(true);
  const t0 = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - t0) / duration);
    angle = startAngle + total * easeOutCubic(t);
    drawWheel();
    if (t < 1) return requestAnimationFrame(frame);
    angle = mod(angle); // 正規化，避免角度無限累積
    drawWheel();
    setSpinning(false);
    addHistory(winnerName);
    showResult(winnerName);
  }
  requestAnimationFrame(frame);
}
function setSpinning(value) {
  spinning = value;
  editingIndex = -1;
  $('spin-btn').disabled = value;
  $('clear-btn').disabled = value;
  renderList();
}

/* ---------- 歷史紀錄 ---------- */
function addHistory(name) {
  const now = new Date();
  history.unshift({ name, date: now.toLocaleDateString('zh-TW'), time: now.toLocaleTimeString('zh-TW', { hour12: false }) });
  history = history.slice(0, MAX_HISTORY);
  saveHistory();
  renderHistory();
}
function renderHistory() {
  const ol = $('history-list');
  ol.replaceChildren();
  if (!history.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '目前還沒有抽籤紀錄';
    ol.append(li);
  }
  history.forEach((r) => {
    const li = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = r.name;
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = `${r.date} ${r.time}`;
    li.append(name, when);
    ol.append(li);
  });
  $('clear-btn').disabled = spinning || !history.length;
}
function clearHistory() {
  if (spinning || !history.length || !confirm('確定要清除所有抽籤紀錄嗎？')) return;
  history = [];
  saveHistory();
  renderHistory();
}

/* ---------- 結果視窗 ---------- */
function showResult(name) {
  $('result').textContent = name;
  launchConfetti();
  $('modal').hidden = false;
  $('ok-btn').focus();
}
function closeModal() {
  if ($('modal').hidden) return;
  $('modal').hidden = true;
  $('confetti').replaceChildren();
  $('spin-btn').focus();
}
function launchConfetti() {
  const box = $('confetti');
  box.replaceChildren();
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = COLORS[i % COLORS.length];
    s.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
    s.style.animationDelay = Math.random() * 0.4 + 's';
    box.append(s);
  }
}

/* ---------- 初始化 ---------- */
function init() {
  const savedItems = loadJSON(ITEMS_KEY);
  items = isValidItems(savedItems) ? savedItems : [...DEFAULT_ITEMS];
  const savedHistory = loadJSON(HISTORY_KEY);
  history = isValidHistory(savedHistory) ? savedHistory.slice(0, MAX_HISTORY) : [];

  $('add-btn').addEventListener('click', addItem);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });
  $('restore-btn').addEventListener('click', restoreDefaults);
  $('spin-btn').addEventListener('click', spin);
  $('clear-btn').addEventListener('click', clearHistory);
  $('ok-btn').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    // 簡易焦點鎖定：彈窗開啟時 Tab 停留在確定按鈕
    if (e.key === 'Tab' && !$('modal').hidden) { e.preventDefault(); $('ok-btn').focus(); }
  });
  renderList();
  renderHistory();
  drawWheel();
}
init();
