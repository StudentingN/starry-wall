import { samples } from './samples.js';
import { Wall } from './wall.js';
import { hydrateIcons } from './icons.js';
hydrateIcons();
const wall = new Wall(document.querySelector('#wall'), {
  onSelect(entry) { document.querySelector('#detail-meta').textContent = '示例作品'; const content = document.querySelector('#detail-content'); content.textContent = entry.kind === 'text' ? entry.text : '星空里的随手涂鸦'; content.className = 'detail-text'; content.style.color = entry.color; document.querySelector('#detail').showModal(); },
  onCamera(camera) { document.querySelector('#zoom-value').textContent = Math.round(camera.zoom * 100) + '%'; }
});
wall.setEntries(samples);
document.querySelector('#zoom-in').onclick = () => wall.zoom(1.2);
document.querySelector('#zoom-out').onclick = () => wall.zoom(1 / 1.2);
document.querySelector('#center-view').onclick = () => wall.center();
document.querySelector('#compose-open').onclick = () => document.querySelector('#composer').showModal();
document.querySelector('#collection-open').onclick = () => document.querySelector('#collection').showModal();
document.querySelector('#settings-open').onclick = () => document.querySelector('#settings').showModal();
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => document.getElementById(button.dataset.close).close());
