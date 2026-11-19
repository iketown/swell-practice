#target illustrator
(function(){try {
var d=app.activeDocument,prev=app.coordinateSystem;app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
var a=d.artboards[0].artboardRect,numbers=d.layers.getByName('1 / Circled input numbers'),replaced=d.layers.getByName('Original schematic symbols (archive)');
replaced.visible=true;
function c(hex){var z=new RGBColor();z.red=parseInt(hex.substr(0,2),16);z.green=parseInt(hex.substr(2,2),16);z.blue=parseInt(hex.substr(4,2),16);return z;}
var legend=d.layers.getByName('1 / Stage boundary and orientation').groupItems.getByName('Legend');
for(var j=legend.pathItems.length-1;j>=0;j--){var b=legend.pathItems[j].geometricBounds;if(legend.pathItems[j].width<12 && legend.pathItems[j].height>7 && (b[0]+b[2])/2 <a[0]+486 && (b[1]+b[3])/2 >a[1]-162){legend.pathItems[j].move(replaced,ElementPlacement.PLACEATEND);}}
replaced.visible=false;
function badge(n,x,y,name,r){
 var gr=numbers.groupItems.add();gr.name='Input '+n+' - '+name;
 var e=gr.pathItems.ellipse(a[1]-y+r,a[0]+x-r,r*2,r*2);e.filled=true;e.fillColor=c('FFFFFF');e.stroked=true;e.strokeColor=c('182B35');e.strokeWidth=1.1;
 var t=gr.textFrames.pointText([a[0]+x,a[1]-y]);t.contents=String(n);t.textRange.characterAttributes.textFont=app.textFonts.getByName('Helvetica-Bold');t.textRange.characterAttributes.size=10;t.textRange.characterAttributes.fillColor=c('182B35');
 t.textRange.paragraphAttributes.justification=Justification.CENTER;
 var b=t.geometricBounds;t.translate(a[0]+x-(b[0]+b[2])/2,a[1]-y-(b[1]+b[3])/2);
}
// On the microphone heads, behind the keyboard, and beside each remaining source.
badge(5,334,364,'Cron vocal',8.5);badge(2,487,318,'Jackson vocal',8.5);badge(3,258,321,'Joe vocal',8.5);badge(4,394,263,'Sam vocal',8.5);badge(1,411,357,'Ike vocal',8.5);
badge(6,303,367,'Keyboard rear output',8.5);badge(7,544,322,'Jackson modeler',8.5);badge(8,213,353,'Joe modeler',8.5);badge(9,461,333,'Bass DI',8.5);
badge(13,310,286,'Overhead R',8.5);badge(14,386,294,'Overhead L',8.5);badge(15,327,264,'Snare',8.5);badge(16,351,321,'Kick',8.5);
badge(1,480,153,'Legend example',7);
for(var j=0;j<d.textFrames.length;j++){
 var t=d.textFrames[j];if(t.contents==='DRAFT 01  /  29 SEP 2026'){t.contents='DRAFT 02  /  29 SEP 2026';t.name=t.contents;}
 if(t.contents==='Setup: keyboard stage CENTER R  /  saved revision 49'){t.contents='Setup rev 49 + Brian\'s performer / icon revisions';t.name=t.contents;}
}
d.artboards.setActiveArtboardIndex(0);app.executeMenuCommand('fitin');d.save();app.coordinateSystem=prev;app.redraw();
}catch(e){alert('Stage plot update: '+e+' at line '+e.line);}
})();
