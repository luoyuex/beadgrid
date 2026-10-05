import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadFiles, downloadResponse } from '../src/lib/membership/download.mjs';
const file = {key:'private/pattern.png',name:'图纸.png',type:'image/png'};
function fixture(expiry = new Date(Date.now()+60000), owner='u1', status='SUCCEEDED') {
  let reads=0;
  return {db:{membership:{findUnique:async()=>({expiresAt:expiry})},exportJob:{findFirst:async({where})=> where.userId===owner && where.id==='job1' && where.status===status ? {files:[file]} : null}},read:async f=>{assert.equal(f,file);reads++;return new ReadableStream({start(c){c.enqueue(new Uint8Array([137,80,78,71]));c.close()}})},reads:()=>reads};
}
test('links follow current origin and never contain storage endpoint, keys or credentials',()=>{
 const [link]=downloadFiles([file],'job1');assert.equal(link.url,'/api/exports/job1/files/0');assert.equal(new URL(link.url,'https://zhiyingai.online').origin,'https://zhiyingai.online');assert.equal(new URL(link.url,'https://new.example.com').origin,'https://new.example.com');assert.equal(JSON.stringify(link).includes(file.key),false);
});
test('owner downloads actual bytes as attachment with private no-store headers',async()=>{const f=fixture();const response=await downloadResponse(f.db,'u1','job1','0',f.read);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.match(response.headers.get('content-disposition'),/filename\*=UTF-8''%E5/);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[137,80,78,71]);});
test('expiry blocks download before storage is read',async()=>{const f=fixture(new Date(0));await assert.rejects(downloadResponse(f.db,'u1','job1','0',f.read),{status:403});assert.equal(f.reads(),0)});
test('other users and incomplete tasks cannot download',async()=>{for(const f of [fixture(undefined,'other'),fixture(undefined,'u1','PROCESSING')]) {await assert.rejects(downloadResponse(f.db,'u1','job1','0',f.read),{status:404});assert.equal(f.reads(),0)}});
test('invalid or missing file indexes do not reach storage',async()=>{const f=fixture();for(const index of ['-1','../key','1','01','100','0.1'])await assert.rejects(downloadResponse(f.db,'u1','job1',index,f.read),{status:404});assert.equal(f.reads(),0)});
test('storage failures reject instead of returning a successful attachment',async()=>{const f=fixture();await assert.rejects(downloadResponse(f.db,'u1','job1','0',async()=>{throw new Error('offline')}),/offline/)});
