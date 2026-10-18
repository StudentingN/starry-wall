import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'test-results');
const base = 'http://localhost:4173';
await mkdir(output, { recursive: true });
const paths = [process.env.BROWSER_EXECUTABLE, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let executable;
for (const path of paths) { try { await access(path); executable = path; break; } catch {} }
if (!executable) throw new Error('找不到 Chrome/Edge，请设置 BROWSER_EXECUTABLE。');
assert.equal((await fetch(base)).status, 200, '先启动 npm run dev，并确认首页可访问。');
const profile = await mkdtemp(join(tmpdir(), 'starry-wall-qa-'));
assert.ok(resolve(profile).startsWith(resolve(tmpdir()) + sep + 'starry-wall-qa-'), 'QA profile must stay inside its temporary directory');
const browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--window-size=1440,960', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket, client;
const errors = [], results = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Chrome DevTools 启动超时。')), 15000);
    browser.stderr.on('data', chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    browser.on('error', error => { clearTimeout(timer); reject(error); });
    browser.on('exit', code => { clearTimeout(timer); reject(new Error('Chrome exited: ' + code)); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 1; const pending = new Map();
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) { const p = pending.get(data.id); pending.delete(data.id); data.error ? p.reject(new Error(data.error.message)) : p.resolve(data.result); }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    if (data.method === 'Page.loadEventFired') client.loads++;
    if (data.method === 'Page.javascriptDialogOpening') client.dialog = data.params;
  });
  client = {
    session: null, dialog: null, loads: 0,
    send(method, params = {}, attach = true) { return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(attach && this.session ? { sessionId: this.session } : {}) })); }); },
    async evaluate(expression) {
      const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    },
    async wait(expression, timeout = 6000) { const end = Date.now() + timeout; do { if (await this.evaluate(expression)) return; await pause(60); } while (Date.now() < end); throw new Error('Timed out: ' + expression); },
    async reload() {
      const old = this.loads; await this.send('Page.reload'); const end = Date.now() + 6000;
      while (this.loads === old) { if (Date.now() > end) throw new Error('Reload did not finish'); await pause(30); }
      await this.wait("document.documentElement.dataset.ready === 'true'");
    },
    click(selector) { return this.evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()'); },
    async screenshot(name) { const response = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(join(output, name + '.png'), Buffer.from(response.data, 'base64')); },
  };
  const target = await client.send('Target.createTarget', { url: 'about:blank' }, false);
  const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, false);
  client.session = attached.sessionId;
  await client.send('Page.enable'); await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await client.send('Page.navigate', { url: base });
  await client.wait("document.documentElement.dataset.ready === 'true' && document.querySelectorAll('.wall-entry').length === 8 && document.querySelector('#storage-status').textContent.includes('只留在')");
  await pause(200);
  await client.screenshot('desktop');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await client.reload(); await pause(150);
  await client.wait("document.querySelectorAll('.wall-entry').length === 8");
  await client.screenshot('mobile-initial');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await client.reload(); await pause(150);
  await client.wait("document.querySelectorAll('.wall-entry').length === 8");
  results.push('desktop: initial scene renders with marked examples');
  const before = await client.evaluate("document.querySelector('#world-layer').style.transform");
  const rect = await client.evaluate("(()=>{const r=document.querySelector('#wall').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
  const mouse = (type, x, y, button = 'none', buttons = 0) => client.send('Input.dispatchMouseEvent', { type, x, y, button: buttons ? 'left' : button, buttons, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
  await mouse('mousePressed', 100, rect.y + 80, 'left', 1);
  await mouse('mouseMoved', 210, rect.y + 110, 'none', 1);
  await mouse('mouseReleased', 210, rect.y + 110, 'left');
  await pause(100);
  assert.notEqual(await client.evaluate("document.querySelector('#world-layer').style.transform"), before);
  await client.click('#center-view'); await client.click('#zoom-out');
  await client.wait("document.querySelector('#zoom-value').textContent === '83%'"); await client.click('#center-view');
  results.push('mouse: pan, zoom and recenter work');
  async function compose(text, category = 'daily', effect = 'none') {
    await client.click('#compose-open');
    await client.evaluate('document.querySelector("#message").value=' + JSON.stringify(text) + ';document.querySelector("#message").dispatchEvent(new Event("input",{bubbles:true}))');
    await client.click('[data-category="' + category + '"]');
    if (category === 'blessing') await client.click('[data-effect="' + effect + '"]');
    await client.click('#publish-text');
  }
  const records = () => client.evaluate("import('/src/storage.js').then(m=>m.storage.load()).then(d=>d.entries)");
  await compose('QA · 今天也要好好生活 🌠');
  await client.wait("!document.querySelector('#composer').open");
  assert.equal((await records()).length, 1);
  await client.wait("document.querySelectorAll('.danmaku-message').length > 0");
  results.push('text: publish, local record and new-message danmaku work');
  await client.evaluate("import('/src/storage.js').then(m=>{window.originalSave=m.storage.saveEntry;m.storage.saveEntry=async()=>{throw new Error('QA simulated quota')}})");
  const retryText = '<img src=x onerror=alert(1)> QA · 草稿不会丢';
  await compose(retryText);
  await client.wait("!document.querySelector('#compose-error').hidden");
  assert.equal(await client.evaluate("document.querySelector('#message').value"), retryText);
  assert.equal((await records()).length, 1);
  await client.evaluate("import('/src/storage.js').then(m=>m.storage.saveEntry=window.originalSave)");
  await client.click('#publish-text'); await client.wait("!document.querySelector('#composer').open");
  assert.equal((await records()).length, 2);
  assert.equal(await client.evaluate("document.querySelectorAll('.wall-entry img').length"), 0);
  results.push('storage failure: text draft retained, retry succeeds; text cannot inject HTML');
  await compose('希望你每一个认真生活的日子，都有小小的惊喜。QA', 'blessing', 'fireworks');
  await client.wait("!document.querySelector('#celebration').hidden");
  assert.equal(await client.evaluate("document.activeElement.id"), 'skip-effect');
  assert.equal(await client.evaluate("document.querySelector('main').inert"), true);
  const effectStart = Date.now();
  await pause(1000); await client.screenshot('fireworks');
  assert.equal(await client.evaluate("document.querySelectorAll('.blessing-echo').length"), 12);
  await client.wait("document.querySelector('#celebration').hidden", 6500);
  assert.ok(Date.now() - effectStart >= 4400);
  assert.equal(await client.evaluate("document.querySelector('main').inert"), false);
  let wish = (await records()).find(entry => entry.category === 'blessing');
  await client.click('[data-entry-id="' + wish.id + '"]');
  await client.evaluate("Array.from(document.querySelectorAll('#detail-actions button')).find(b=>b.textContent.includes('接住祝福')).click()");
  await client.wait("document.querySelector('#detail-actions').textContent.includes('已接住')");
  assert.equal((await records()).find(entry => entry.id === wish.id).caught, true);
  await client.evaluate("Array.from(document.querySelectorAll('#detail-actions button')).find(b=>b.textContent.includes('重播')).click()");
  await client.wait("!document.querySelector('#celebration').hidden");
  await client.click('#skip-effect'); await client.wait("document.querySelector('#celebration').hidden");
  results.push('fireworks: full 5-second lifecycle, wish star, catch, replay and skip work');
  await client.click('#settings-open');
  await client.evaluate("document.querySelector('#reduced-motion').checked=true;document.querySelector('#reduced-motion').dispatchEvent(new Event('change'))");
  await client.wait("!document.querySelector('#reduced-motion').disabled");
  await client.click('[data-close="settings"]');
  await compose('祝你今晚好梦。QA', 'blessing', 'meteors');
  await client.wait("!document.querySelector('#celebration').hidden");
  assert.equal(await client.evaluate("document.querySelector('#celebration').classList.contains('reduced')"), true);
  assert.equal(await client.evaluate("document.querySelectorAll('.blessing-echo').length"), 1);
  await client.wait("document.querySelector('#celebration').hidden", 2500);
  await client.click('#settings-open');
  await client.evaluate("document.querySelector('#reduced-motion').checked=false;document.querySelector('#reduced-motion').dispatchEvent(new Event('change'))");
  await client.wait("!document.querySelector('#reduced-motion').disabled"); await client.click('[data-close="settings"]');
  const meteorWish = (await records()).find(entry => entry.effect === 'meteors');
  await client.click('[data-entry-id="' + meteorWish.id + '"]');
  await client.evaluate("Array.from(document.querySelectorAll('#detail-actions button')).find(b=>b.textContent.includes('重播')).click()");
  await client.wait("!document.querySelector('#celebration').hidden"); await pause(650); await client.screenshot('meteors');
  await client.click('#skip-effect');
  results.push('meteors and reduced motion: full and lightweight variants work');
  await client.click('#center-view'); await client.click('#draw-mode'); await pause(100);
  const drawRect = await client.evaluate("(()=>{const r=document.querySelector('#wall').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
  const px = drawRect.width / 2, py = drawRect.y + drawRect.height / 2;
  await mouse('mousePressed', px, py, 'left', 1);
  for (let i = 1; i <= 12; i++) await mouse('mouseMoved', px + i * 7, py + Math.sin(i / 2) * 20, 'none', 1);
  await mouse('mouseReleased', px + 84, py - 5, 'left');
  await client.wait("!document.querySelector('#undo').disabled");
  await client.click('#undo'); assert.equal(await client.evaluate("document.querySelector('#publish-drawing').disabled"), true);
  await client.click('#redo'); assert.equal(await client.evaluate("document.querySelector('#publish-drawing').disabled"), false);
  await client.screenshot('drawing');
  await client.click('#publish-drawing'); await client.wait("document.querySelector('#draw-tools').hidden");
  assert.equal((await records()).filter(entry => entry.kind === 'drawing').length, 1);
  results.push('drawing: actual mouse strokes, undo/redo and publication work');
  await client.reload(); await client.wait("document.querySelectorAll('.wall-entry').length === 13");
  assert.equal((await records()).length, 5);
  assert.equal((await records()).find(entry => entry.id === wish.id).caught, true);
  await client.click('#collection-open');
  assert.equal(await client.evaluate("document.querySelectorAll('.collection-item').length"), 5);
  await client.click('.collection-item'); await client.wait("document.querySelector('#detail').open");
  await client.click('[data-close="detail"]');
  results.push('refresh: text, drawings, catch state and collection restore correctly');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await client.reload(); await client.wait("document.querySelectorAll('.wall-entry').length === 13"); await pause(150);
  assert.equal(await client.evaluate('document.documentElement.scrollWidth'), 390);
  await client.screenshot('mobile');
  await client.click('#compose-open');
  const modalBounds = await client.evaluate("(()=>{const r=document.querySelector('#composer').getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom}})()");
  assert.ok(modalBounds.x >= 0 && modalBounds.right <= 390 && modalBounds.bottom <= 844);
  await client.screenshot('mobile-composer'); await client.click('[data-close="composer"]');
  await client.click('#draw-mode'); await pause(150);
  const mobileRect = await client.evaluate("(()=>{const r=document.querySelector('#wall').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
  const ax = 150, ay = mobileRect.y + 90;
  const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{id:1,x:ax,y:ay}]);
  await touch('touchStart', [{id:1,x:ax,y:ay},{id:2,x:ax+70,y:ay+40}]);
  await touch('touchMove', [{id:1,x:ax-20,y:ay-10},{id:2,x:ax+100,y:ay+60}]);
  await touch('touchEnd', []);
  assert.equal(await client.evaluate("document.querySelector('#undo').disabled"), true, 'pinching must not leave a stroke');
  await touch('touchStart', [{id:1,x:130,y:ay+120}]);
  await touch('touchMove', [{id:1,x:160,y:ay+140}]);
  await touch('touchMove', [{id:1,x:190,y:ay+125}]);
  await touch('touchEnd', []);
  await client.wait("!document.querySelector('#undo').disabled");
  await client.evaluate("import('/src/storage.js').then(m=>{window.originalSave=m.storage.saveEntry;m.storage.saveEntry=async()=>{throw new Error('QA drawing quota')}})");
  await client.click('#publish-drawing');
  await client.wait("document.querySelector('#toast').textContent.includes('涂鸦草稿还在')");
  assert.equal(await client.evaluate("document.querySelector('#draw-tools').hidden"), false);
  assert.equal(await client.evaluate("document.querySelector('#undo').disabled"), false);
  await client.evaluate("import('/src/storage.js').then(m=>m.storage.saveEntry=window.originalSave)");
  await client.click('#publish-drawing'); await client.wait("document.querySelector('#draw-tools').hidden");
  assert.equal((await records()).filter(entry => entry.kind === 'drawing').length, 2);
  results.push('mobile 390px: layout, editor, touch drawing, pinch cancellation and failed-save retry work');
  await client.click('#draw-mode');
  await touch('touchStart', [{id:1,x:130,y:ay+80}]); await touch('touchMove', [{id:1,x:160,y:ay+90}]); await touch('touchEnd', []);
  await client.wait("!document.querySelector('#undo').disabled"); await client.click('#cancel-drawing');
  await client.click('#draw-mode'); assert.equal(await client.evaluate("document.querySelector('#undo').disabled"), true); await client.click('#browse-mode');
  await client.click('#danmaku-toggle'); await client.wait("document.querySelector('#danmaku-toggle').textContent.includes('暂停')");
  await client.click('#danmaku-toggle'); assert.equal(await client.evaluate("document.querySelectorAll('.danmaku-message').length"), 0);
  results.push('draft cancel and danmaku pause work');
  await client.click('#collection-open'); await client.click('.collection-item');
  const countBefore = (await records()).length;
  const deletion = client.evaluate("document.querySelector('#detail-actions .danger').click()");
  const dialogDeadline = Date.now() + 3000;
  while (!client.dialog && Date.now() < dialogDeadline) await pause(30);
  assert.ok(client.dialog, 'deletion must ask for confirmation');
  await client.send('Page.handleJavaScriptDialog', { accept: true }); client.dialog = null; await deletion;
  await client.wait("!document.querySelector('#detail').open"); assert.equal((await records()).length, countBefore - 1);
  results.push('delete: explicit confirmation and persistent removal work');
  assert.equal((await fetch(base + '/.git/config')).status, 404);
  assert.equal((await fetch(base + '/package.json')).status, 404);
  assert.equal((await fetch(base + '/src/..%5c.git%5cconfig')).status, 404);
  assert.deepEqual(errors, [], 'browser must not throw uncaught JavaScript errors');
  results.push('preview serves only public assets; no uncaught browser exceptions');
  await writeFile(join(output, 'browser-report.json'), JSON.stringify({ passed: results.length, results, errors, screenshots: ['desktop','mobile-initial','fireworks','meteors','drawing','mobile','mobile-composer'] }, null, 2));
  console.log(results.map(line => 'PASS ' + line).join('\n'));
  console.log('Browser scenarios passed: ' + results.length + '; screenshots: test-results/');
} catch (error) {
  if (client) { try { await client.screenshot('failure'); } catch {} }
  await writeFile(join(output, 'browser-failure.json'), JSON.stringify({ error: error.stack, completed: results, browserErrors: errors }, null, 2));
  throw error;
} finally {
  try { await Promise.race([client?.send('Browser.close', {}, false), pause(1000)]); } catch {}
  socket?.close(); browser.kill();
  await pause(300);
  for (let attempt = 0; attempt < 5; attempt++) { try { await rm(profile, { recursive: true, force: true }); break; } catch { await pause(300); } }
}
