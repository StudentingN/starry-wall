import { prepareCitySearch, searchCities, nearbyCities } from './geo.js';
let pending;
export function loadCatalog() {
  if (!pending) pending=fetch(new URL('../assets/data/cities.json',import.meta.url)).then(response=>{if(!response.ok)throw new Error('城市目录加载失败，请刷新重试。');return response.json();}).then(cities=>{
    const byId=new Map(cities.map(city=>[city.id,city])), index=prepareCitySearch(cities);
    return { cities, byId, search:query=>searchCities(index,query), nearby:position=>nearbyCities(cities,position), named(name){return searchCities(index,name,1)[0];} };
  }).catch(error=>{pending=undefined;throw error;});
  return pending;
}
