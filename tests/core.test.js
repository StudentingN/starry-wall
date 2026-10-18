import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, screenToWorld, worldToScreen, constrainCamera, zoomAt, StrokeHistory, isBlessing, makeDrawing, normalizeEntry, findPlacement, textLength } from '../src/core.js';

test('camera conversions preserve wall coordinates across viewport sizes and zoom levels', () => {
  for (const size of [{width:1440,height:500},{width:390,height:477}]) for (const zoom of [.35, 1, 2.5]) {
    const camera = {x:3000,y:2000,zoom}, point = {x:3123.4,y:1888.9};
    const result = screenToWorld(worldToScreen(point,camera,size),camera,size);
    assert.ok(Math.abs(result.x-point.x)<1e-8); assert.ok(Math.abs(result.y-point.y)<1e-8);
  }
});
test('zoom remains anchored to the pointer and respects zoom boundaries', () => {
  const size={width:1000,height:600}, camera={x:3000,y:2000,zoom:1}, pointer={x:230,y:170};
  const before=screenToWorld(pointer,camera,size), next=zoomAt(camera,size,pointer,1.8), after=screenToWorld(pointer,next,size);
  assert.ok(Math.abs(before.x-after.x)<1e-8); assert.ok(Math.abs(before.y-after.y)<1e-8);
  assert.equal(zoomAt(camera,size,pointer,100).zoom,2.5); assert.equal(zoomAt(camera,size,pointer,.001).zoom,.35);
  const constrained=constrainCamera({x:-500,y:9000,zoom:1},size); assert.equal(constrained.x,500); assert.equal(constrained.y,3700);
});
test('undo/redo preserves strokes and branching discards the redo history', () => {
  const history=new StrokeHistory(), stroke={color:PALETTE[0],width:3,points:[{x:10,y:20}]};
  history.add(stroke); stroke.points[0].x=999; assert.equal(history.strokes[0].points[0].x,10);
  history.add({...stroke,points:[{x:30,y:40}]}); history.undo(); assert.equal(history.strokes.length,1); history.redo(); assert.equal(history.strokes.length,2);
  history.undo(); history.add({...stroke,points:[{x:50,y:60}]}); assert.equal(history.future.length,0); history.redo(); assert.equal(history.strokes.length,2);
  history.clear(); history.undo(); history.redo(); assert.equal(history.strokes.length,0);
});
test('blessing suggestions recognize wishes without categorizing ordinary notes', () => {
  for (const text of ['希望你明天考试顺利','生日快乐','愿你所愿，皆能如愿','祝你平安喜乐']) assert.equal(isBlessing(text),true);
  for (const text of ['今天去看了电影','我喜欢晚风','只是普通的一天','']) assert.equal(isBlessing(text),false);
});
test('drawing data survives normalization and serialization without moving strokes', () => {
  const strokes=[{color:PALETTE[2],width:7,points:[{x:2990,y:1800},{x:3010,y:1850}]}];
  const entry=normalizeEntry({id:'drawing-1',kind:'drawing',createdAt:1,...makeDrawing(strokes)});
  const restored=normalizeEntry(JSON.parse(JSON.stringify(entry)));
  assert.deepEqual(restored,entry);
  assert.equal(restored.x+restored.strokes[0].points[0].x,2990);
  assert.equal(restored.y+restored.strokes[0].points[1].y,1850);
  assert.throws(()=>makeDrawing([]),/先画/);
});
test('text limits count Unicode characters; invalid records and unsafe fields are rejected or removed', () => {
  const base={id:'one',kind:'text',x:100,y:100,createdAt:1,color:PALETTE[0],category:'blessing',effect:'fireworks'};
  assert.equal(textLength('🌠'.repeat(120)),120);
  const result=normalizeEntry({...base,text:'🌠'.repeat(120),html:'<script>bad</script>'});
  assert.equal(result.text.length,240); assert.equal(result.html,undefined); assert.equal(result.effect,'fireworks');
  assert.throws(()=>normalizeEntry({...base,text:'🌠'.repeat(121)}),/120/);
  assert.throws(()=>normalizeEntry({...base,text:'   '}),/120/);
  assert.throws(()=>normalizeEntry({...base,text:'ok',x:NaN}),/位置/);
  assert.equal(normalizeEntry({...base,text:'ok',category:'daily'}).effect,'none');
});
test('placement avoids existing work when open space is available and stays within the wall', () => {
  const existing=[{x:2860,y:1930,width:280,height:155}];
  const p=findPlacement(existing,{x:3000,y:2000});
  assert.equal(p.x<3140+20 && p.x+300>2860 && p.y<2085+20 && p.y+175>1930,false);
  const edge=findPlacement([],{x:-500,y:10000}); assert.ok(edge.x>=20 && edge.y<=3820);
});
