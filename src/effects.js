import { icon } from './icons.js';
const TAU = Math.PI * 2;
export class Celebration {
  constructor(element) {
    this.element = element; this.canvas = element.querySelector('canvas'); this.ctx = this.canvas.getContext('2d'); this.echoes = element.querySelector('#blessing-echoes'); this.active = false;
    element.querySelector('#skip-effect').onclick = () => this.stop();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    document.addEventListener('keydown', event => { if (this.active && event.key === 'Escape') { event.preventDefault(); this.stop(); } });
  }
  play(entry, preferences = {}) {
    if (this.active) return Promise.resolve(false);
    this.previousFocus = document.activeElement;
    document.querySelectorAll('main, .masthead, .page-footer').forEach(node => node.inert = true);
    this.element.setAttribute('role', 'dialog'); this.element.setAttribute('aria-modal', 'true'); this.element.setAttribute('aria-label', '祝福：' + entry.text);
    this.active = true; this.element.hidden = false; this.element.querySelector('#skip-effect').focus({ preventScroll: true }); this.element.classList.toggle('reduced', preferences.reducedMotion === true);
    this.duration = preferences.reducedMotion ? 1200 : 5000; this.particles = []; this.start = performance.now(); this.last = this.start; this.burstIndex = -1; this.echoes.replaceChildren();
    const total = preferences.reducedMotion ? 1 : 12;
    for (let i = 0; i < total; i++) {
      const span = document.createElement('span'); span.className = 'blessing-echo'; span.textContent = entry.text;
      const columns = innerWidth < 600 ? 2 : 3;
      const row = Math.floor(i / columns), col = i % columns;
      span.style.left = (preferences.reducedMotion ? 50 : innerWidth < 600 ? 25 + col * 50 : 17 + col * 33 + (row % 2 ? 3 : -2)) + '%';
      span.style.top = (preferences.reducedMotion ? 43 : innerWidth < 600 ? 13 + row * 12 : 18 + row * 17) + '%';
      span.style.fontSize = (preferences.reducedMotion ? 26 : innerWidth < 600 ? 12 + i % 3 * 2 : 17 + i % 3 * 4) + 'px';
      this.echoes.append(span);
    }
    if (preferences.sound) this.chime();
    this.promise = new Promise(resolve => this.resolve = resolve);
    const frame = now => {
      if (!this.active) return;
      const elapsed = now - this.start, progress = elapsed / this.duration, dt = Math.min(.035, (now - this.last) / 1000); this.last = now;
      this.resize();
      const ctx = this.ctx; ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (!preferences.reducedMotion) {
        if (entry.effect === 'fireworks') this.fireworks(elapsed);
        else this.meteors(elapsed);
        this.particles = this.particles.filter(p => p.life > 0);
        for (const p of this.particles) {
          p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.meteor) p.vy += 30 * dt;
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife)) * Math.min(1, (1 - progress) * 7);
          ctx.strokeStyle = ctx.fillStyle = p.color;
          if (p.meteor) { ctx.lineWidth = 1.5; const gradient = ctx.createLinearGradient(p.x, p.y, p.x - 95, p.y - 45); gradient.addColorStop(0, '#fff0d7'); gradient.addColorStop(1, 'transparent'); ctx.strokeStyle = gradient; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 95, p.y - 45); ctx.stroke(); }
          ctx.beginPath(); ctx.arc(p.x, p.y, p.meteor ? 2 : 1.6, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      [...this.echoes.children].forEach((span, i) => {
        const local = preferences.reducedMotion ? progress : (elapsed - i * 110) / 2500;
        const opacity = Math.max(0, Math.min(local * 4, 1, (1 - progress) * 6));
        span.style.opacity = opacity;
        span.style.transform = 'translate(-50%,calc(-50% - ' + (preferences.reducedMotion ? 0 : local * 22) + 'px)) scale(' + (progress > .82 ? Math.max(.35, 1 - (progress - .82) * 2.5) : 1) + ')';
      });
      if (elapsed >= this.duration) this.stop(); else this.frame = requestAnimationFrame(frame);
    };
    this.frame = requestAnimationFrame(frame);
    return this.promise;
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(innerWidth * dpr) || this.canvas.height !== Math.round(innerHeight * dpr)) { this.canvas.width = Math.round(innerWidth * dpr); this.canvas.height = Math.round(innerHeight * dpr); }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fireworks(elapsed) {
    const next = Math.floor(elapsed / 480);
    if (next === this.burstIndex || elapsed > 3500) return;
    this.burstIndex = next;
    const x = innerWidth * (.15 + Math.random() * .7), y = innerHeight * (.15 + Math.random() * .45);
    const colors = ['#efae7f', '#e9bdca', '#dfc786', '#a5badc'];
    for (let i = 0; i < 65; i++) {
      const angle = Math.random() * TAU, speed = 30 + Math.random() * 145, life = .8 + Math.random() * 1.3;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color: colors[next % colors.length] });
    }
  }
  meteors(elapsed) {
    const next = Math.floor(elapsed / 160);
    if (next === this.burstIndex || elapsed > 3700) return;
    this.burstIndex = next; const life = 1.6;
    this.particles.push({ x: Math.random() * innerWidth - 100, y: Math.random() * innerHeight * .5 - 80, vx: 280 + Math.random() * 180, vy: 170, life, maxLife: life, color: '#f8dfb1', meteor: true });
  }
  chime() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      this.audio = new Audio(); this.audio.resume().catch(() => {});
      for (let i = 0; i < 3; i++) {
        const oscillator = this.audio.createOscillator(), gain = this.audio.createGain(), time = this.audio.currentTime + i * .18;
        oscillator.type = 'sine'; oscillator.frequency.value = [523.25, 659.25, 783.99][i];
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.035, time + .03); gain.gain.exponentialRampToValueAtTime(.0001, time + .8);
        oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(time); oscillator.stop(time + .85);
      }
    } catch { /* Audio is optional; visual delivery must still succeed. */ }
  }
  stop() {
    if (!this.active) return;
    this.active = false; cancelAnimationFrame(this.frame); this.element.hidden = true; this.echoes.replaceChildren();
    document.querySelectorAll('main, .masthead, .page-footer').forEach(node => node.inert = false);
    const previousDialog = this.previousFocus?.closest('dialog');
    if (this.previousFocus?.isConnected && (!previousDialog || previousDialog.open)) this.previousFocus.focus({ preventScroll: true });
    else document.querySelector('#wall').focus({ preventScroll: true });
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.particles = [];
    this.audio?.close().catch(() => {}); this.audio = null; this.resolve?.(true); this.resolve = null;
  }
}
export class Danmaku {
  constructor(layer, button, reducedMotion) {
    this.layer = layer; this.button = button; this.reducedMotion = reducedMotion; this.entries = []; this.index = 0; this.active = false;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }
  update(entries) { this.entries = [...entries].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20); }
  flash(entry) {
    if (document.hidden || !entry) return;
    while (this.layer.children.length >= 3) this.layer.firstElementChild.remove();
    const message = document.createElement('span'); message.className = 'danmaku-message' + (this.reducedMotion() ? ' reduced' : '');
    message.textContent = (entry.sample ? '示例 · ' : '') + entry.text.replaceAll('\n', ' '); message.style.color = entry.color; message.style.top = (this.index++ % 3 * 29 + 8) + '%';
    message.addEventListener('animationend', () => message.remove()); this.layer.append(message);
  }
  toggle() {
    if (this.active) { this.stop(); return; }
    this.active = true; this.button.innerHTML = icon('pause') + '<span class="button-label">暂停弹幕</span>'; this.button.setAttribute('aria-pressed', 'true');
    const tick = () => { if (this.entries.length) this.flash(this.entries[this.index % this.entries.length]); };
    tick(); this.timer = setInterval(tick, this.reducedMotion() ? 4000 : 3800);
  }
  stop() { clearInterval(this.timer); this.active = false; this.layer.replaceChildren(); this.button.innerHTML = icon('play') + '<span class="button-label">弹幕时刻</span>'; this.button.setAttribute('aria-pressed', 'false'); }
}
