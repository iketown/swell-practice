const fs=require('fs');
const path=require('path');
const sharp=require('/Users/brianeichenberger/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const out='/Users/brianeichenberger/projects/the_swell/stage/stage plot input list etc/icons';
fs.mkdirSync(path.join(out,'editable-svg'),{recursive:true});
const S='stroke="#171717" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
const line=(x1,y1,x2,y2,w=2.6,c='#171717')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const rect=(x,y,w,h,fill='#eee',rx=0,stroke=true)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${stroke?S:''}/>`;
const ellipse=(x,y,rx,ry,fill='#ddd',stroke=true)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${stroke?S:''}/>`;
const poly=(points,fill='#ddd')=>`<polygon points="${points}" fill="${fill}" ${S}/>`;
const p=(d,fill='#ddd',stroke=true)=>`<path d="${d}" fill="${fill}" ${stroke?S:''}/>`;
const text=(x,y,value,size=13,fill='#111')=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${size}" fill="${fill}">${value}</text>`;
let assets=[];
function asset(file,title,w,h,height,body){assets.push({file,title,w,h,height,body});}
function stand(){return ellipse(48,115,32,8,'#d4d4d4')+line(48,70,48,114,5,'#555')+line(48,106,21,118,5,'#555')+line(48,106,76,118,5,'#555')+line(48,106,48,125,5,'#555')+p('M 25 104 Q 27 90 36 90 M 62 90 Q 73 90 73 104','none')+ellipse(24,105,5,3,'#444')+ellipse(72,105,5,3,'#444');}
let tele=stand();
tele+=p('M 40 55 C 24 50 19 59 24 73 C 25 80 16 83 19 96 C 21 108 32 112 46 112 C 60 112 73 108 76 98 C 79 89 74 80 69 77 C 65 73 68 65 63 62 C 57 58 58 69 54 70 L 54 56 Z','#d0d0d0');
tele+=p('M 42 66 C 36 64 32 59 28 61 C 24 66 31 73 27 80 C 24 87 29 94 40 94 L 57 93 C 65 90 66 84 60 79 L 54 68 Z','#252525');
tele+=p('M 42 65 L 40 23 L 47 21 L 54 63 Z','#b8b8b8');
tele+=p('M 40 24 L 36 10 Q 37 3 44 4 L 52 9 L 49 24 Z','#c4c4c4');
for(let i=0;i<6;i++)tele+=ellipse(35.2+i*.7,8+i*2.4,3,1.8,'#777',false);
for(let y of [30,39,48,57])tele+=line(42,y,50,y,1.5,'#666');
tele+=rect(36,91,22,9,'#eee',1)+rect(39,73,14,5,'#ddd',1)+poly('59,88 65,85 68,98 62,101','#a5a5a5')+ellipse(64,90,2,2,'#222',false)+ellipse(66,97,2,2,'#222',false);
asset('01-telecaster-on-stand','Telecaster',96,132,44,tele);
let bass=stand();
bass+=p('M 41 63 C 34 69 33 49 26 50 C 18 57 26 70 22 81 C 14 95 22 108 34 111 C 46 115 65 111 70 103 C 77 93 69 85 68 77 C 65 66 68 54 62 55 C 55 59 54 66 54 70 L 53 63 Z','#b5b5b5');
bass+=p('M 43 71 C 36 78 32 62 29 66 C 27 72 29 82 25 88 C 22 96 29 104 42 105 C 55 107 66 101 64 91 L 55 78 Z','#f5f5f5');
bass+=p('M 42 75 L 40 20 L 48 18 L 54 74 Z','#ccc');
bass+=p('M 40 22 L 37 10 Q 38 3 44 4 L 55 10 Q 59 15 52 17 L 48 23 Z','#bbb');
for(let i=0;i<4;i++)bass+=ellipse(35,8+i*4,3.6,2.1,'#777',false);
for(let y of [29,41,53,65])bass+=line(42,y,51,y,1.5,'#777');
bass+=rect(34,89,25,5,'#333',1)+rect(38,102,20,7,'#aaa',1)+ellipse(62,91,2.8,2.8,'#333',false)+ellipse(63,100,2.8,2.8,'#333',false);
asset('02-mustang-bass-on-stand','Mustang bass',96,132,46,bass);
let keys=line(34,33,42,60,5,'#555')+line(126,33,120,60,5,'#555')+line(34,60,60,60,4,'#555')+line(110,60,132,60,4,'#555');
keys+=poly('8,8 153,8 161,43 2,43','#888')+poly('2,43 161,43 158,50 5,50','#4a4a4a');
keys+=rect(18,12,43,8,'#333',1)+rect(68,12,24,8,'#eee',0);
for(let x of [100,110,120,130,140])keys+=ellipse(x,16,2.4,2.4,'#222',false);
keys+=rect(14,24,137,17,'#fff',0);
for(let i=1;i<28;i++)keys+=line(14+i*4.9,24,14+i*4.9,41,1,'#555');
for(let i=0;i<28;i++)if(![2,6].includes(i%7))keys+=rect(17+i*4.9,24,2.8,10,'#1c1c1c',0,false);
keys+=text(82,19,'NORD',6.7,'#fff');
asset('03-nord-stage-piano-on-stand','Nord + stand',166,66,24,keys);
let boom=line(40,78,15,92,4.2)+line(40,78,64,94,4.2)+line(40,78,42,106,4.2)+line(40,78,43,50,4.2,'#666');
boom+=line(30,62,95,16,4.2)+ellipse(43,53,5,4,'#555')+p('M 32 63 L 26 67','none');
boom+=`<g transform="rotate(-35 94 19)">${rect(88,17,16,7,'#444',2)+ellipse(106,20.5,5,4.8,'#aaa')}</g>`;
asset('04-boom-mic-stand','Boom mic',116,112,42,boom);
function socket(x,y){return ellipse(x,y,9,10,'#f8f8f8',false)+line(x-3,y-4,x-3,y+1,1.8)+line(x+3,y-5,x+3,y+1,1.8)+p(`M ${x-2} ${y+6} L ${x-2} ${y+4} Q ${x} ${y+2} ${x+2} ${y+4} L ${x+2} ${y+6} Z`,'#171717',false);}
let four=rect(6,3,49,53,'#777',3)+socket(20,17)+socket(41,17)+socket(20,41)+socket(41,41)+text(30.5,73,'120V',14);
asset('05-120v-power-four-outlets','120V / 4 outlets',61,78,27,four);
let two=rect(15,3,27,53,'#777',3)+socket(28.5,17)+socket(28.5,41)+text(28.5,73,'120V',14);
asset('06-120v-power-two-outlets','120V / 2 outlets',57,78,27,two);
let riser=poly('5,8 149,8 158,104 0,104','#f3f3f3')+poly('0,104 158,104 155,113 3,113','#777');
riser+=line(53,8,52,103,1,'#aaa')+line(101,8,105,103,1,'#aaa')+line(2.5,56,153.5,56,1,'#aaa');
riser+=text(79,62,'12′ × 8′',15)+text(79,82,'24″ HIGH',11);
asset('07-drum-riser-12x8x24','Drum riser',164,118,72,riser);
let tuner=poly('11,4 47,4 52,73 6,73','#ddd')+poly('6,73 52,73 48,80 10,80','#777')+rect(16,11,26,13,'#333',1);
tuner+=line(21,18,35,18,1.7,'#ddd')+line(29,14,29,21,1.7,'#eee')+ellipse(20,31,3,3,'#555',false)+ellipse(38,31,3,3,'#555',false)+rect(15,43,29,25,'#555',2)+line(19,49,40,49,1.6,'#aaa')+line(19,55,40,55,1.6,'#aaa')+text(29,40,'TUNER',7.6);
asset('08-tuner-pedal','Tuner',58,84,24,tuner);
let di=poly('12,7 59,7 65,43 5,43','#333')+poly('5,43 65,43 61,53 9,53','#666')+ellipse(20,14,4,3,'#eee',false)+ellipse(52,14,4,3,'#eee',false)+text(35,37,'DI',20,'#fff')+ellipse(21,48,4,2,'#222',false)+ellipse(51,48,4,2,'#222',false);
asset('09-mono-di','Mono DI',70,59,21,di);
let iem=p('M 26 17 Q 22 5 29 3','none')+p('M 55 31 Q 81 11 85 29 Q 89 39 80 49','none');
iem+=rect(16,18,40,55,'#bcbcbc',5)+rect(22,24,16,9,'#444',1)+ellipse(46,28,3,3,'#333',false)+rect(29,69,14,9,'#777',2)+ellipse(80,51,4,5,'#555');
iem+=ellipse(36,50,16,16,'#fff')+text(36,57,'1',21);
asset('10-iem-receiver-numbered','IEM receiver',93,85,29,iem);
let aud=ellipse(32,73,25,15,'#555')+line(32,73,33,45,4,'#aaa')+line(33,45,43,23,3.4)+ellipse(33,45,4,3,'#333');
aud+=`<g transform="rotate(24 43 21)">${rect(39,15,7,18,'#444',2)+ellipse(42.5,12,4.5,6,'#aaa')}</g>`;
asset('11-short-audience-mic','Audience mic',65,95,28,aud);
(async()=>{
 const manifest=[];
 for(const a of assets){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${a.w}" height="${a.h}" viewBox="0 0 ${a.w} ${a.h}"><title>${a.title}</title><g id="${a.file}" aria-label="${a.title}">${a.body}</g></svg>`;
 fs.writeFileSync(path.join(out,'editable-svg',a.file+'.svg'),svg);
 await sharp(Buffer.from(svg),{density:600}).png().toFile(path.join(out,a.file+'.png'));
 manifest.push({file:a.file,title:a.title,heightPt:a.height,widthPt:a.w/a.h*a.height,svg:path.join(out,'editable-svg',a.file+'.svg'),png:path.join(out,a.file+'.png')});
 }
 fs.writeFileSync(path.join(out,'icon-manifest.json'),JSON.stringify(manifest,null,2));
 const cell=310,cols=6,rows=2;
 const preview=[];
 for(let i=0;i<assets.length;i++){
 const a=assets[i],iconHeight=a.height*3,iconWidth=a.w/a.h*iconHeight;
 let buf=await sharp(path.join(out,a.file+'.png')).resize({height:Math.round(iconHeight)}).toBuffer();
 preview.push({input:buf,left:Math.round(i%cols*cell+(cell-iconWidth)/2),top:Math.round(Math.floor(i/cols)*290+20+(220-iconHeight)/2)});
 const label=`<svg width="310" height="45"><text x="155" y="20" text-anchor="middle" font-family="Arial" font-size="14" fill="#222">${a.title}</text><text x="155" y="38" text-anchor="middle" font-family="Arial" font-size="11" fill="#555">${a.height} pt high at print size</text></svg>`;
 preview.push({input:Buffer.from(label),left:i%cols*cell,top:Math.floor(i/cols)*290+245});
 }
 await sharp({create:{width:1860,height:580,channels:4,background:'#ffffff'}}).composite(preview).png().toFile('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/ovoq-icons/preview.png');
 console.log(JSON.stringify(manifest.map(a=>({name:a.title,printSize:[a.widthPt,a.heightPt]}))));
})();
