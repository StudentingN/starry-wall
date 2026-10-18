import { PALETTE, normalizeEntry } from './core.js';
const time = 1792252800000;
const text = (id, x, y, content, color, category = 'daily', rotation = 0, effect = 'none') => normalizeEntry({ id, kind: 'text', x, y, text: content, color, category, rotation, effect, sample: true, createdAt: time });
const line = (color, points, width = 3) => ({ color, width, points: points.map(([x, y]) => ({ x, y })) });
const star = Array.from({ length: 11 }, (_, i) => { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 23 : 52; return [60 + Math.cos(a) * r, 60 + Math.sin(a) * r]; });
const circle = (x, y, r) => Array.from({ length: 49 }, (_, i) => [x + Math.cos(i / 48 * Math.PI * 2) * r, y + Math.sin(i / 48 * Math.PI * 2) * r]);
const baseSamples = [
  text('sample-wish', 2940, 1910, '愿认真生活的你，\n都能被温柔以待。', PALETTE[0], 'blessing', -3, 'meteors'),
  text('sample-love', 2540, 1940, '喜欢你这件事，\n连晚风都知道。', PALETTE[1], 'love', -5),
  text('sample-day', 2710, 1735, '今天也有好好生活 ☺', PALETTE[2], 'daily', 3),
  text('sample-flower', 3280, 1775, '没有人规定\n花一定要长成玫瑰。', PALETTE[5], 'daily', 4),
  text('sample-good', 3240, 2120, '愿你所愿，皆能如愿 ✧', PALETTE[3], 'blessing', -3, 'fireworks'),
  text('sample-night', 2750, 2160, '宇宙很大，\n今晚的烦恼很小。', PALETTE[4], 'daily', 2),
  normalizeEntry({ id: 'sample-star', kind: 'drawing', x: 3110, y: 1740, width: 125, height: 125, strokes: [line(PALETTE[4], star)], sample: true, createdAt: time }),
  normalizeEntry({ id: 'sample-smile', kind: 'drawing', x: 2530, y: 2140, width: 130, height: 130, strokes: [line(PALETTE[5], circle(65, 65, 48)), line(PALETTE[5], [[48, 46], [48, 54]], 7), line(PALETTE[5], [[82, 46], [82, 54]], 7), line(PALETTE[5], Array.from({length: 17}, (_, i) => [65 + Math.cos(Math.PI / 8 + i / 16 * Math.PI * 0.75) * 28, 65 + Math.sin(Math.PI / 8 + i / 16 * Math.PI * 0.75) * 28]))], sample: true, createdAt: time }),
];

export let samples = [];
export function initSamples(catalog) {
  const home=catalog.named('南京')||catalog.named('Nanjing');
  if(!home) throw new Error('城市目录缺少南京，请重新准备地理资源。');
  samples=baseSamples.map(entry=>({...entry,cityId:home.id,marker:{preset:entry.category==='love'?'heart':entry.kind==='drawing'?'cat':'star',emoji:'',title:entry.kind==='drawing'?'随手画':'小小心愿',color:entry.color}}));
  const cities=['上海','北京','成都','杭州','广州','东京','Tokyo','Paris','London','New York City','Sydney','Singapore','Cape Town','Bangkok'];
  const seen=new Set([home.id]);
  cities.forEach((name,i)=>{
    const city=catalog.named(name);if(!city||seen.has(city.id))return;seen.add(city.id);
    const content=['愿这里的晚风，带来好消息。','今天也有一件值得开心的小事。','把喜欢写下来，留给下一次相遇。','愿认真生活的你，被温柔以待。'][i%4];
    const entry=normalizeEntry({id:'sample-city-'+city.id,kind:'text',x:2940,y:1910,createdAt:time+i,text:content,color:PALETTE[i%PALETTE.length],category:i%3===0?'blessing':'daily',effect:i%3===0?'meteors':'none',sample:true});
    samples.push({...entry,cityId:city.id,marker:{preset:['star','letter','flower','planet','cat','heart'][i%6],emoji:'',title:['晚风来信','日常碎片','小小心愿'][i%3],color:entry.color}});
  });
  return samples;
}
