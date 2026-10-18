const RAD = Math.PI / 180;
export const UNASSIGNED = 'unassigned';
export const MARKERS = [
  { id: 'star', icon: '⭐', name: '小星星' }, { id: 'letter', icon: '💌', name: '一封信' },
  { id: 'cat', icon: '🐱', name: '小猫咪' }, { id: 'flower', icon: '🌷', name: '一朵花' },
  { id: 'heart', icon: '💗', name: '小心意' }, { id: 'planet', icon: '🪐', name: '小行星' },
];
const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
export const graphemes = text => [...segmenter.segment(String(text))].map(part => part.segment);
export function normalizeMarker(value = {}, color = '#efae7f', category = 'daily') {
  const preset = MARKERS.some(item => item.id === value.preset) ? value.preset : category === 'love' ? 'heart' : category === 'blessing' ? 'star' : 'letter';
  const emoji = String(value.emoji || '').trim(), title = String(value.title || '').trim();
  if (graphemes(title).length > 6) throw new Error('标签标题最多 6 个字。');
  if (emoji && (graphemes(emoji).length !== 1 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji))) throw new Error('请填写一个表情符号作为标签。');
  const colors = ['#efae7f','#e9bdca','#a5badc','#b8c7a2','#dfc786','#eee8dd'];
  return { preset, emoji, title, color: colors.includes(value.color) ? value.color : colors.includes(color) ? color : colors[0] };
}
export function markerIcon(marker = {}) { return marker.emoji || MARKERS.find(item => item.id === marker.preset)?.icon || '⭐'; }
export function latLngToVector(lat, lng) { const phi = lat * RAD, theta = lng * RAD; return { x: Math.cos(phi) * Math.cos(theta), y: Math.sin(phi), z: Math.cos(phi) * Math.sin(theta) }; }
export function vectorToLatLng({ x, y, z }) { return { lat: Math.atan2(y, Math.hypot(x,z)) / RAD, lng: Math.atan2(z,x) / RAD }; }
export function frontFacing(city, pov) {
  const a = latLngToVector(city.lat, city.lng), b = latLngToVector(pov.lat, pov.lng);
  return a.x*b.x + a.y*b.y + a.z*b.z > 1 / (1 + Math.max(.05, pov.altitude));
}
export function distanceKm(a, b) {
  const lat = (b.lat-a.lat)*RAD, lng = (b.lng-a.lng)*RAD;
  const h = Math.sin(lat/2)**2 + Math.cos(a.lat*RAD)*Math.cos(b.lat*RAD)*Math.sin(lng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)), Math.sqrt(Math.max(0,1-h)));
}
export function nearbyCities(cities, position, limit = 5) {
  if (![position.lat,position.lng].every(Number.isFinite)) return [];
  return cities.map(city => ({ ...city, distance: distanceKm(position,city) })).filter(city => city.distance <= 200).sort((a,b)=>a.distance-b.distance).slice(0,limit);
}
const searchKey = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/[\s·.,，市]/g,'');
export function prepareCitySearch(cities) {
  return cities.map(city => ({ city, keys: [city.name,...(city.aliases||[])].map(searchKey), hierarchy: searchKey([city.country,city.region,city.name].join('')) }));
}
export function searchCities(index, query, limit = 25) {
  const key=searchKey(query); if (!key) return [];
  return index.map(row => {
    const score=row.keys.some(name=>name===key)?0:row.keys.some(name=>name.startsWith(key))?1:row.keys.some(name=>name.includes(key))||row.hierarchy.includes(key)?2:3;
    return { city:row.city,score };
  }).filter(row=>row.score<3).sort((a,b)=>a.score-b.score || (b.city.population||0)-(a.city.population||0)).slice(0,limit).map(row=>row.city);
}
export function cityPath(city) { return [...new Set([city.country,city.region,city.name].filter(Boolean))].join(' · '); }
export function clusterProjected(projected, limit = 60, initialCell = 70) {
  let cell=initialCell, groups=[];
  do {
    const buckets=new Map();
    for (const item of projected) {
      const key=Math.floor(item.screenX/cell)+':'+Math.floor(item.screenY/cell);
      if(!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(item);
    }
    groups=[...buckets.values()].map(items=>{
      const vector=items.reduce((sum,item)=>{ const v=latLngToVector(item.lat,item.lng); return {x:sum.x+v.x,y:sum.y+v.y,z:sum.z+v.z}; },{x:0,y:0,z:0});
      const representative=[...items].sort((a,b)=>(b.latestAt||0)-(a.latestAt||0))[0];
      return { ...representative, ...vectorToLatLng(vector), id:items.map(item=>item.id).sort().join('|'), members:items, count:items.reduce((sum,item)=>sum+item.count,0), ownCount:items.reduce((sum,item)=>sum+(item.ownCount||0),0), sampleCount:items.reduce((sum,item)=>sum+(item.sampleCount||0),0) };
    });
    cell*=1.35;
  } while(groups.length>limit && cell<20000);
  return groups;
}
export function migrateEntry(value) {
  let marker;try{marker=normalizeMarker(value.marker,value.color,value.category);}catch{marker=normalizeMarker({},value.color,value.category);}
  return { ...value, cityId: typeof value.cityId==='string' && value.cityId ? value.cityId : UNASSIGNED, marker };
}
