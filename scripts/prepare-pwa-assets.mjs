import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

// Dependency-free PNGs using the same scan mark as the application favicon.
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return out;}
function png(size){
  const rows=Buffer.alloc((size*4+1)*size);
  const inside=(x,y,l,t,r,b)=>x>=l&&x<=r&&y>=t&&y<=b;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;let colour=[23,62,53];
    const corner=inside(u,v,.24,.24,.38,.27)||inside(u,v,.24,.24,.27,.38)||inside(u,v,.62,.24,.76,.27)||inside(u,v,.73,.24,.76,.38)||inside(u,v,.24,.73,.38,.76)||inside(u,v,.24,.62,.27,.76)||inside(u,v,.62,.73,.76,.76)||inside(u,v,.73,.62,.76,.76);
    const card=inside(u,v,.36,.40,.64,.60)&&!inside(u,v,.378,.418,.622,.582);
    if(corner)colour=[223,243,151];else if(card||inside(u,v,.40,.45,.46,.53)||inside(u,v,.50,.45,.60,.465)||inside(u,v,.50,.50,.58,.515))colour=[248,249,245];
    const index=y*(size*4+1)+1+x*4;rows[index]=colour[0];rows[index+1]=colour[1];rows[index+2]=colour[2];rows[index+3]=255;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const directory=new URL('../public/icons/',import.meta.url);await mkdir(directory,{recursive:true});
for(const [name,size] of [['icon-192',192],['icon-512',512],['maskable-512',512],['apple-touch-icon',180]])await writeFile(new URL(`${name}.png`,directory),png(size));
