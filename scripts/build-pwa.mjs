import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

async function files(directory,prefix=''){
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=prefix+entry.name;
    if(entry.isDirectory())result.push(...await files(join(directory,entry.name),relative+'/'));else result.push(relative);
  }
  return result.sort();
}
const all=await files('dist');
const shell=all.filter(file=>!file.startsWith('ocr/'));
const ocr=all.filter(file=>file.startsWith('ocr/')&&/\.(?:js|wasm|gz)$/.test(file));
async function revision(paths){const hash=createHash('sha256');for(const file of paths){hash.update(file);hash.update(await readFile(join('dist',file)));}return hash.digest('hex').slice(0,16);}
const config={version:await revision(shell),ocrVersion:await revision(ocr),shell,ocr,ocrBytes:(await Promise.all(ocr.map(async file=>(await stat(join('dist',file))).size))).reduce((a,b)=>a+b,0)};
const template=await readFile(new URL('./sw-template.js',import.meta.url),'utf8');
await writeFile('dist/sw.js',template.replace('/* PWA_CONFIG */',JSON.stringify(config)));
console.log(`PWA prête : ${shell.length} fichiers d’application, pack OCR ${Math.ceil(config.ocrBytes/1024/1024)} Mo.`);
