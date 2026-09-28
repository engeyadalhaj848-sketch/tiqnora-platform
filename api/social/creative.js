import { deflateSync } from 'node:zlib';

const W=1080,H=1350;
const PALETTE={
  navy:[6,11,30,255],
  navy2:[10,23,64,255],
  blue:[10,92,255,255],
  cyan:[0,210,255,255],
  white:[255,255,255,255],
  soft:[166,190,225,255],
  panel:[15,35,78,255],
  panel2:[22,49,98,255]
};

function crc32(buf){
  let c=0xffffffff;
  for(const b of buf){
    c^=b;
    for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
}
function chunk(type,data){
  const t=Buffer.from(type);
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([len,t,data,crc]);
}
function png(width,height,rgba){
  const rows=[];
  const stride=width*4;
  for(let y=0;y<height;y++){
    rows.push(Buffer.from([0]));
    rows.push(rgba.subarray(y*stride,(y+1)*stride));
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),
    chunk('IDAT',deflateSync(Buffer.concat(rows),{level:7})),
    chunk('IEND',Buffer.alloc(0))
  ]);
}
function makeCanvas(){
  const b=Buffer.alloc(W*H*4);
  for(let y=0;y<H;y++){
    const t=y/(H-1);
    const a=PALETTE.navy,bg=PALETTE.navy2;
    const r=Math.round(a[0]*(1-t)+bg[0]*t);
    const g=Math.round(a[1]*(1-t)+bg[1]*t);
    const bl=Math.round(a[2]*(1-t)+bg[2]*t);
    for(let x=0;x<W;x++){
      const i=(y*W+x)*4;
      b[i]=r;b[i+1]=g;b[i+2]=bl;b[i+3]=255;
    }
  }
  return b;
}
function px(buf,x,y,c){
  if(x<0||x>=W||y<0||y>=H)return;
  const i=(Math.floor(y)*W+Math.floor(x))*4;
  buf[i]=c[0];buf[i+1]=c[1];buf[i+2]=c[2];buf[i+3]=c[3]??255;
}
function rect(buf,x,y,w,h,c){
  x=Math.max(0,Math.floor(x)); y=Math.max(0,Math.floor(y));
  const x2=Math.min(W,Math.floor(x+w)),y2=Math.min(H,Math.floor(y+h));
  for(let yy=y;yy<y2;yy++){
    let i=(yy*W+x)*4;
    for(let xx=x;xx<x2;xx++,i+=4){
      buf[i]=c[0];buf[i+1]=c[1];buf[i+2]=c[2];buf[i+3]=c[3]??255;
    }
  }
}
function circle(buf,cx,cy,r,c){
  const r2=r*r;
  for(let y=Math.max(0,cy-r);y<Math.min(H,cy+r);y++){
    for(let x=Math.max(0,cx-r);x<Math.min(W,cx+r);x++){
      const dx=x-cx,dy=y-cy;
      if(dx*dx+dy*dy<=r2)px(buf,x,y,c);
    }
  }
}
function line(buf,x0,y0,x1,y1,width,c){
  const dx=x1-x0,dy=y1-y0,steps=Math.max(Math.abs(dx),Math.abs(dy));
  for(let s=0;s<=steps;s++){
    const t=steps? s/steps:0;
    const x=Math.round(x0+dx*t),y=Math.round(y0+dy*t);
    rect(buf,x-Math.floor(width/2),y-Math.floor(width/2),width,width,c);
  }
}
function frame(buf){
  // top brand marker
  circle(buf,935,105,34,PALETTE.cyan);
  circle(buf,935,105,16,PALETTE.navy);
  rect(buf,80,85,300,18,PALETTE.white);
  rect(buf,80,120,210,10,PALETTE.soft);
  // accent rails
  rect(buf,70,1230,260,8,PALETTE.blue);
  rect(buf,330,1230,120,8,PALETTE.cyan);
}
function drawWebsite(buf){
  rect(buf,100,280,880,650,PALETTE.panel);
  rect(buf,100,280,880,80,PALETTE.panel2);
  circle(buf,145,320,10,PALETTE.soft);circle(buf,180,320,10,PALETTE.soft);circle(buf,215,320,10,PALETTE.soft);
  rect(buf,300,305,500,28,PALETTE.blue);
  rect(buf,155,430,445,310,PALETTE.navy2);
  rect(buf,190,485,330,58,PALETTE.blue);
  rect(buf,190,590,350,22,PALETTE.soft);
  rect(buf,190,635,290,22,PALETTE.soft);
  rect(buf,190,700,160,55,PALETTE.cyan);
  rect(buf,640,430,270,140,PALETTE.panel2);
  rect(buf,680,470,190,44,PALETTE.white);
  rect(buf,680,535,130,15,PALETTE.soft);
  rect(buf,640,610,270,140,PALETTE.panel2);
  rect(buf,680,650,190,44,PALETTE.white);
  rect(buf,680,715,130,15,PALETTE.soft);
  rect(buf,160,1015,610,34,PALETTE.white);
  rect(buf,160,1072,460,18,PALETTE.soft);
  rect(buf,760,1040,190,72,PALETTE.blue);
}
function drawEcommerce(buf){
  rect(buf,100,270,880,670,PALETTE.panel);
  rect(buf,100,270,880,75,PALETTE.panel2);
  rect(buf,160,410,240,300,PALETTE.panel2);
  rect(buf,420,410,240,300,PALETTE.panel2);
  rect(buf,680,410,240,300,PALETTE.panel2);
  for(const x of [190,450,710]){
    rect(buf,x,445,180,145,PALETTE.navy2);
    circle(buf,x+90,515,54,PALETTE.cyan);
    rect(buf,x,620,150,18,PALETTE.white);
    rect(buf,x,655,100,14,PALETTE.soft);
  }
  // shopping cart
  line(buf,310,820,660,820,18,PALETTE.blue);
  line(buf,340,820,390,905,18,PALETTE.blue);
  line(buf,390,905,720,905,18,PALETTE.blue);
  line(buf,720,905,770,790,18,PALETTE.blue);
  circle(buf,440,950,24,PALETTE.cyan); circle(buf,680,950,24,PALETTE.cyan);
  rect(buf,155,1050,690,34,PALETTE.white);
  rect(buf,155,1107,520,18,PALETTE.soft);
}
function drawAutomation(buf){
  const nodes=[[210,490],[540,370],[850,510],[345,790],[700,835]];
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    if((i+j)%2===0) line(buf,nodes[i][0],nodes[i][1],nodes[j][0],nodes[j][1],7,PALETTE.blue);
  }
  nodes.forEach((n,i)=>{circle(buf,n[0],n[1],72,i%2?PALETTE.blue:PALETTE.cyan);circle(buf,n[0],n[1],34,PALETTE.navy);});
  rect(buf,155,1050,650,34,PALETTE.white); rect(buf,155,1107,470,18,PALETTE.soft);
}
function drawChat(buf){
  rect(buf,145,350,680,245,PALETTE.panel2); circle(buf,210,425,34,PALETTE.cyan);
  rect(buf,275,405,460,24,PALETTE.white); rect(buf,275,455,330,17,PALETTE.soft);
  rect(buf,255,655,680,245,PALETTE.panel); circle(buf,870,730,34,PALETTE.blue);
  rect(buf,340,710,440,24,PALETTE.white); rect(buf,450,760,330,17,PALETTE.soft);
  rect(buf,155,1050,640,34,PALETTE.white); rect(buf,155,1107,500,18,PALETTE.soft);
}
function drawSeo(buf){
  circle(buf,460,585,190,PALETTE.panel2); circle(buf,460,585,145,PALETTE.navy);
  line(buf,585,710,790,915,34,PALETTE.cyan);
  line(buf,210,900,360,760,18,PALETTE.blue);
  line(buf,360,760,520,820,18,PALETTE.blue);
  line(buf,520,820,680,640,18,PALETTE.blue);
  circle(buf,210,900,18,PALETTE.white);circle(buf,360,760,18,PALETTE.white);circle(buf,520,820,18,PALETTE.white);circle(buf,680,640,18,PALETTE.white);
  rect(buf,150,1040,650,34,PALETTE.white);rect(buf,150,1097,470,18,PALETTE.soft);
}
function drawTech(buf){
  rect(buf,170,360,740,500,PALETTE.panel);
  rect(buf,215,410,650,360,PALETTE.navy2);
  for(let y=450;y<=670;y+=110) for(let x=260;x<=700;x+=170) rect(buf,x,y,110,70,(x+y)%3?PALETTE.blue:PALETTE.cyan);
  rect(buf,400,890,280,35,PALETTE.soft);rect(buf,310,925,460,35,PALETTE.panel2);
  rect(buf,155,1050,650,34,PALETTE.white);rect(buf,155,1107,470,18,PALETTE.soft);
}
function draw(buf,type){
  frame(buf);
  if(type==='web_design') return drawWebsite(buf);
  if(type==='ecommerce') return drawEcommerce(buf);
  if(type==='automation') return drawAutomation(buf);
  if(type==='ai_chatbot') return drawChat(buf);
  if(type==='seo') return drawSeo(buf);
  return drawTech(buf);
}

export default function handler(req,res){
  const type=String(req.query?.type||'web_design').toLowerCase();
  const allowed=new Set(['web_design','ecommerce','automation','ai_chatbot','seo','business_tech','brand']);
  const safe=allowed.has(type)?type:'web_design';
  const buf=makeCanvas();
  draw(buf,safe==='brand'?'web_design':safe);
  const out=png(W,H,buf);
  res.statusCode=200;
  res.setHeader('Content-Type','image/png');
  res.setHeader('Cache-Control','public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Content-Length',String(out.length));
  res.end(out);
}
