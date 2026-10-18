import { normalizeMarker, UNASSIGNED } from './geo.js';
export const WORLD = { width: 6000, height: 4000 };
export const PALETTE = ['#efae7f', '#e9bdca', '#a5badc', '#b8c7a2', '#dfc786', '#eee8dd'];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const textLength = text => Array.from(text).length;
export function screenToWorld(point, camera, size) {
  return { x: (point.x - size.width / 2) / camera.zoom + camera.x, y: (point.y - size.height / 2) / camera.zoom + camera.y };
}
export function worldToScreen(point, camera, size) {
  return { x: (point.x - camera.x) * camera.zoom + size.width / 2, y: (point.y - camera.y) * camera.zoom + size.height / 2 };
}
export function constrainCamera(camera, size) {
  const zoom = clamp(camera.zoom, 0.35, 2.5);
  const halfW = Math.min(WORLD.width / 2, size.width / (2 * zoom));
  const halfH = Math.min(WORLD.height / 2, size.height / (2 * zoom));
  return { zoom, x: clamp(camera.x, halfW, WORLD.width - halfW), y: clamp(camera.y, halfH, WORLD.height - halfH) };
}
export function zoomAt(camera, size, point, factor) {
  const before = screenToWorld(point, camera, size);
  const zoom = clamp(camera.zoom * factor, 0.35, 2.5);
  return constrainCamera({ zoom, x: before.x - (point.x - size.width / 2) / zoom, y: before.y - (point.y - size.height / 2) / zoom }, size);
}
export function isBlessing(text) {
  return /祝你|祝福|祝愿|愿你|愿我们|愿大家|愿每|希望你|生日快乐|新年快乐|平安喜乐|恭喜|皆能如愿|都能被温柔/.test(text);
}
export class StrokeHistory {
  constructor() { this.strokes = []; this.future = []; }
  add(stroke) { if (stroke.points.length) { this.strokes.push(structuredClone(stroke)); this.future = []; } }
  undo() { if (this.strokes.length) this.future.push(this.strokes.pop()); }
  redo() { if (this.future.length) this.strokes.push(this.future.pop()); }
  clear() { this.strokes = []; this.future = []; }
}
export function drawingBounds(strokes) {
  const points = strokes.flatMap(stroke => stroke.points);
  if (!points.length) throw new Error('先画一点什么吧。');
  const pad = Math.max(...strokes.map(stroke => stroke.width)) / 2 + 4;
  const x = Math.min(...points.map(point => point.x)) - pad;
  const y = Math.min(...points.map(point => point.y)) - pad;
  return { x, y, width: Math.max(1, Math.max(...points.map(point => point.x)) + pad - x), height: Math.max(1, Math.max(...points.map(point => point.y)) + pad - y) };
}
export function makeDrawing(strokes) {
  const bounds = drawingBounds(strokes);
  return { ...bounds, strokes: strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ x: point.x - bounds.x, y: point.y - bounds.y })) })) };
}
export function normalizeEntry(value) {
  if (!value || typeof value.id !== 'string' || !value.id || !['text', 'drawing'].includes(value.kind)) throw new Error('作品格式不正确。');
  if (![value.x, value.y, value.createdAt].every(Number.isFinite) || value.x < -30 || value.x > WORLD.width || value.y < -30 || value.y > WORLD.height) throw new Error('作品位置不正确。');
  const base = { cityId: typeof value.cityId === 'string' && value.cityId ? value.cityId : UNASSIGNED, marker: normalizeMarker(value.marker, value.color, value.category), id: value.id, kind: value.kind, x: value.x, y: value.y, createdAt: value.createdAt, color: PALETTE.includes(value.color) ? value.color : PALETTE[0], sample: Boolean(value.sample), caught: Boolean(value.caught), rotation: clamp(Number(value.rotation) || 0, -12, 12) };
  if (value.kind === 'text') {
    const text = String(value.text ?? '').trim();
    if (!text || textLength(text) > 120) throw new Error('请写下 1–120 个字。');
    const category = ['daily', 'love', 'blessing'].includes(value.category) ? value.category : 'daily';
    return { ...base, text, category, effect: category === 'blessing' && ['fireworks', 'meteors'].includes(value.effect) ? value.effect : 'none', width: 280, height: 200 };
  }
  if (!Array.isArray(value.strokes) || !value.strokes.length || value.strokes.length > 2000 || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0 || value.width > WORLD.width + 30 || value.height > WORLD.height + 30) throw new Error('涂鸦数据不正确。');
  let totalPoints = 0;
  const strokes = value.strokes.map(stroke => {
    if (!Array.isArray(stroke.points) || !stroke.points.length || !PALETTE.includes(stroke.color) || ![3, 7, 12].includes(stroke.width)) throw new Error('笔画格式不正确。');
    totalPoints += stroke.points.length;
    if (totalPoints > 100000) throw new Error('这幅画太大了，试试分成几幅发布。');
    const points = stroke.points.map(point => {
      if (![point.x, point.y].every(Number.isFinite) || point.x < 0 || point.y < 0 || point.x > value.width || point.y > value.height) throw new Error('笔画坐标不正确。');
      return { x: point.x, y: point.y };
    });
    return { color: stroke.color, width: stroke.width, points };
  });
  return { ...base, width: value.width, height: value.height, strokes };
}
export function findPlacement(entries, center) {
  for (let i = 0; i < 80; i++) {
    const angle = i * 2.39996, radius = Math.sqrt(i) * 85;
    const point = { x: clamp(center.x - 140 + Math.cos(angle) * radius, 20, WORLD.width - 300), y: clamp(center.y - 70 + Math.sin(angle) * radius, 20, WORLD.height - 220) };
    if (!entries.some(entry => point.x < entry.x + entry.width + 20 && point.x + 300 > entry.x && point.y < entry.y + entry.height + 20 && point.y + 220 > entry.y)) return point;
  }
  return { x: clamp(center.x - 140, 20, WORLD.width - 300), y: clamp(center.y - 70, 20, WORLD.height - 220) };
}
