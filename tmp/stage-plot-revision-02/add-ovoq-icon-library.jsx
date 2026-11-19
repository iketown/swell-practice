#target illustrator
(function(){
try{
var target=null;
var expected='/Users/brianeichenberger/projects/the_swell/stage/stage plot input list etc/the-swell-stage-plot-draft-01.ai';
for(var d=0;d<app.documents.length;d++)if(app.documents[d].fullName.fsName===expected)target=app.documents[d];
if(!target)throw Error('Master not open');target.activate();
var base='/Users/brianeichenberger/projects/the_swell/stage/stage plot input list etc/icons';
var mf=File(base+'/icon-manifest.json');mf.open('r');var assets=eval('('+mf.read()+')');mf.close();
for(var i=0;i<assets.length;i++)if(!File(assets[i].svg).exists||!File(assets[i].png).exists)throw Error('Missing icon '+assets[i].title);
for(var z=target.layers.length-1;z>=0;z--)if(target.layers[z].name==='OVOQ style / editable icon library'){var oldLayer=target.layers[z];for(var empty=oldLayer.groupItems.length-1;empty>=0;empty--)if(oldLayer.groupItems[empty].pageItems.length===0)oldLayer.groupItems[empty].remove();if(target.layers[z].pageItems.length===0)target.layers[z].remove();else throw Error('Library already has artwork');}
for(var opened=app.documents.length-1;opened>=0;opened--)if(app.documents[opened].fullName.fsName===assets[0].svg)app.documents[opened].close(SaveOptions.DONOTSAVECHANGES);target.activate();
target.save();
var backup=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/ovoq-icons/before-icon-library-'+new Date().getTime()+'.ai');
if(!target.fullName.copy(backup))throw Error('Backup failed');
var layer=target.layers.add();layer.name='OVOQ style / editable icon library';
var ab=target.artboards[0].artboardRect,avail=ab[2]-ab[0]-64,total=0,slots=[];
for(var s=0;s<assets.length;s++){slots[s]=Math.max(assets[s].widthPt+14,56);total+=slots[s];}
var extra=(avail-total)/assets.length;
if(extra<0)throw Error('Library does not fit the row');
var x=ab[0]+32,cy=ab[3]+54,report=[];
function inkTextBounds(t){var c=t.duplicate(),o=c.createOutline(),b=o.visibleBounds,r=[b[0],b[1],b[2],b[3]];o.remove();return r;}
for(var n=0;n<assets.length;n++){
 var a=assets[n];target.activate();var src=app.open(File(a.svg));
 var tops=[];for(var q=0;q<src.pageItems.length;q++)if(src.pageItems[q].parent.typename==='Layer')tops.push(src.pageItems[q]);
 if(tops.length===0)throw Error('No SVG artwork: '+a.title);
 src.selection=tops;app.copy();target.activate();target.activeLayer=layer;app.paste();var pasted=target.selection;
 if(!pasted||pasted.length===0)throw Error('SVG paste failed: '+a.title);
 var copies=[];for(var u=0;u<pasted.length;u++)copies.push(pasted[u]);var group=layer.groupItems.add();group.name=a.file+' / editable icon';
 for(var v=0;v<copies.length;v++)copies[v].move(group,ElementPlacement.PLACEATEND);target.selection=null;
 src.close(SaveOptions.DONOTSAVECHANGES);target.activate();
 var b=group.visibleBounds,height=b[1]-b[3],factor=a.heightPt/height*100;
 group.resize(factor,factor,true,true,true,true,factor,Transformation.CENTER);
 var width=slots[n]+extra,cx=x+width/2;
 b=group.visibleBounds;group.translate(cx-(b[0]+b[2])/2,cy-(b[1]+b[3])/2);
 var iconBounds=group.visibleBounds;
 var caption=group.textFrames.add();caption.name='Editable library caption';caption.contents=a.title;
 caption.textRange.characterAttributes.textFont=app.textFonts.getByName('ArialMT');caption.textRange.characterAttributes.size=7.3;
 var black=new RGBColor();black.red=black.green=black.blue=0;caption.textRange.characterAttributes.fillColor=black;
 caption.position=[cx,ab[3]+13];var tb=inkTextBounds(caption);caption.translate(cx-(tb[0]+tb[2])/2,ab[3]+7-tb[3]);
 group.note='Reusable equipment icon. Transparent PNG: '+a.png+'. Raster file and editable vector artwork have the same drawing. IEM 1 is a placeholder; edit the text to assign a mix.';
 report.push(a.title+' | icon bounds '+iconBounds.join(',')+' | paths '+group.pathItems.length+' | live text '+group.textFrames.length);
 x+=width;
}
target.selection=null;target.artboards.setActiveArtboardIndex(0);app.redraw();target.save();
var f=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/ovoq-icons/placement-result.txt');f.open('w');f.write('Master: '+target.fullName.fsName+'\nLayer: '+layer.name+'\nArtboard: '+ab.join(',')+'\n'+report.join('\n'));f.close();
}catch(e){var err=File('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts/tmp/ovoq-icons/placement-error.txt');err.open('w');err.write(e.toString()+'\nline '+e.line);err.close();throw e;}
})();
