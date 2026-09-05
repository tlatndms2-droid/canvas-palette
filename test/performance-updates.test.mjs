import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
globalThis.window = globalThis;
async function load(file) {
  const dir = await mkdtemp(join(tmpdir(), 'cp-update-test-'));
  const out = join(dir, 'module.mjs');
  await build({entryPoints:[file], outfile:out, bundle:true, format:'esm', platform:'node', plugins:[{name:'obsidian-stub',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export class App {} export class TFile {} export class Notice {} export const requestUrl = () => {};'}));}}]});
  return {module:await import(pathToFileURL(out).href),cleanup:()=>rm(dir,{recursive:true,force:true})};
}
test('batched Import observers see final selection only and untyped changes stay compatible', async()=>{
  const loaded=await load('src/core/store.ts');
  try {
    const store=new loaded.module.PaletteStore({saveData:async()=>{}});
    const states=[];store.subscribe(change=>states.push({change,selected:[...store.data.uiState.miniPalette.collectSelectedItemIds]}));
    store.data.uiState.miniPalette.collectSelectedItemIds=['imported'];
    store.batch(()=>{store.changed();store.batch(()=>store.changed());store.data.uiState.miniPalette.collectSelectedItemIds=[];store.changed();});
    assert.deepEqual(states,[{change:{kind:'all'},selected:[]}]);
    store.changed({kind:'selection',surface:'mini'});assert.equal(states.at(-1).change.kind,'selection');
    await store.flush();
  } finally {await loaded.cleanup();}
});
test('batch is released after an exception without swallowing later updates',async()=>{
  const loaded=await load('src/core/store.ts');
  try {const store=new loaded.module.PaletteStore({saveData:async()=>{}});let count=0;store.subscribe(()=>count++);
    assert.throws(()=>store.batch(()=>{store.changed();throw Error('fixture');}));store.changed();assert.equal(count,2);await store.flush();
  } finally {await loaded.cleanup();}
});
test('Canvas sync identifies only changed items and retains node IDs for link cleanup',async()=>{
  const loaded=await load('src/canvas/canvas-adapter.ts');
  try {
    const adapter=new loaded.module.CanvasAdapter({});
    const nodes=[{id:'a',type:'text',text:'changed',x:0,y:0,width:100,height:100},{id:'b',type:'text',text:'same',x:200,y:0,width:100,height:100}];
    adapter.read=async()=>({nodes,edges:[]});
    const item=(id,text,path='A.canvas')=>({id,type:'card',content:text,displayTitle:text,origin:{canvasPath:path,canvasNodeId:id},canvasPlacements:[]});
    const items=[item('a','before'),item('b','same'),item('other','outside','B.canvas')];
    const first=await adapter.syncItemsFromCanvas({path:'A.canvas'},items);
    assert.equal(first.changedItems,1);assert.deepEqual(first.changedItemIds,['a']);assert.deepEqual([...first.nodeIds],['a','b']);
    const second=await adapter.syncItemsFromCanvas({path:'A.canvas'},items);assert.equal(second.changedItems,0);assert.deepEqual(second.changedItemIds,[]);
  } finally {await loaded.cleanup();}
});
test('Import success, duplicate and rejection outcomes preserve the intended remaining selection',async()=>{
  const loaded=await load('src/core/store.ts');
  try {
    const store=new loaded.module.PaletteStore({saveData:async()=>{}});const w=store.createWorkspace('Test');
    for(const id of ['a','b'])store.addPending({id,type:'card',displayTitle:id,content:id,origin:{},canvasPlacements:[],tags:[],label:'',caption:'',backContent:'',createdAt:1,modifiedAt:1});
    assert.deepEqual(store.importPending(w.id,['a']),{imported:['a'],alreadySaved:[],rejected:[]});
    store.collectCanvasItems([store.data.items.a]);
    assert.deepEqual(store.importPending(w.id,['a','b']),{imported:['b'],alreadySaved:['a'],rejected:[]});
    assert.deepEqual(store.data.pendingItemIds,['a']);
    assert.deepEqual(store.importPending('missing',['a']),{imported:[],alreadySaved:[],rejected:['a']});await store.flush();
  } finally {await loaded.cleanup();}
});
