import { deflateSync } from 'node:zlib';

const W=1080;
const H=1350;

function crc32(buf){
  let crc=0xffffffff;
  for(const byte of buf){
    crc^=byte;
    for(let k=0;k<8;k++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

function chunk(type,data){
  const t=Buffer.from(type,'ascii');
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([len,t,data,crc]);
}

function setPixel(raw,x,y,r,g,b){
  if(x<0||x>=W||y<0||y>=H) return;
  const i=y*(W*3+1)+1+x*3;
  raw[i]=r; raw[i+1]=g; raw[i+2]=b;
}

function fillRect(raw,x0,y0,x1,y1,color){
  const [r,g,b]=color;
  const xa=Math.max(0,Math.floor(x0)), xb=Math.min(W,Math.ceil(x1));
  const ya=Math.max(0,Math.floor(y0)), yb=Math.min(H,Math.ceil(y1));
  for(let y=ya;y<yb;y++){
    let i=y*(W*3+1)+1+xa*3;
    for(let x=xa;x<xb;x++){
      raw[i++]=r; raw[i++]=g; raw[i++]=b;
    }
  }
}

function fillCircle(raw,cx,cy,radius,color){
  const rr=radius*radius;
  for(let y=Math.max(0,cy-radius);y<Math.min(H,cy+radius);y++){
    const dy=y-cy;
    const dx=Math.floor(Math.sqrt(Math.max(0,rr-dy*dy)));
    fillRect(raw,cx-dx,y,cx+dx+1,y+1,color);
  }
}

function build(kind){
  const raw=Buffer.alloc((W*3+1)*H);
  for(let y=0;y<H;y++){
    raw[y*(W*3+1)]=0;
    const t=y/(H-1);
    const base=[6+Math.round(3*t),11+Math.round(11*t),30+Math.round(18*t)];
    fillRect(raw,0,y,W,y+1,base);
  }

  const navy=[6,11,30], panel=[244,249,255], dark=[18,31,65], blue=[10,92,255], cyan=[0,210,255], pale=[225,240,255], line=[65,90,130], white=[255,255,255];

  // subtle brand rails
  fillRect(raw,0,0,18,H,blue);
  fillRect(raw,W-18,0,W,H,cyan);
  fillRect(raw,75,1180,650,1190,cyan);
  fillRect(raw,75,1225,500,1235,blue);

  // main browser/store panel
  fillRect(raw,100,150,980,930,panel);
  fillRect(raw,100,150,980,245,dark);
  fillCircle(raw,150,197,11,[255,92,92]);
  fillCircle(raw,190,197,11,[255,190,70]);
  fillCircle(raw,230,197,11,[80,220,150]);

  if(kind==='ecommerce'){
    // product cards
    for(let row=0;row<2;row++){
      for(let col=0;col<3;col++){
        const x=145+col*270, y=300+row*300;
        fillRect(raw,x,y,x+215,y+245,pale);
        fillRect(raw,x+32,y+28,x+183,y+155,(row+col)%2===0?blue:cyan);
        fillCircle(raw,x+108,y+92,38,white);
        fillRect(raw,x+30,y+182,x+170,y+196,line);
        fillRect(raw,x+30,y+210,x+125,y+221,[120,150,190]);
      }
    }
    // cart module
    fillRect(raw,650,850,980,1170,dark);
    fillRect(raw,725,940,915,955,cyan);
    fillRect(raw,760,970,900,985,white);
    fillCircle(raw,785,1045,20,white);
    fillCircle(raw,885,1045,20,white);
    fillRect(raw,725,900,755,950,white);
  }else{
    // website hero
    fillRect(raw,155,310,600,470,dark);
    fillRect(raw,665,310,925,470,pale);
    // content cards
    for(let row=0;row<2;row++){
      for(let col=0;col<3;col++){
        const x=150+col*260, y=535+row*205;
        fillRect(raw,x,y,x+205,y+160,pale);
        fillRect(raw,x+22,y+22,x+183,y+78,(row+col)%2===0?blue:cyan);
        fillRect(raw,x+25,y+105,x+170,y+114,line);
        fillRect(raw,x+25,y+128,x+145,y+137,[120,150,190]);
      }
    }
    // mobile responsive panel
    fillRect(raw,730,825,980,1180,panel);
    fillRect(raw,755,885,955,1010,blue);
    fillRect(raw,765,1045,930,1060,line);
    fillRect(raw,765,1085,900,1100,line);
    fillRect(raw,765,1125,920,1140,line);
  }

  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const signature=Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([
    signature,
    chunk('IHDR',ihdr),
    chunk('IDAT',deflateSync(raw,{level:9})),
    chunk('IEND',Buffer.alloc(0))
  ]);
}

export default function handler(req,res){
  const kind=String(req.query?.kind||'web_design').toLowerCase()==='ecommerce'?'ecommerce':'web_design';
  const image=build(kind);
  res.statusCode=200;
  res.setHeader('Content-Type','image/png');
  res.setHeader('Content-Length',String(image.length));
  res.setHeader('Cache-Control','public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.end(image);
}
