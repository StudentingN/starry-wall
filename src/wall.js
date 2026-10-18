import { markerIcon } from './geo.js';
import { WORLD, clamp, constrainCamera, screenToWorld, zoomAt } from './core.js';
export function paintStroke(ctx, stroke, offset = { x: 0, y: 0 }) {
  if (!stroke.points.length) return;
  ctx.strokeStyle = ctx.fillStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineCap = ctx.lineJoin = 'round';
  if (stroke.points.length === 1) { const p = stroke.points[0]; ctx.beginPath(); ctx.arc(p.x + offset.x, p.y + offset.y, stroke.width / 2, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath(); stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x + offset.x, p.y + offset.y) : ctx.moveTo(p.x + offset.x, p.y + offset.y)); ctx.stroke();
}
export class Wall {
  constructor(element, callbacks = {}) {
    this.element = element; this.layer = element.querySelector('.world-layer'); this.canvas = element.querySelector('canvas'); this.ctx = this.canvas.getContext('2d'); this.callbacks = callbacks;
    this.camera = { x: 3000, y: 2000, zoom: matchMedia('(max-width: 600px)').matches ? .78 : 1 }; this.size = { width: 1, height: 1 }; this.entries = []; this.entryById=new Map(); this.nodes=new Map(); this.draft = []; this.current = null; this.pointers = new Map(); this.mode = 'browse'; this.color = '#efae7f'; this.width = 3; this.frame = 0;
    this.stars = Array.from({length: 500}, (_, i) => ({ x: (i * 7919 % 6000), y: (i * 3571 % 4000), r: i % 17 === 0 ? 1.6 : .65, alpha: .12 + (i % 7) * .035 }));
    new ResizeObserver(() => this.resize()).observe(element); this.events(); this.resize();
  }
  resize() {
    const rect = this.element.getBoundingClientRect(); this.size = { width: rect.width, height: rect.height };
    const dpr = Math.min(devicePixelRatio || 1, 2); this.dpr = dpr;
    this.canvas.width = Math.round(rect.width * dpr); this.canvas.height = Math.round(rect.height * dpr);
    this.camera = constrainCamera(this.camera, this.size); this.requestRender();
  }
  setEntries(entries) {
    this.entries = entries; this.entryById = new Map(entries.map(entry=>[entry.id,entry])); this.nodes = new Map(); this.layer.replaceChildren(); this.requestRender();
  }
  createEntryNode(entry) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.entryId = entry.id;
      button.className = 'wall-entry ' + (entry.kind === 'drawing' ? 'drawing-hit' : entry.category);
      button.style.left = entry.x + 'px'; button.style.top = entry.y + 'px'; button.style.setProperty('--entry-color', entry.color); button.style.setProperty('--entry-rotation', entry.rotation + 'deg');
      button.setAttribute('aria-label', (entry.sample ? '示例作品：' : '我的作品：') + (entry.kind === 'text' ? entry.text : '涂鸦'));
      if (entry.kind === 'drawing') { button.style.width = entry.width + 'px'; button.style.height = entry.height + 'px'; }
      else {
        if (entry.category === 'blessing') { const star = document.createElement('span'); star.className = 'wish-star'; star.textContent = entry.caught ? '✦' : '✧'; button.append(star); }
        const content = document.createElement('span'); content.textContent = entry.text; button.append(content);
      }
      const cover=document.createElement('span');cover.className='entry-cover';const glyph=document.createElement('i');glyph.textContent=markerIcon(entry.marker);const title=document.createElement('b');title.textContent=entry.marker?.title||'';cover.style.color=entry.marker?.color||entry.color;cover.append(glyph,title);button.prepend(cover);
      const tag = document.createElement('span'); tag.className = 'entry-tag'; tag.textContent = entry.sample ? '示例作品 · 点击看看' : '我留下的' + (entry.category === 'blessing' ? '祝福' : '作品'); button.append(tag);
      button.addEventListener('click', event => { if (event.detail === 0 && this.mode === 'browse') this.callbacks.onSelect?.(entry); }); 
    return button;
  }
  setMode(mode) {
    if (this.current) { this.current = null; this.requestRender(); }
    this.mode = mode; this.element.classList.toggle('draw-mode', mode === 'draw');
    this.element.setAttribute('aria-label', mode === 'draw' ? '涂鸦模式，单指绘画、双指调整视角' : '浏览墙面，拖动移动，滚轮缩放；方向键移动，Home 回到中心');
    this.resize();
  }
  setDraft(strokes) { this.draft = strokes; this.requestRender(); }
  local(event) { const r = this.element.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  world(point) { const p = screenToWorld(point, this.camera, this.size); return { x: clamp(p.x, 1, WORLD.width - 1), y: clamp(p.y, 1, WORLD.height - 1) }; }
  zoom(factor, point = { x: this.size.width / 2, y: this.size.height / 2 }) { this.camera = zoomAt(this.camera, this.size, point, factor); this.requestRender(); }
  center() { this.camera = { x: 3000, y: 2000, zoom: matchMedia('(max-width: 600px)').matches ? .78 : 1 }; this.camera = constrainCamera(this.camera, this.size); this.requestRender(); }
  focusEntry(entry) { this.camera = constrainCamera({ x: entry.x + entry.width / 2, y: entry.y + entry.height / 2, zoom: Math.min(1.2, (this.size.width - 60) / Math.max(entry.width, 280)) }, this.size); this.requestRender(); }
  pulse(id) { requestAnimationFrame(()=>{const node=this.nodes.get(id);if(node){node.classList.remove('entry-pulse');requestAnimationFrame(()=>node.classList.add('entry-pulse'));}}); }
  requestRender() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); }); }
  render() {
    const { width, height } = this.size, { x, y, zoom } = this.camera, ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); ctx.translate(width / 2, height / 2); ctx.scale(zoom, zoom); ctx.translate(-x, -y);
    const visible = entry => entry.x + (entry.width || 1) >= x - width / 2 / zoom - 30 && entry.x <= x + width / 2 / zoom + 30 && entry.y + (entry.height || 1) >= y - height / 2 / zoom - 30 && entry.y <= y + height / 2 / zoom + 30;
    for (const star of this.stars) { if (!visible(star)) continue; ctx.globalAlpha = star.alpha; ctx.fillStyle = '#d8d7c9'; ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    const visibleIds=new Set();
    for (const entry of this.entries) {
      if(!visible(entry))continue;visibleIds.add(entry.id);
      if(!this.nodes.has(entry.id)){const node=this.createEntryNode(entry);this.nodes.set(entry.id,node);this.layer.append(node);}
      if(entry.kind==='drawing')for(const stroke of entry.strokes)paintStroke(ctx,stroke,entry);
    }
    for(const[id,node]of this.nodes){if(!visibleIds.has(id)){node.remove();this.nodes.delete(id);}}
    this.element.dataset.visibleEntries=String(visibleIds.size);
    for (const stroke of this.draft) paintStroke(ctx, stroke); if (this.current) paintStroke(ctx, this.current);
    this.layer.style.transform = 'translate(' + (width / 2 - x * zoom) + 'px,' + (height / 2 - y * zoom) + 'px) scale(' + zoom + ')';
    this.callbacks.onCamera?.(this.camera);
  }
  events() {
    this.element.addEventListener('wheel', event => { event.preventDefault(); if (this.current) return; this.zoom(Math.exp(-event.deltaY * .0015), this.local(event)); }, { passive: false });
    this.element.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const point = this.local(event); this.element.focus({ preventScroll: true }); this.element.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, point);
      if (this.pointers.size === 1) {
        this.start = point; this.last = point; this.moved = false; this.tapEntry = event.target.closest('[data-entry-id]')?.dataset.entryId;
        if (this.mode === 'draw') this.current = { color: this.color, width: this.width, points: [this.world(point)] };
        else this.element.classList.add('dragging');
      } else { this.current = null; this.moved = true; this.pinch = this.pinchState(); this.element.classList.remove('dragging'); }
      this.requestRender();
    });
    this.element.addEventListener('pointermove', event => {
      if (!this.pointers.has(event.pointerId)) return;
      const point = this.local(event); this.pointers.set(event.pointerId, point);
      if (this.pointers.size >= 2) {
        const next = this.pinchState(); if (this.pinch && this.pinch.distance > 0) {
          const anchor = screenToWorld(this.pinch.center, this.camera, this.size); const zoom = clamp(this.camera.zoom * next.distance / this.pinch.distance, .35, 2.5);
          this.camera = constrainCamera({ zoom, x: anchor.x - (next.center.x - this.size.width / 2) / zoom, y: anchor.y - (next.center.y - this.size.height / 2) / zoom }, this.size);
        }
        this.pinch = next; this.requestRender(); return;
      }
      if (Math.hypot(point.x - this.start.x, point.y - this.start.y) > 5) this.moved = true;
      if (this.mode === 'draw' && this.current) {
        const next = this.world(point), last = this.current.points.at(-1);
        if (Math.hypot(next.x - last.x, next.y - last.y) > .8 && this.current.points.length < 10000) this.current.points.push(next);
      } else if (this.mode === 'browse' && !this.pinch) {
        this.camera = constrainCamera({ ...this.camera, x: this.camera.x - (point.x - this.last.x) / this.camera.zoom, y: this.camera.y - (point.y - this.last.y) / this.camera.zoom }, this.size);
      }
      this.last = point; this.requestRender();
    });
    const finish = (event, canceled) => {
      if (!this.pointers.has(event.pointerId)) return;
      if (this.pointers.size === 1 && !this.pinch) {
        if (this.current && !canceled) this.callbacks.onStroke?.(this.current);
        else if (!canceled && !this.moved && this.mode === 'browse' && this.tapEntry) this.callbacks.onSelect?.(this.entryById.get(this.tapEntry));
      }
      this.current = null; this.pointers.delete(event.pointerId); this.element.classList.remove('dragging');
      if (!this.pointers.size) this.pinch = null;
      this.requestRender();
    };
    this.element.addEventListener('pointerup', event => finish(event, false));
    this.element.addEventListener('pointercancel', event => finish(event, true));
    this.element.addEventListener('lostpointercapture', event => finish(event, true));
    this.element.addEventListener('keydown', event => {
      if (event.target !== this.element) return;
      const steps = { ArrowLeft: [-100, 0], ArrowRight: [100, 0], ArrowUp: [0, -100], ArrowDown: [0, 100] };
      if (steps[event.key]) { event.preventDefault(); const [dx, dy] = steps[event.key]; this.camera = constrainCamera({ ...this.camera, x: this.camera.x + dx / this.camera.zoom, y: this.camera.y + dy / this.camera.zoom }, this.size); this.requestRender(); }
      if (event.key === 'Home') { event.preventDefault(); this.center(); }
      if (event.key === '+' || event.key === '=') this.zoom(1.2);
      if (event.key === '-') this.zoom(1 / 1.2);
    });
  }
  pinchState() { const [a, b] = [...this.pointers.values()]; return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) }; }
}
