import { normalizeEntry } from './core.js';
import { migrateEntry, UNASSIGNED } from './geo.js';
export const DATABASE_VERSION=2;
let pending;
function summaryOf(entry) { return { cityId:entry.cityId,count:1,latestAt:Number(entry.createdAt)||0,latestId:entry.id,marker:entry.marker }; }
function addToSummary(map,entry) {
  const previous=map.get(entry.cityId);
  if(!previous)map.set(entry.cityId,summaryOf(entry));
  else { previous.count++; if(entry.createdAt>=previous.latestAt)Object.assign(previous,{latestAt:entry.createdAt,latestId:entry.id,marker:entry.marker}); }
}
function database(){
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('浏览器不支持本地保存，请换用普通窗口中的现代浏览器。'));return;}
    const request=indexedDB.open('starry-wall',DATABASE_VERSION);let blocked=false;
    request.onupgradeneeded=event=>{
      const db=request.result,tx=request.transaction;
      const entries=db.objectStoreNames.contains('entries')?tx.objectStore('entries'):db.createObjectStore('entries',{keyPath:'id'});
      if(!db.objectStoreNames.contains('preferences'))db.createObjectStore('preferences');
      const summaries=db.objectStoreNames.contains('summaries')?tx.objectStore('summaries'):db.createObjectStore('summaries',{keyPath:'cityId'});
      if(!entries.indexNames.contains('cityId'))entries.createIndex('cityId','cityId');
      if(!entries.indexNames.contains('cityTime'))entries.createIndex('cityTime',['cityId','createdAt']);
      if(event.oldVersion<2){
        const groups=new Map(),cursor=entries.openCursor();
        cursor.onsuccess=()=>{
          const row=cursor.result;
          if(row){const value=migrateEntry(row.value);row.update(value);addToSummary(groups,value);row.continue();}
          else for(const summary of groups.values())summaries.put(summary);
        };
      }
    };
    request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onversionchange=()=>{db.close();pending=undefined;};resolve(db);};
    request.onerror=()=>reject(request.error||new Error('无法打开本地作品库。'));
    request.onblocked=()=>{blocked=true;reject(new Error('旧标签页正在使用作品库，请关闭旧页面后重试。'));};
  }).catch(error=>{pending=undefined;throw error;});
  return pending;
}
async function run(stores,mode,operation){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode);let result;
    tx.oncomplete=()=>resolve(typeof result==='function'?result():result);
    tx.onabort=tx.onerror=()=>reject(tx.error||new Error('本地保存失败，请检查空间或权限后重试。'));
    try{result=operation(tx);}catch(error){tx.abort();reject(error);}
  });
}
function read(store,operation){
  return run([store],'readonly',tx=>{
    let value;const request=operation(tx.objectStore(store));request.onsuccess=()=>value=request.result;return()=>value;
  });
}
function refreshSummary(tx,cityId){
  const entries=tx.objectStore('entries'),summaries=tx.objectStore('summaries');
  let count,latest,finished=0;
  const finish=()=>{if(++finished!==2)return;if(count&&latest)summaries.put({...summaryOf(latest),count});else summaries.delete(cityId);};
  const counter=entries.index('cityId').count(cityId);counter.onsuccess=()=>{count=counter.result;finish();};
  const range=IDBKeyRange.bound([cityId,0],[cityId,Number.MAX_SAFE_INTEGER]);
  const request=entries.index('cityTime').openCursor(range,'prev');request.onsuccess=()=>{latest=request.result?.value;finish();};
}
function safeRecords(values){let skipped=0;const records=values.flatMap(value=>{try{return[normalizeEntry(value)];}catch{skipped++;return[];}});storage.invalidCount=skipped;return records;}
export const storage={
  invalidCount:0,
  async loadPreferences(){return(await read('preferences',store=>store.get('settings')))||{};},
  listSummaries(){return read('summaries',store=>store.getAll());},
  async listEntries(cityId){return safeRecords(await read('entries',store=>store.index('cityId').getAll(cityId))).sort((a,b)=>a.createdAt-b.createdAt);},
  async listMyEntries(){return safeRecords(await read('entries',store=>store.getAll())).sort((a,b)=>b.createdAt-a.createdAt);},
  async getEntry(id){const value=await read('entries',store=>store.get(id));return value?normalizeEntry(value):null;},
  saveEntry(value){
    const entry=normalizeEntry(value);
    return run(['entries','summaries'],'readwrite',tx=>{
      const store=tx.objectStore('entries'),request=store.get(entry.id);
      request.onsuccess=()=>{const old=request.result;store.put(entry);for(const cityId of new Set([old?.cityId,entry.cityId].filter(Boolean)))refreshSummary(tx,cityId);};
    });
  },
  deleteEntry(id){
    return run(['entries','summaries'],'readwrite',tx=>{
      const store=tx.objectStore('entries'),request=store.get(id);
      request.onsuccess=()=>{if(request.result){const cityId=request.result.cityId;store.delete(id);refreshSummary(tx,cityId);}};
    });
  },
  assignCity(ids,cityId){
    if(!cityId||cityId===UNASSIGNED)throw new Error('请先选择一个城市。');
    const unique=[...new Set(ids)];if(!unique.length)return Promise.resolve();
    return run(['entries','summaries'],'readwrite',tx=>{
      const store=tx.objectStore('entries'),affected=new Set([cityId]);let remaining=unique.length;
      for(const id of unique){const request=store.get(id);request.onsuccess=()=>{if(request.result){affected.add(request.result.cityId);store.put({...request.result,cityId});}if(--remaining===0)for(const affectedId of affected)refreshSummary(tx,affectedId);};}
    });
  },
  savePreferences(value){return run(['preferences'],'readwrite',tx=>{tx.objectStore('preferences').put(structuredClone(value),'settings');});},
  async load(){const[entries,preferences]=await Promise.all([this.listMyEntries(),this.loadPreferences()]);return{entries,preferences,invalidCount:this.invalidCount};},
};
