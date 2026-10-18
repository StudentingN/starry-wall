import { PALETTE, StrokeHistory, findPlacement, isBlessing, makeDrawing, normalizeEntry, textLength } from './core.js';
import { samples } from './samples.js';
import { Wall, paintStroke } from './wall.js';
import { hydrateIcons, icon } from './icons.js';
import { storage } from './storage.js';
import { Celebration, Danmaku } from './effects.js';

const $ = selector => document.querySelector(selector);
hydrateIcons();
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let preferences = { reducedMotion: motionQuery.matches, sound: false, showSamples: true, caughtSamples: [] };
let entries = [], loaded = false, loading = false, saving = false, mode = 'browse', selectedEntry = null, category = 'daily', categoryManual = false, textColor = PALETTE[0], effect = 'meteors';
let celebration = { active: false, async play() { return false; }, stop() {} };
let danmaku = { update() {}, flash() {}, toggle() {}, stop() {} };
const history = new StrokeHistory();
let toastTimer;
function toast(message, duration = 4000) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, duration); }
function errorIn(selector, message) { const node = $(selector); node.textContent = message || ''; node.hidden = !message; }
function currentEntries() { return [...(preferences.showSamples ? samples.map(entry => ({ ...entry, caught: preferences.caughtSamples.includes(entry.id) })) : []), ...entries]; }
function refresh() { wall.setEntries(currentEntries()); danmaku.update(currentEntries().filter(entry => entry.kind === 'text')); }
const wall = new Wall($('#wall'), {
  onSelect: showDetail,
  onCamera(camera) { $('#zoom-value').textContent = Math.round(camera.zoom * 100) + '%'; },
  onStroke(stroke) {
    if (saving) return;
    if (history.strokes.length >= 2000) { toast('这幅画的笔画很多了，先发布，再开始下一幅吧。'); return; }
    history.add(stroke); updateDraft();
  },
});
function updateDraft() {
  wall.setDraft(history.strokes);
  $('#undo').disabled = saving || !history.strokes.length;
  $('#redo').disabled = saving || !history.future.length;
  $('#publish-drawing').disabled = saving || !history.strokes.length;
}
function setMode(next) {
  if (saving) return;
  mode = next; wall.setMode(next);
  $('#draw-tools').hidden = next !== 'draw';
  $('#browse-mode').classList.toggle('active', next === 'browse');
  $('#browse-mode').setAttribute('aria-pressed', next === 'browse');
  $('#draw-mode').classList.toggle('active', next === 'draw');
  $('#draw-mode').setAttribute('aria-pressed', next === 'draw');
  $('#mode-hint').innerHTML = next === 'draw' ? '画在墙上 · 双指调整视角 · 完成后发布' : '拖动墙面，遇见一句心事 <span>↔</span>';
  $('#mode-hint').hidden = next === 'draw';
  requestAnimationFrame(() => wall.resize());
}
function colors(container, initial, onChange) {
  for (const [index, color] of PALETTE.entries()) {
    const names = ['晚霞橘', '樱花粉', '星雾蓝', '鼠尾草绿', '月光金', '暖纸白'];
    const button = document.createElement('button'); button.type = 'button'; button.className = 'color-swatch'; button.style.setProperty('--swatch', color); button.dataset.color = color; button.setAttribute('aria-label', names[index]); button.title = names[index]; button.setAttribute('aria-pressed', color === initial);
    button.onclick = () => { container.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', item === button)); onChange(color); };
    container.append(button);
  }
}
colors($('#brush-colors'), wall.color, color => wall.color = color);
colors($('#text-colors'), textColor, color => { textColor = color; $('#message').style.color = color; });
for (const width of [3, 7, 12]) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'width-button'; button.dataset.width = width; button.setAttribute('aria-label', width + ' 像素画笔'); button.setAttribute('aria-pressed', width === wall.width); const dot = document.createElement('i'); dot.style.width = dot.style.height = Math.min(width + 1, 13) + 'px'; button.append(dot);
  button.onclick = () => { wall.width = width; $('#brush-widths').querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', node === button)); };
  $('#brush-widths').append(button);
}
$('#zoom-in').onclick = () => wall.zoom(1.2);
$('#zoom-out').onclick = () => wall.zoom(1 / 1.2);
$('#center-view').onclick = () => wall.center();
$('#browse-mode').onclick = () => { setMode('browse'); if (history.strokes.length) toast('涂鸦草稿还在，回到画笔可以继续。'); };
$('#draw-mode').onclick = () => { setMode('draw'); wall.element.focus(); };
$('#undo').onclick = () => { history.undo(); updateDraft(); };
$('#redo').onclick = () => { history.redo(); updateDraft(); };
$('#cancel-drawing').onclick = () => { if (saving) return; history.clear(); updateDraft(); setMode('browse'); };
$('#compose-open').onclick = () => { if (saving) return; setMode('browse'); errorIn('#compose-error', ''); $('#composer').showModal(); $('#message').focus(); };
$('#collection-open').onclick = () => { renderCollection(); $('#collection').showModal(); };
$('#settings-open').onclick = () => { syncSettings(); $('#settings').showModal(); };
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => { if (!saving) document.getElementById(button.dataset.close).close(); });
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || saving) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});
function setCategory(next, manual = false) {
  category = next; if (manual) categoryManual = true;
  document.querySelectorAll('[data-category]').forEach(node => node.setAttribute('aria-pressed', node.dataset.category === category));
  $('#effect-field').hidden = category !== 'blessing';
}
document.querySelectorAll('[data-category]').forEach(button => button.onclick = () => setCategory(button.dataset.category, true));
document.querySelectorAll('[data-effect]').forEach(button => button.onclick = () => {
  effect = button.dataset.effect; document.querySelectorAll('[data-effect]').forEach(node => node.setAttribute('aria-pressed', node === button));
});
function updateMessage() {
  const text = $('#message').value;
  $('#character-count').textContent = textLength(text) + ' / 120';
  $('#character-count').style.color = textLength(text) > 120 ? '#f2b1ae' : '';
  const recommended = isBlessing(text);
  $('#blessing-hint').textContent = recommended ? '✧ 这句话适合送出祝福，也可以自己选择。' : '每一句平常的话，也有它的光。';
  $('#blessing-hint').classList.toggle('recommended', recommended);
  if (!categoryManual) setCategory(recommended ? 'blessing' : 'daily');
}
$('#message').addEventListener('input', updateMessage);
function busy(value) {
  saving = value; wall.element.style.pointerEvents = value ? 'none' : '';
  $('#publish-text').disabled = value;
  $('#publish-text').innerHTML = value ? '正在保存…' : '留在墙上 ' + icon('arrow');
  $('#publish-drawing').innerHTML = value ? '正在保存…' : '发布涂鸦 ' + icon('arrow');
  for (const control of $('#compose-form').elements) control.disabled = value;
  $('#cancel-drawing').disabled = value;
  $('#brush-colors').querySelectorAll('button').forEach(button => button.disabled = value);
  $('#brush-widths').querySelectorAll('button').forEach(button => button.disabled = value);
  updateDraft();
}
async function ensureLoaded() { if (!loaded && !await loadData()) throw new Error('无法读取已有作品。请检查浏览器存储权限后重试；草稿已保留。'); }
$('#compose-form').addEventListener('submit', async event => {
  event.preventDefault(); if (saving) return;
  errorIn('#compose-error', '');
  let entry;
  try {
    const position = findPlacement(currentEntries(), wall.camera);
    entry = normalizeEntry({ id: crypto.randomUUID(), kind: 'text', ...position, createdAt: Date.now(), text: $('#message').value, color: textColor, category, effect });
  } catch (error) { errorIn('#compose-error', error.message); return; }
  busy(true);
  try {
    await ensureLoaded(); await storage.saveEntry(entry); entries.push(entry); refresh();
    $('#composer').close(); $('#message').value = ''; categoryManual = false; setCategory('daily'); updateMessage(); wall.focusEntry(entry);
    toast(entry.category === 'blessing' ? '祝福已留在墙上，愿它抵达。' : '已经留下啦，今晚多了一点星光。');
    if (entry.category === 'blessing' && entry.effect !== 'none') {
      if (!celebration.active) { danmaku.stop(); celebration.play(entry, preferences).then(() => wall.pulse(entry.id)); }
    } else danmaku.flash(entry);
  } catch (error) { errorIn('#compose-error', '没有保存成功，草稿已保留。' + error.message); }
  finally { busy(false); }
});
$('#publish-drawing').onclick = async () => {
  if (saving || !history.strokes.length) return;
  let entry;
  try { entry = normalizeEntry({ id: crypto.randomUUID(), kind: 'drawing', createdAt: Date.now(), color: wall.color, ...makeDrawing(history.strokes) }); }
  catch (error) { toast(error.message, 6000); return; }
  busy(true);
  try {
    await ensureLoaded(); await storage.saveEntry(entry); entries.push(entry); history.clear(); refresh(); busy(false); setMode('browse'); wall.focusEntry(entry); wall.pulse(entry.id); toast('这一笔，已经留在星空里。');
  } catch (error) { toast('没有保存成功，涂鸦草稿还在。' + error.message, 7000); }
  finally { busy(false); }
};
function renderCollection() {
  const list = $('#collection-list'); list.replaceChildren();
  const own = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  if (!own.length) { list.innerHTML = '<div class="empty-state"><span>✧</span>这里还在等你的第一束光。<br>写一句话，或画一个小小的自己。</div>'; return; }
  for (const entry of own) {
    const button = document.createElement('button'); button.className = 'collection-item';
    const symbol = document.createElement('span'); symbol.className = 'item-symbol'; symbol.textContent = entry.kind === 'drawing' ? '✎' : entry.category === 'blessing' ? '✧' : entry.category === 'love' ? '♡' : '↗'; symbol.style.color = entry.color;
    const info = document.createElement('span'), title = document.createElement('strong'), date = document.createElement('small');
    title.textContent = entry.kind === 'text' ? entry.text.replaceAll('\n', ' ') : '我的随手涂鸦';
    date.textContent = new Date(entry.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' · 点击定位';
    info.append(title, date); button.append(symbol, info); button.onclick = () => { $('#collection').close(); setMode('browse'); wall.focusEntry(entry); wall.pulse(entry.id); showDetail(entry); }; list.append(button);
  }
}
function action(label, name, callback, className = 'quiet-button') {
  const button = document.createElement('button'); button.className = className; button.innerHTML = icon(name); const span = document.createElement('span'); span.textContent = label; button.append(span); button.onclick = callback; return button;
}
function showDetail(entry) {
  if (!entry || saving) return;
  selectedEntry = entry; errorIn('#detail-error', '');
  $('#detail-meta').textContent = (entry.sample ? '示例作品' : '我留下的作品') + ' · ' + (entry.kind === 'drawing' ? '随手涂鸦' : ({ daily: '日常碎片', love: '悄悄表白', blessing: '送出祝福' })[entry.category]);
  const content = $('#detail-content'); content.replaceChildren();
  if (entry.kind === 'text') { const paragraph = document.createElement('p'); paragraph.className = 'detail-text'; paragraph.textContent = entry.text; paragraph.style.color = entry.color; content.append(paragraph); }
  else {
    const canvas = document.createElement('canvas'); const ratio = Math.min(2, 700 / Math.max(entry.width, entry.height));
    canvas.width = Math.ceil(entry.width * ratio); canvas.height = Math.ceil(entry.height * ratio); canvas.setAttribute('aria-label', '涂鸦作品预览'); const context = canvas.getContext('2d'); context.scale(ratio, ratio); entry.strokes.forEach(stroke => paintStroke(context, stroke)); content.append(canvas);
  }
  const actions = $('#detail-actions'); actions.replaceChildren();
  actions.append(action('定位', 'home', () => { $('#detail').close(); setMode('browse'); wall.focusEntry(entry); wall.pulse(entry.id); }));
  if (entry.category === 'blessing') {
    const caught = entry.sample ? preferences.caughtSamples.includes(entry.id) : entry.caught;
    actions.append(action(caught ? '已接住 · 仅本机' : '接住祝福', 'star', async () => {
      if (saving || caught) return; saving = true;
      try {
        if (entry.sample) { const next = { ...preferences, caughtSamples: [...new Set([...preferences.caughtSamples, entry.id])] }; await storage.savePreferences(next); preferences = next; }
        else { const next = { ...entry, caught: true }; await storage.saveEntry(next); entries = entries.map(item => item.id === entry.id ? next : item); entry = next; }
        refresh(); saving = false; showDetail(entry); toast('接住啦，愿好事慢慢发生。');
      } catch (error) { errorIn('#detail-error', '没有保存成功，请重试。' + error.message); }
      finally { saving = false; }
    }, 'primary-button'));
    if (entry.effect !== 'none') actions.append(action('重播', 'play', () => { if (celebration.active) { toast('等这场祝福结束，再送下一场吧。'); return; } $('#detail').close(); wall.focusEntry(entry); danmaku.stop(); celebration.play(entry, preferences).then(() => wall.pulse(entry.id)); }));
  }
  if (!entry.sample) actions.append(action('删除', 'trash', async () => {
    if (saving) return;
    if (!confirm('删除这件作品？此操作无法撤销。')) return;
    saving = true;
    try { await storage.deleteEntry(entry.id); entries = entries.filter(item => item.id !== entry.id); refresh(); $('#detail').close(); toast('作品已从当前浏览器删除。'); }
    catch (error) { errorIn('#detail-error', '删除失败，作品仍在。' + error.message); }
    finally { saving = false; }
  }, 'quiet-button danger'));
  if (!$('#detail').open) $('#detail').showModal();
}
function syncSettings() {
  $('#reduced-motion').checked = preferences.reducedMotion;
  $('#sound-enabled').checked = preferences.sound;
  $('#show-samples').checked = preferences.showSamples;
}
for (const [selector, key] of [['#reduced-motion', 'reducedMotion'], ['#sound-enabled', 'sound'], ['#show-samples', 'showSamples']]) {
  $(selector).onchange = async event => {
    const next = { ...preferences, [key]: event.target.checked };
    document.querySelectorAll('.setting-row input').forEach(input => input.disabled = true); errorIn('#settings-error', '');
    try { await ensureLoaded(); await storage.savePreferences(next); preferences = next; if (key === 'reducedMotion' && next[key]) { celebration.stop(); danmaku.stop(); } refresh(); syncSettings(); }
    catch (error) { syncSettings(); errorIn('#settings-error', '设置未保存，请重试。' + error.message); }
    finally { document.querySelectorAll('.setting-row input').forEach(input => input.disabled = false); }
  };
}
motionQuery.addEventListener('change', event => {
  if (event.matches) { preferences.reducedMotion = true; celebration.stop(); danmaku.stop(); syncSettings(); }
});
async function loadData() {
  if (loading) return false;
  loading = true;
  try {
    const data = await storage.load(); entries = data.entries;
    preferences = { ...preferences, reducedMotion: typeof data.preferences.reducedMotion === 'boolean' ? data.preferences.reducedMotion : motionQuery.matches, sound: data.preferences.sound === true, showSamples: data.preferences.showSamples !== false, caughtSamples: Array.isArray(data.preferences.caughtSamples) ? data.preferences.caughtSamples.filter(id => typeof id === 'string') : [] };
    loaded = true; refresh(); syncSettings();
    $('#storage-status').innerHTML = '<i></i> 只留在你的浏览器里';
    if (data.invalidCount) toast('有 ' + data.invalidCount + ' 件作品暂时无法读取，原始数据仍保留在浏览器中。', 7000);
    return true;
  } catch (error) {
    $('#storage-status').textContent = '本地存储不可用 · 发布时可重试';
    toast(error.message, 7000); return false;
  } finally { loading = false; }
}
$('#danmaku-toggle').onclick = () => danmaku.toggle();
document.addEventListener('keydown', event => {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') || ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (event.key.toLowerCase() === 't') { event.preventDefault(); $('#compose-open').click(); }
  if (event.key.toLowerCase() === 'd') { event.preventDefault(); $('#draw-mode').click(); }
  if (event.key === 'Escape' && mode === 'draw') $('#browse-mode').click();
});
refresh();
await loadData();
celebration = new Celebration($('#celebration'));
danmaku = new Danmaku($('#danmaku-layer'), $('#danmaku-toggle'), () => preferences.reducedMotion);
danmaku.update(currentEntries().filter(entry => entry.kind === 'text'));

document.documentElement.dataset.ready = 'true';
