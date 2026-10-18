import { PALETTE, StrokeHistory, findPlacement, isBlessing, makeDrawing, normalizeEntry, textLength, worldToScreen } from './core.js';
import { samples, initSamples } from './samples.js';
import { loadCatalog } from './catalog.js';
import { GlobeView } from './globe.js';
import { UNASSIGNED, MARKERS, normalizeMarker, markerIcon, cityPath } from './geo.js';
import { Wall, paintStroke } from './wall.js';
import { hydrateIcons, icon } from './icons.js';
import { storage } from './storage.js';
import { Celebration, Danmaku } from './effects.js';

const $ = selector => document.querySelector(selector);
hydrateIcons();
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let preferences = { reducedMotion: motionQuery.matches, sound: false, showSamples: true, caughtSamples: [], homeCityId: null };
let entries = [], loaded = false, loading = false, saving = false, mode = 'browse', selectedEntry = null, category = 'daily', categoryManual = false, textColor = PALETTE[0], effect = 'meteors';
let celebration = { active: false, async play() { return false; }, stop() {} };
let danmaku = { update() {}, flash() {}, toggle() {}, stop() {} };
const history = new StrokeHistory();
let catalog, globe, currentCity=null, composeCity=null, drawingCity=null, citySummaries=[], view='globe', cityRequest=0;
let textMarker=normalizeMarker({},PALETTE[0]), textMarkerManual=false, drawingMarker=normalizeMarker({preset:'cat',title:'随手画'},PALETTE[0]);
let pickerCallback=null, pickerMode='explore', locationRequest=0, selectedPreview=null, markerContext='text', markerEntry=null, markerDraft=normalizeMarker(), markerCity=null, collectionEntries=[];
const drafts=new Map(), legacySelection=new Set();
let toastTimer;
function toast(message, duration = 4000) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, duration); }
function errorIn(selector, message) { const node = $(selector); node.textContent = message || ''; node.hidden = !message; }
function currentEntries() { return [...(preferences.showSamples && currentCity ? samples.filter(entry=>entry.cityId===currentCity.id).map(entry => ({ ...entry, caught: preferences.caughtSamples.includes(entry.id) })) : []), ...entries]; }
function refresh() { wall.setEntries(view==='city'?currentEntries():[]); danmaku.update(currentEntries().filter(entry=>entry.kind==='text')); syncGlobeSummaries(); updateDraftCaption(); }
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
  wall.setDraft(history.strokes); updateDraftCaption();
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
$('#draw-mode').onclick = () => { if(saving)return;if(view!=='city'){openCityPicker('explore',async city=>{await enterCity(city);setMode('draw');wall.element.focus();});return;}setMode('draw');wall.element.focus(); };
$('#undo').onclick = () => { history.undo(); updateDraft(); };
$('#redo').onclick = () => { history.redo(); updateDraft(); };
$('#cancel-drawing').onclick = () => { if (saving) return; history.clear(); updateDraft(); setMode('browse'); };
function openComposer(){if(saving)return;if(view!=='city'){openCityPicker('explore',async city=>{if(await enterCity(city))openComposer();});return;}setMode('browse');composeCity ||= currentCity;updateMarkerSummaries();errorIn('#compose-error','');$('#composer').showModal();$('#message').focus();}
$('#compose-open').onclick=openComposer;
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
  if(!textMarkerManual)textMarker=normalizeMarker({},textColor,category);updateMarkerSummaries();
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
  updateDraftCaption();
}
$('#message').addEventListener('input', updateMessage);
function busy(value) {
  saving = value; wall.element.style.pointerEvents = value ? 'none' : '';
  $('#publish-text').disabled = value;
  $('#publish-text').innerHTML = value ? '正在保存…' : '留在墙上 ' + icon('arrow');
  $('#publish-drawing').innerHTML = value ? '正在保存…' : '发布涂鸦 ' + icon('arrow');
  for (const control of $('#compose-form').elements) control.disabled = value;
  $('#cancel-drawing').disabled = value;
  $('#text-marker').disabled=value;$('#text-city-select').disabled=value;$('#drawing-marker').disabled=value;
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
    if(!composeCity||!catalog?.byId.has(composeCity.id))throw new Error('请先确认发言城市。');
    entry = normalizeEntry({ id:crypto.randomUUID(),kind:'text',x:2860,y:1930,createdAt:Date.now(),text:$('#message').value,color:textColor,category,effect,cityId:composeCity.id,marker:textMarker });
  } catch (error) { errorIn('#compose-error', error.message); return; }
  busy(true);
  try {
    await ensureLoaded();
    const targetCity=composeCity, targetEntries=targetCity.id===currentCity?.id?currentEntries():await storage.listEntries(targetCity.id);
    Object.assign(entry,findPlacement(targetEntries,targetCity.id===currentCity?.id?wall.camera:{x:3000,y:2000}));
    await storage.saveEntry(entry);
    $('#composer').close();$('#message').value='';composeCity=currentCity;categoryManual=false;textMarkerManual=false;setCategory('daily');updateMessage();
    if(currentCity?.id===targetCity.id){entries.push(entry);refresh();}else await enterCity(targetCity);
    stashDraft();await reloadSummaries();wall.focusEntry(entry);
    toast(entry.category === 'blessing' ? '祝福已留在墙上，愿它抵达。' : '已经留下啦，今晚多了一点星光。');
    if (entry.category === 'blessing' && entry.effect !== 'none') {
      if (!celebration.active) { danmaku.stop(); playBlessing(entry); }
    } else danmaku.flash(entry);
  } catch (error) { errorIn('#compose-error', '没有保存成功，草稿已保留。' + error.message); }
  finally { busy(false); }
});
$('#publish-drawing').onclick = async () => {
  if (saving || !history.strokes.length) return;
  let entry;
  try { entry = normalizeEntry({ id: crypto.randomUUID(), kind: 'drawing', createdAt: Date.now(), color: wall.color, cityId:(drawingCity||currentCity)?.id, marker:drawingMarker, ...makeDrawing(history.strokes) }); }
  catch (error) { toast(error.message, 6000); return; }
  busy(true);
  try {
    if(!catalog?.byId.has(entry.cityId))throw new Error('请先选择涂鸦的归属城市。');
    await ensureLoaded();await storage.saveEntry(entry);const targetCity=catalog.byId.get(entry.cityId);
    history.clear();drawingCity=currentCity;stashDraft();busy(false);
    if(currentCity?.id===targetCity.id){entries.push(entry);refresh();}else await enterCity(targetCity);
    setMode('browse');await reloadSummaries();wall.focusEntry(entry);wall.pulse(entry.id);toast('这一笔，已经留在'+targetCity.name+'的星空里。');
  } catch (error) { toast('没有保存成功，涂鸦草稿还在。' + error.message, 7000); }
  finally { busy(false); }
};
async function renderCollection() {
  const list=$('#collection-list');list.innerHTML='<p class="muted">正在翻开你的作品……</p>';
  try{
    collectionEntries=await storage.listMyEntries();list.replaceChildren();legacySelection.clear();
    const legacy=collectionEntries.filter(entry=>entry.cityId===UNASSIGNED);
    $('#legacy-tools').hidden=!legacy.length;$('#legacy-count').textContent=legacy.length+' 件旧作品待归属，原内容和笔画均已保留。';$('#assign-legacy').disabled=true;
    if(!collectionEntries.length){list.innerHTML='<div class="empty-state"><span>✧</span>这里还在等你的第一束光。<br>选一座城，留下一句喜欢。</div>';return;}
    for(const entry of collectionEntries){
      const row=document.createElement('div');row.className='collection-row';
      if(entry.cityId===UNASSIGNED){const check=document.createElement('input');check.type='checkbox';check.dataset.legacyId=entry.id;check.setAttribute('aria-label','选择待归属作品');check.onchange=()=>{check.checked?legacySelection.add(entry.id):legacySelection.delete(entry.id);$('#assign-legacy').disabled=!legacySelection.size;};row.append(check);}
      const button=document.createElement('button');button.className='collection-item';button.dataset.collectionId=entry.id;
      const symbol=document.createElement('span');symbol.className='item-symbol';symbol.textContent=markerIcon(entry.marker);symbol.style.color=entry.marker.color;
      const info=document.createElement('span'),title=document.createElement('strong'),date=document.createElement('small');
      title.textContent=entry.kind==='text'?entry.text.replaceAll('\\n',' '):entry.marker.title||'我的随手涂鸦';
      const city=catalog?.byId.get(entry.cityId);date.textContent=(city?city.name:'待归属作品')+' · '+new Date(entry.createdAt).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      info.append(title,date);button.append(symbol,info);button.onclick=async()=>{if(saving)return;$('#collection').close();if(city){if(!await enterCity(city))return;wall.focusEntry(entry);wall.pulse(entry.id);}showDetail(entry);};row.append(button);list.append(row);
    }
  }catch(error){list.textContent='暂时无法读取作品。'+error.message;}
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
  if(catalog?.byId.has(entry.cityId))actions.append(action('定位','home',async()=>{$('#detail').close();if(currentCity?.id!==entry.cityId||view!=='city')await enterCity(catalog.byId.get(entry.cityId));setMode('browse');wall.focusEntry(entry);wall.pulse(entry.id);}));
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
    if (entry.effect !== 'none') actions.append(action('重播', 'play', () => { if (celebration.active) { toast('等这场祝福结束，再送下一场吧。'); return; } $('#detail').close();if(currentCity?.id===entry.cityId)wall.focusEntry(entry);danmaku.stop();playBlessing(entry); }));
  }
  if(!entry.sample){actions.append(action('编辑标签','pen',()=>openMarker('edit',entry.marker,entry)));actions.append(action(entry.cityId===UNASSIGNED?'选择归属':'更改城市','globe',()=>openCityPicker('assign',city=>assignWorks([entry.id],city))));}
  if (!entry.sample) actions.append(action('删除', 'trash', async () => {
    if (saving) return;
    if (!confirm('删除这件作品？此操作无法撤销。')) return;
    saving = true;
    try { await storage.deleteEntry(entry.id); entries = entries.filter(item => item.id !== entry.id); refresh(); await reloadSummaries(); $('#detail').close(); toast('作品已从当前浏览器删除。'); }
    catch (error) { errorIn('#detail-error', '删除失败，作品仍在。' + error.message); }
    finally { saving = false; }
  }, 'quiet-button danger'));
  if (!$('#detail').open) $('#detail').showModal();
}
function syncSettings() {
  $('#reduced-motion').checked = preferences.reducedMotion;
  $('#sound-enabled').checked = preferences.sound;
  $('#show-samples').checked = preferences.showSamples;
  globe?.setReducedMotion(preferences.reducedMotion);const home=catalog?.byId.get(preferences.homeCityId);$('#my-city').querySelector('span:last-child').textContent=home?'回到'+home.name:'选择我的城市';
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
  if(loading)return false;loading=true;
  try{
    const stored=await storage.loadPreferences();
    preferences={...preferences,reducedMotion:typeof stored.reducedMotion==='boolean'?stored.reducedMotion:motionQuery.matches,sound:stored.sound===true,showSamples:stored.showSamples!==false,caughtSamples:Array.isArray(stored.caughtSamples)?stored.caughtSamples.filter(id=>typeof id==='string'):[],homeCityId:typeof stored.homeCityId==='string'?stored.homeCityId:null};
    loaded=true;refresh();syncSettings();$('#storage-status').innerHTML='<i></i> 只留在你的浏览器里';return true;
  }catch(error){$('#storage-status').textContent='本地存储不可用 · 可稍后重试';toast(error.message,7000);return false;}
  finally{loading=false;}
}
$('#danmaku-toggle').onclick = () => danmaku.toggle();
document.addEventListener('keydown', event => {
  if (event.isComposing || celebration.active || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') || ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (event.key.toLowerCase() === 't') { event.preventDefault();openComposer(); }
  if (event.key.toLowerCase() === 'd') { event.preventDefault(); $('#draw-mode').click(); }
  if (event.key === 'Escape' && view==='city' && mode === 'draw') $('#browse-mode').click();
});

function setLabel(button,name,label){
  button.innerHTML=icon(name);const span=document.createElement('span');span.textContent=label;button.append(span);
}
function updateMarkerSummaries(){
  if(!$('#text-marker'))return;
  $('#text-marker').textContent=markerIcon(textMarker)+' '+(textMarker.title||'给留言一个可爱标签')+'  ⌄';
  setLabel($('#text-city-select'),'locate',composeCity?cityPath(composeCity):'选择发言城市');
  $('#drawing-marker').textContent=markerIcon(drawingMarker)+' '+(drawingMarker.title||'涂鸦标签')+(drawingCity?' · '+drawingCity.name:'');
}
function stashDraft(){
  if(!currentCity)return;
  drafts.set(currentCity.id,{text:$('#message').value,category,categoryManual,textColor,effect,textMarker:structuredClone(textMarker),textMarkerManual,composeCityId:composeCity?.id,drawingCityId:drawingCity?.id,drawingMarker:structuredClone(drawingMarker),strokes:structuredClone(history.strokes),future:structuredClone(history.future),camera:{...wall.camera}});
}
function restoreDraft(city){
  const saved=drafts.get(city.id);
  $('#message').value=saved?.text||'';categoryManual=saved?.categoryManual||false;textColor=saved?.textColor||PALETTE[0];effect=saved?.effect||'meteors';
  textMarkerManual=saved?.textMarkerManual||false;textMarker=saved?.textMarker||normalizeMarker({},textColor,saved?.category);
  drawingMarker=saved?.drawingMarker||normalizeMarker({preset:'cat',title:'随手画'},PALETTE[0]);
  composeCity=catalog.byId.get(saved?.composeCityId)||city;drawingCity=catalog.byId.get(saved?.drawingCityId)||city;
  history.strokes=structuredClone(saved?.strokes||[]);history.future=structuredClone(saved?.future||[]);
  setCategory(saved?.category||'daily');
  document.querySelectorAll('[data-effect]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.effect===effect));
  $('#text-colors').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',button.dataset.color===textColor));
  $('#message').style.color=textColor;updateMessage();updateDraft();updateMarkerSummaries();
  if(saved?.camera)wall.camera={...saved.camera};else wall.center();
}
function updateDraftCaption(){
  const has=Boolean($('#message')?.value.trim()||history.strokes.length);
  $('#city-draft-note').textContent=currentCity&&has?'草稿留在'+currentCity.name:'';
}
function renderDraftTray(){
  const tray=$('#draft-tray');tray.replaceChildren();
  const pending=[...drafts].filter(([,draft])=>draft.text.trim()||draft.strokes.length);
  tray.hidden=!pending.length;
  if(pending.length){const label=document.createElement('span');label.textContent='还有一些话没写完：';tray.append(label);}
  for(const[id]of pending){const city=catalog?.byId.get(id);if(!city)continue;const button=document.createElement('button');button.textContent=city.name+'的草稿';button.onclick=()=>enterCity(city);tray.append(button);}
}
function syncGlobeSummaries(){
  if(!catalog||!globe)return;
  const map=new Map();
  for(const summary of citySummaries){
    const city=catalog.byId.get(summary.cityId);if(!city)continue;
    map.set(city.id,{id:city.id,cityId:city.id,city,name:city.name,lat:city.lat,lng:city.lng,count:summary.count,ownCount:summary.count,sampleCount:0,latestAt:summary.latestAt,marker:summary.marker});
  }
  if(preferences.showSamples)for(const entry of samples){
    const city=catalog.byId.get(entry.cityId);if(!city)continue;
    let row=map.get(city.id);
    if(!row){row={id:city.id,cityId:city.id,city,name:city.name,lat:city.lat,lng:city.lng,count:0,ownCount:0,sampleCount:0,latestAt:entry.createdAt,marker:entry.marker};map.set(city.id,row);}
    row.count++;row.sampleCount++;
  }
  globe.setSummaries([...map.values()]);
}
async function reloadSummaries(){
  try{citySummaries=await storage.listSummaries();syncGlobeSummaries();return true;}
  catch(error){toast('城市标签暂时未更新，刷新后可重试。'+error.message,6000);return false;}
}
async function enterCity(city){
  if(!city||!catalog?.byId.has(city.id)){toast('请选择目录中的城市。');return false;}
  const token=++cityRequest;
  try{
    const values=await storage.listEntries(city.id);if(token!==cityRequest)return false;
    if(view==='city')stashDraft();
    currentCity=catalog.byId.get(city.id);entries=values;view='city';document.body.dataset.view='city';
    $('#globe-scene').hidden=true;$('#city-scene').hidden=false;$('#city-preview').hidden=true;globe?.setActive(false);
    $('#city-heading').replaceChildren();$('#city-heading').append(currentCity.name+'的，',document.createElement('br'));const emphasis=document.createElement('span');emphasis.textContent='未完待续。';$('#city-heading').append(emphasis);
    $('#city-hierarchy').textContent=cityPath(currentCity);$('#switch-city').textContent=currentCity.name+' ⌄';
    setMode('browse');restoreDraft(currentCity);refresh();
    requestAnimationFrame(()=>{wall.resize();wall.element.focus({preventScroll:true});});
    if(storage.invalidCount)toast('部分作品暂时无法读取，原数据仍保留在浏览器中。',6000);
    return true;
  }catch(error){toast('城市墙暂时打不开，已有内容仍保留。'+error.message,6500);return false;}
}
function showGlobe(){
  if(saving)return;cityRequest++;stashDraft();view='globe';danmaku.stop();document.body.dataset.view='globe';
  $('#city-scene').hidden=true;$('#globe-scene').hidden=false;globe?.setActive(true);syncGlobeSummaries();renderDraftTray();
}
function previewCity(city,homeIntent=false){
  if(saving||!city)return;selectedPreview={city,homeIntent};
  if(view!=='globe')showGlobe();globe?.focusCity(city);
  $('#preview-path').textContent=[city.country,city.region].filter(Boolean).join(' · ');$('#preview-name').textContent=city.name;
  const own=citySummaries.find(summary=>summary.cityId===city.id)?.count||0, examples=preferences.showSamples?samples.filter(entry=>entry.cityId===city.id).length:0;
  $('#preview-counts').textContent=own||examples?own+' 件我的作品 · '+examples+' 件示例':'这里还在等第一句小小的心事。';
  const latest=citySummaries.find(summary=>summary.cityId===city.id);$('#preview-icon').textContent=markerIcon(latest?.marker||samples.find(entry=>entry.cityId===city.id)?.marker);
  setLabel($('#enter-city'),'arrow',homeIntent?'设为我的城市并进入':'进入城市墙');$('#city-preview').hidden=false;
}
function popularCities(){
  if(!catalog)return[];
  const ids=[preferences.homeCityId,...citySummaries.map(summary=>summary.cityId),...samples.map(entry=>entry.cityId)];
  return[...new Set(ids)].map(id=>catalog.byId.get(id)).filter(Boolean).slice(0,20);
}
function renderCityResults(cities,nearby=false){
  const list=$('#city-results');list.replaceChildren();
  if(!cities.length){const text=document.createElement('p');text.className='muted';text.textContent='目录中暂无匹配城市。试试英文名、附近的大城市，或其他名称；不会自动替你选择位置。';list.append(text);return;}
  for(const city of cities){
    const button=document.createElement('button');button.className='city-result';button.dataset.cityId=city.id;
    const description=document.createElement('span'),name=document.createElement('strong'),path=document.createElement('small'),arrow=document.createElement('span');
    name.textContent=city.name;path.textContent=cityPath(city)+(nearby?' · 距定位点约 '+Math.round(city.distance)+' km':'');arrow.className='result-arrow';arrow.textContent='↗';description.append(name,path);button.append(description,arrow);
    button.onclick=async()=>{
      if(saving)return;button.disabled=true;
      try{if(pickerCallback)await pickerCallback(catalog.byId.get(city.id));else previewCity(catalog.byId.get(city.id),pickerMode==='home');$('#city-picker').close();}
      catch(error){errorIn('#location-error',error.message);}
      finally{button.disabled=false;}
    };list.append(button);
  }
}
function openCityPicker(mode='explore',callback=null){
  if(saving)return;
  if(!catalog){toast('城市目录尚未准备好，请刷新重试。');return;}
  pickerMode=mode;pickerCallback=callback;locationRequest++;
  $('#city-query').value='';errorIn('#location-error','');$('#locate-city').disabled=false;
  $('#city-picker-title').textContent=mode==='home'?'给自己选一座城':mode==='assign'?'为作品选择归属城市':mode==='publish'?'确认这次发言的城市':'想去哪里看看？';
  $('#city-search-hint').textContent='搜索城市或选择下面的城市；定位结果也需要你确认。';
  renderCityResults(popularCities());if(!$('#city-picker').open)$('#city-picker').showModal();$('#city-query').focus();
}
$('#city-query').oninput=()=>{
  errorIn('#location-error','');const query=$('#city-query').value.trim();
  $('#city-search-hint').textContent=query?'选择匹配的城市，确认它是你想要的位置。':'选一座城，给心事一个落脚的地方。';
  renderCityResults(query?catalog.search(query):popularCities());
};
$('#city-picker').addEventListener('close',()=>locationRequest++);
$('#locate-city').onclick=()=>{
  if(!navigator.geolocation){errorIn('#location-error','当前浏览器不支持定位，请手动搜索城市。');return;}
  const request=++locationRequest;$('#locate-city').disabled=true;errorIn('#location-error','');$('#city-search-hint').textContent='正在获取大概位置；精确坐标不会被保存。';
  navigator.geolocation.getCurrentPosition(position=>{
    if(request!==locationRequest||!$('#city-picker').open)return;
    $('#locate-city').disabled=false;
    const candidates=catalog.nearby({lat:position.coords.latitude,lng:position.coords.longitude});
    if($('#city-query').value.trim()){$('#city-search-hint').textContent='定位已完成；可以清空搜索后再次定位，查看附近候选城市。';return;}
    $('#city-search-hint').textContent=candidates.length?'附近城市推荐，请自行确认归属；这不是精确的行政区判断。':'附近暂无目录中的城市，请手动搜索。';
    renderCityResults(candidates,true);
  },error=>{
    if(request!==locationRequest||!$('#city-picker').open)return;
    $('#locate-city').disabled=false;
    errorIn('#location-error',error.code===1?'你没有授权位置，仍可手动搜索城市。':error.code===3?'定位超时，请手动搜索城市，或稍后重试。':'暂时无法获取位置，请手动搜索城市。');
    $('#city-search-hint').textContent='可以继续手动选择城市。';
  },{enableHighAccuracy:false,timeout:8000,maximumAge:300000});
};
$('#city-search-open').onclick=()=>openCityPicker();
$('#fallback-search').onclick=()=>openCityPicker();
$('#switch-city').onclick=()=>openCityPicker('explore',enterCity);
$('#text-city-select').onclick=()=>openCityPicker('publish',city=>{composeCity=city;updateMarkerSummaries();updateDraftCaption();});
$('#back-globe').onclick=showGlobe;
$('.brand').onclick=event=>{event.preventDefault();showGlobe();};
$('#preview-close').onclick=()=>$('#city-preview').hidden=true;
$('#enter-city').onclick=async()=>{
  if(!selectedPreview||saving)return;const{city,homeIntent}=selectedPreview;$('#enter-city').disabled=true;
  try{if(homeIntent){const next={...preferences,homeCityId:city.id};await storage.savePreferences(next);preferences=next;syncSettings();}await enterCity(city);}
  catch(error){toast('设置城市未成功，请重试。'+error.message);}
  finally{$('#enter-city').disabled=false;}
};
$('#my-city').onclick=()=>{
  if(saving)return;const home=catalog?.byId.get(preferences.homeCityId);
  if(home)enterCity(home);else openCityPicker('home');
};
$('#random-city').onclick=()=>{const choices=popularCities().length?popularCities():catalog?.cities||[];if(choices.length)previewCity(choices[Math.floor(Math.random()*choices.length)]);};
$('#globe-zoom-in').onclick=()=>globe?.zoom(.78);
$('#globe-zoom-out').onclick=()=>globe?.zoom(1.28);
$('#globe-reset').onclick=()=>{$('#city-preview').hidden=true;globe?.reset();};
$('#global-collection').onclick=()=>$('#collection-open').click();
$('#select-legacy').onclick=()=>{
  legacySelection.clear();$('#collection-list').querySelectorAll('input[data-legacy-id]').forEach(input=>{input.checked=true;legacySelection.add(input.dataset.legacyId);});$('#assign-legacy').disabled=!legacySelection.size;
};
$('#assign-legacy').onclick=()=>{const ids=[...legacySelection];openCityPicker('assign',city=>assignWorks(ids,city));};
async function assignWorks(ids,city){
  if(saving)return; saving=true;
  try{await storage.assignCity(ids,city.id);}
  finally{saving=false;}
  $('#detail').close();await reloadSummaries();
  if(currentCity){try{entries=await storage.listEntries(currentCity.id);refresh();}catch{toast('已修改归属，当前墙面可刷新后查看。');}}
  if($('#collection').open)renderCollection();
  toast(ids.length+' 件作品已归属到'+city.name+'，原内容和笔画均保留。');
}
function markerPreview(){
  markerDraft={...markerDraft,emoji:$('#marker-emoji').value.trim(),title:$('#marker-title').value.trim()};
  $('#marker-live-preview').textContent=(markerDraft.emoji||markerIcon({...markerDraft,emoji:''}))+' '+(markerDraft.title||'小小星光');$('#marker-live-preview').style.color=markerDraft.color;
  document.querySelectorAll('[data-marker-preset]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.markerPreset===markerDraft.preset&&!markerDraft.emoji));
}
function openMarker(context,initial,entry=null){
  if(saving)return;markerContext=context;markerEntry=entry;markerDraft=normalizeMarker(initial);markerCity=context==='draw'?(drawingCity||currentCity):context==='text'?composeCity:catalog?.byId.get(entry?.cityId);
  $('#marker-emoji').value=markerDraft.emoji;$('#marker-title').value=markerDraft.title;$('#marker-city-select').hidden=context!=='draw';$('#marker-city-select').textContent=markerCity?'发布到 '+cityPath(markerCity)+' ⌄':'选择归属城市';
  $('#marker-colors').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',button.dataset.color===markerDraft.color));
  errorIn('#marker-error','');markerPreview();if(context==='edit')$('#detail').close();$('#marker-editor').showModal();
}
for(const preset of MARKERS){
  const button=document.createElement('button');button.type='button';button.className='marker-preset';button.dataset.markerPreset=preset.id;const emoji=document.createElement('span');emoji.textContent=preset.icon;const name=document.createElement('small');name.textContent=preset.name;button.append(emoji,name);button.onclick=()=>{markerDraft.preset=preset.id;$('#marker-emoji').value='';markerPreview();};$('#marker-presets').append(button);
}
colors($('#marker-colors'),markerDraft.color,color=>{markerDraft.color=color;markerPreview();});
$('#marker-emoji').oninput=markerPreview;$('#marker-title').oninput=markerPreview;
$('#marker-city-select').onclick=()=>openCityPicker('publish',city=>{markerCity=city;$('#marker-city-select').textContent='发布到 '+cityPath(city)+' ⌄';});
$('#text-marker').onclick=()=>openMarker('text',textMarker);
$('#drawing-marker').onclick=()=>openMarker('draw',drawingMarker);
$('#marker-form').onsubmit=async event=>{
  event.preventDefault();if(saving)return;errorIn('#marker-error','');
  try{
    const value=normalizeMarker({...markerDraft,emoji:$('#marker-emoji').value,title:$('#marker-title').value});
    if(markerContext==='text'){textMarker=value;textMarkerManual=true;}
    else if(markerContext==='draw'){drawingMarker=value;drawingCity=markerCity||currentCity;}
    else{
      busy(true);const next={...markerEntry,marker:value};await storage.saveEntry(next);entries=entries.map(entry=>entry.id===next.id?next:entry);markerEntry=next;refresh();await reloadSummaries();busy(false);
    }
    updateMarkerSummaries();$('#marker-editor').close();if(markerContext==='edit')showDetail(markerEntry);
  }catch(error){errorIn('#marker-error',error.message);}
  finally{if(saving)busy(false);}
};
function playBlessing(entry){
  if(celebration.active)return;
  const city=catalog?.byId.get(entry.cityId);
  const rect=wall.element.getBoundingClientRect(),point=worldToScreen({x:entry.x+entry.width/2,y:entry.y+entry.height/2},wall.camera,wall.size);
  const origin={x:Math.max(30,Math.min(innerWidth-30,rect.left+point.x)),y:Math.max(80,Math.min(innerHeight-120,rect.top+point.y))};
  return celebration.play(entry,{...preferences,cityName:city?.name,origin}).then(()=>{if(currentCity?.id===entry.cityId)wall.pulse(entry.id);});
}
function drawStars(){
  const canvas=$('#space-stars'),ctx=canvas.getContext('2d');
  new ResizeObserver(()=>{
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
    for(let i=0;i<260;i++){const x=(i*7919%1000)/1000*rect.width,y=(i*3571%1000)/1000*rect.height;ctx.globalAlpha=.1+(i%7)*.035;ctx.fillStyle=i%11===0?'#efc59c':'#c6dce0';ctx.beginPath();ctx.arc(x,y,i%17===0?1.3:.6,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
  }).observe(canvas);
}
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){event.preventDefault();openCityPicker();}
  if(event.key==='Escape'&&view==='globe')$('#city-preview').hidden=true;
});
async function boot(){
  celebration=new Celebration($('#celebration'));danmaku=new Danmaku($('#danmaku-layer'),$('#danmaku-toggle'),()=>preferences.reducedMotion);drawStars();
  try{
    const results=await Promise.all([loadCatalog(),loadData()]);catalog=results[0];initSamples(catalog);syncSettings();
    globe=new GlobeView($('#globe'),{onSelect:previewCity,onCluster:cities=>{openCityPicker('explore');$('#city-search-hint').textContent='这片星团里的城市';renderCityResults(cities);},onFailure:error=>{$('#globe-fallback').hidden=false;$('#globe').hidden=true;document.documentElement.dataset.globe='fallback';console.info(error.message);}});
    await reloadSummaries();globe.setReducedMotion(preferences.reducedMotion);await globe.init();syncGlobeSummaries();renderDraftTray();
    if(!globe.failed)document.documentElement.dataset.globe='ready';
  }catch(error){$('#globe-fallback').hidden=false;$('#globe').hidden=true;toast(error.message,8000);document.documentElement.dataset.globe='fallback';}
  updateMarkerSummaries();document.documentElement.dataset.ready='true';
}
await boot();
