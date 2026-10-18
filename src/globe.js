import { frontFacing, clusterProjected, markerIcon } from './geo.js';
export class GlobeView {
  constructor(element, { onSelect, onCluster, onFailure } = {}) {
    this.element=element; this.onSelect=onSelect; this.onCluster=onCluster; this.onFailure=onFailure; this.summaries=[]; this.active=true; this.signature=''; this.reducedMotion=false; this.queued=0;
    this.resizeObserver=new ResizeObserver(()=>{if(this.globe&&this.active&&element.clientWidth){this.globe.width(element.clientWidth).height(element.clientHeight);this.requestUpdate();}});this.resizeObserver.observe(element);
  }
  async init() {
    try {
      const [module,response]=await Promise.all([import('globe.gl'),fetch(new URL('../assets/data/land.geojson',import.meta.url))]);
      if(!response.ok) throw new Error('陆地轮廓加载失败。');
      const land=await response.json();
      this.globe=new module.default(this.element,{ animateIn:false, rendererConfig:{antialias:true,alpha:true,powerPreference:'low-power'} })
        .width(this.element.clientWidth).height(this.element.clientHeight).backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true).atmosphereColor('#628d9d').atmosphereAltitude(.12)
        .polygonsData(land.features).polygonCapColor(()=> '#355663').polygonSideColor(()=> '#253f4c').polygonStrokeColor(()=> '#446975').polygonAltitude(.002).polygonsTransitionDuration(0)
        .htmlLat('lat').htmlLng('lng').htmlAltitude(.025).htmlElement(item=>this.marker(item))
        .htmlElementVisibilityModifier((element,visible)=>{element.hidden=!visible;element.style.pointerEvents=visible?'auto':'none';element.setAttribute('aria-hidden',String(!visible));element.tabIndex=visible?0:-1;})
        .onZoom(()=>this.requestUpdate());
      const material=this.globe.globeMaterial();material.color.set('#122c3c');material.emissive?.set('#041018');material.shininess=12;
      const controls=this.globe.controls();controls.enablePan=false;controls.minDistance=115;controls.maxDistance=650;controls.rotateSpeed=.55;controls.zoomSpeed=.65;controls.enableDamping=true;
      this.globe.pointOfView({lat:30,lng:108,altitude:innerWidth<600?2.3:1.95},0);
      controls.addEventListener('change',()=>this.requestUpdate());
      this.globe.renderer().setPixelRatio(Math.min(devicePixelRatio||1,1.5));
      this.globe.renderer().domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();this.fail(new Error('地球显示暂时不可用，仍可从城市列表进入留言墙。'));});
      this.element.tabIndex=0; this.element.setAttribute('aria-label','地球仪：拖动旋转、滚轮或双指缩放，方向键旋转');
      this.element.addEventListener('keydown',event=>{
        const pov=this.globe.pointOfView(), directions={ArrowLeft:[0,-10],ArrowRight:[0,10],ArrowUp:[10,0],ArrowDown:[-10,0]};
        if(directions[event.key]){event.preventDefault();const[lat,lng]=directions[event.key];this.globe.pointOfView({...pov,lat:Math.max(-80,Math.min(80,pov.lat+lat)),lng:pov.lng+lng},0);}
        if(event.key==='Home'){event.preventDefault();this.reset();}
      });
      this.element.dataset.ready='true'; this.requestUpdate();
      return true;
    } catch(error) {this.fail(error);return false;}
  }
  fail(error){this.failed=true;this.globe?.pauseAnimation();this.onFailure?.(error);}
  marker(item) {
    const button=document.createElement('button');button.className='globe-marker'+(item.members.length>1?' cluster':'');button.dataset.markerId=item.id;button.dataset.cityId=item.members.length===1?item.members[0].cityId:'';
    const symbol=document.createElement('span');symbol.className='globe-marker-icon';symbol.textContent=item.members.length>1?'✦':markerIcon(item.marker);button.append(symbol);
    const label=document.createElement('span');label.className='globe-marker-label';label.textContent=item.members.length>1?item.members.length+' 座城':item.city?.name||item.name||'';button.append(label);
    const count=document.createElement('span');count.className='globe-marker-count';count.textContent=item.count;button.append(count);
    button.style.setProperty('--marker-color',item.marker?.color||'#efae7f');
    button.setAttribute('aria-label',label.textContent+'，'+item.ownCount+' 件我的作品，'+item.sampleCount+' 件示例');
    button.title=item.members.length>1?'靠近这些城市':label.textContent+' · '+(item.marker?.title||'点击看看');
    for(const type of ['pointerdown','pointerup'])button.addEventListener(type,event=>event.stopPropagation());
    button.onclick=event=>{event.stopPropagation();if(item.members.length===1)this.onSelect?.(item.members[0].city);else{this.globe.pointOfView({lat:item.lat,lng:item.lng,altitude:Math.max(.35,this.globe.pointOfView().altitude*.65)},this.reducedMotion?0:650);this.onCluster?.(item.members.map(member=>member.city));}};
    return button;
  }
  setSummaries(summaries){this.summaries=summaries;this.signature='';this.requestUpdate();}
  requestUpdate(){if(!this.queued)this.queued=requestAnimationFrame(()=>{this.queued=0;this.updateMarkers();});}
  updateMarkers(){
    if(!this.globe||this.failed||!this.active)return;
    const pov=this.globe.pointOfView(), width=this.element.clientWidth,height=this.element.clientHeight;
    const projected=this.summaries.filter(item=>frontFacing(item,pov)).map(item=>{const p=this.globe.getScreenCoords(item.lat,item.lng,.025);return{...item,screenX:p.x,screenY:p.y};}).filter(item=>item.screenX>=-40&&item.screenX<=width+40&&item.screenY>=-40&&item.screenY<=height+40);
    const groups=clusterProjected(projected,innerWidth<600?24:64,pov.altitude>.8?(innerWidth<600?78:95):65);
    const signature=groups.map(group=>group.id+':'+group.count+':'+(group.marker?.title||'')+':'+markerIcon(group.marker)).sort().join(';');
    if(signature!==this.signature){this.signature=signature;this.globe.htmlElementsData(groups);}
    this.element.dataset.markerCount=String(groups.length);this.element.dataset.altitude=String(pov.altitude);
  }
  focusCity(city){if(this.globe&&!this.failed)this.globe.pointOfView({lat:city.lat,lng:city.lng,altitude:.65},this.reducedMotion?0:900);}
  reset(){if(this.globe)this.globe.pointOfView({lat:30,lng:108,altitude:innerWidth<600?2.3:1.95},this.reducedMotion?0:700);}
  zoom(factor){if(this.globe){const pov=this.globe.pointOfView();this.globe.pointOfView({...pov,altitude:Math.max(.15,Math.min(5,pov.altitude*factor))},this.reducedMotion?0:200);}}
  setActive(active){this.active=active;if(!this.globe)return;if(active){this.globe.width(this.element.clientWidth).height(this.element.clientHeight).resumeAnimation();this.requestUpdate();}else this.globe.pauseAnimation();}
  setReducedMotion(value){this.reducedMotion=value;if(this.globe)this.globe.controls().enableDamping=!value;}
}
