const sharp=require('/Users/brianeichenberger/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const path=require('path');
const base=path.resolve('output/stage-plot/performer-icons/transparent/the-swell-stage-icons-transparent/hybrid');
(async()=>{
let previews=[];
for(const name of ['kemper-profiler-stage-45deg','line6-hx-stomp-xl-45deg']) {
 await sharp(path.join(base,name+'.svg')).png().toFile(path.join(base,name+'-preview.png'));
 previews.push(await sharp(path.join(base,name+'.svg')).resize({width:800}).png().toBuffer());
 console.log(name,await sharp(path.join(base,name+'-preview.png')).metadata());
}
await sharp({create:{width:900,height:780,channels:4,background:'#f7f5f0'}}).composite([{input:previews[0],left:50,top:25},{input:previews[1],left:50,top:460}]).png().toFile(path.join(base,'pedals-45deg-preview.png'));
})();
