import test from 'node:test';
import assert from 'node:assert/strict';
import { fullFrame, validCorners, perspectiveMap, enhanceColors } from '../src/photo.js';
import { parseCatalogueBackup } from '../src/catalogue.js';
import { blankContact } from '../src/contacts.js';

test('perspective correction maps each output corner to its source corner',()=>{
  const points=[{x:.15,y:.1},{x:.9,y:.2},{x:.8,y:.85},{x:.05,y:.7}];
  const map=perspectiveMap(points);
  for(const [index,p] of fullFrame().entries()){
    const result=map(p.x,p.y);assert.ok(Math.abs(result.x-points[index].x)<1e-9);assert.ok(Math.abs(result.y-points[index].y)<1e-9);
  }
});
test('rejects crossed, degenerate and invalid quadrilaterals',()=>{
  assert.equal(validCorners([fullFrame()[0],fullFrame()[2],fullFrame()[1],fullFrame()[3]]),false);
  assert.equal(validCorners(Array(4).fill({x:.5,y:.5})),false);
  assert.equal(validCorners([null,null,null,null]),false);
  assert.equal(validCorners(fullFrame()),true);
});
test('colour correction preserves a dark coloured design and never inverts it',()=>{
  const pixels=new Uint8ClampedArray([10,30,80,255,220,230,240,255]);
  enhanceColors(pixels);assert.ok(pixels[2]>pixels[1]&&pixels[1]>=pixels[0]);assert.ok(pixels[0]<80);assert.equal(pixels[3],255);
});
test('catalogue backup validates photos, contacts and history before restoration',()=>{
  const contact={...blankContact(),id:'card-1',firstName:'Zoé',image:'data:image/jpeg;base64,YWJj',createdAt:100,updatedAt:200};
  const event={id:'e1',kind:'scan',contactId:'card-1',name:'Zoé',timestamp:100};
  const backup={application:'MiniBCR',version:1,contacts:[contact],history:[event]};
  const result=parseCatalogueBackup(JSON.stringify(backup));assert.equal(result.contacts[0].image,contact.image);assert.deepEqual(result.history,[event]);
  assert.throws(()=>parseCatalogueBackup(JSON.stringify({...backup,contacts:[{...contact,image:'data:image/svg+xml;base64,aaaa'}]})),/photo/);
  assert.throws(()=>parseCatalogueBackup(JSON.stringify({...backup,history:[{...event,kind:'__proto__'}]})),/historique/);
  assert.throws(()=>parseCatalogueBackup(JSON.stringify({...backup,contacts:[contact,contact]})),/double/);
});
