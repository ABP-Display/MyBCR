import { loadImage } from './recognition.js';

export const fullFrame = () => [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

export function validCorners(points) {
  if (!Array.isArray(points) || points.length !== 4 || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return false;
  const cross = points.map((p, i) => {
    const q = points[(i + 1) % 4], r = points[(i + 2) % 4];
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  });
  const area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % 4].y - p.y * points[(i + 1) % 4].x, 0) / 2;
  return cross.every(value => value > .0001) && area > .025;
}

// Map the unit rectangle to a convex quadrilateral (projective transform).
export function perspectiveMap(points) {
  if (!validCorners(points)) throw new Error('Les coins doivent entourer la carte, sans se croiser.');
  const [a,b,c,d] = points;
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return (u,v) => {
    const w = g * u + h * v + 1;
    return { x: ((b.x-a.x+g*b.x)*u + (d.x-a.x+h*d.x)*v + a.x)/w,
      y: ((b.y-a.y+g*b.y)*u + (d.y-a.y+h*d.y)*v + a.y)/w };
  };
}

export function enhanceColors(data) {
  // Gentle luminance adjustment, applied equally to RGB; preserve logos and hues.
  const histogram = new Uint32Array(256);
  for (let i=0; i<data.length; i+=4) histogram[Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2])]++;
  const count = data.length/4;
  let sum=0, low=0, high=255;
  for (let i=0; i<256; i++) { sum+=histogram[i]; if (sum < count*.005) low=i; if (sum >= count*.995) { high=i; break; } }
  // Never invert a dark card or force it onto a white background.
  const gain = Math.min(1.2, 255/Math.max(1, high-Math.min(low,10)));
  const offset = Math.min(low,10);
  for (let i=0; i<data.length; i+=4) for (let channel=0; channel<3; channel++) data[i+channel] = Math.max(0, Math.min(255, (data[i+channel]-offset)*gain));
  return data;
}

export async function rectifyPhoto(source, points, { enhance = true, ratio = 'auto' } = {}) {
  const map = perspectiveMap(points);
  const image = await loadImage(source);
  const input = document.createElement('canvas'); input.width=image.width; input.height=image.height;
  const context = input.getContext('2d', { willReadFrequently:true }); context.drawImage(image,0,0);
  const sourcePixels = context.getImageData(0,0,input.width,input.height).data;
  const distance = (a,b) => Math.hypot((a.x-b.x)*image.width,(a.y-b.y)*image.height);
  let width = (distance(points[0],points[1])+distance(points[3],points[2]))/2;
  let height = (distance(points[0],points[3])+distance(points[1],points[2]))/2;
  if (ratio !== 'auto') height = width/Number(ratio);
  const scale = Math.min(1, 2200/Math.max(width,height));
  const output = document.createElement('canvas'); output.width=Math.max(2,Math.round(width*scale)); output.height=Math.max(2,Math.round(height*scale));
  const outContext = output.getContext('2d');
  const pixels = outContext.createImageData(output.width, output.height);
  for (let y=0;y<output.height;y++) {
    for (let x=0;x<output.width;x++) {
      const p=map(x/(output.width-1),y/(output.height-1));
      const sx=Math.max(0,Math.min(input.width-1,p.x*(input.width-1))), sy=Math.max(0,Math.min(input.height-1,p.y*(input.height-1)));
      const x0=Math.floor(sx),y0=Math.floor(sy), x1=Math.min(input.width-1,x0+1),y1=Math.min(input.height-1,y0+1), fx=sx-x0,fy=sy-y0;
      const destination=(y*output.width+x)*4;
      for (let c=0;c<3;c++) pixels.data[destination+c]=sourcePixels[(y0*input.width+x0)*4+c]*(1-fx)*(1-fy)+sourcePixels[(y0*input.width+x1)*4+c]*fx*(1-fy)+sourcePixels[(y1*input.width+x0)*4+c]*(1-fx)*fy+sourcePixels[(y1*input.width+x1)*4+c]*fx*fy;
      pixels.data[destination+3]=255;
    }
    // Yield to keep a mobile browser responsive during large rectifications.
    if (y%120===0) await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(enhance) enhanceColors(pixels.data);
  outContext.putImageData(pixels,0,0);
  return output.toDataURL('image/jpeg',.94);
}

export async function detectCorners(source) {
  const image=await loadImage(source);
  const canvas=document.createElement('canvas'); canvas.width=320;canvas.height=Math.max(1,Math.round(320*image.height/image.width));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
  const border=[];
  for(let x=0;x<canvas.width;x+=8) for(const y of [0,canvas.height-1]) border.push((y*canvas.width+x)*4);
  for(let y=0;y<canvas.height;y+=8) for(const x of [0,canvas.width-1]) border.push((y*canvas.width+x)*4);
  const background=[0,1,2].map(c=>border.reduce((sum,i)=>sum+data[i+c],0)/border.length);
  const candidates=[];
  for(let y=1;y<canvas.height-1;y+=2) for(let x=1;x<canvas.width-1;x+=2) {
    const i=(y*canvas.width+x)*4;
    if(Math.hypot(data[i]-background[0],data[i+1]-background[1],data[i+2]-background[2])>65) candidates.push({x:x/(canvas.width-1),y:y/(canvas.height-1)});
  }
  if(!candidates.length) return null;
  const extreme=score=>candidates.reduce((a,b)=>score(a)<score(b)?a:b);
  const corners=[extreme(p=>p.x+p.y),extreme(p=>-p.x+p.y),extreme(p=>-p.x-p.y),extreme(p=>p.x-p.y)];
  const coverage=candidates.length*4/(canvas.width*canvas.height);
  // A proposal only: refuse text-only or nearly full-frame detections.
  return coverage>.22 && coverage<.9 && validCorners(corners)?corners:null;
}
