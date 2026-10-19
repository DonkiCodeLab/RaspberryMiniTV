import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPhotoZoom, constrainPhoto, fittedPhoto, transformPhoto } from '../src/photoZoom.js';

test('zoom preserves the point under a moving pinch and clamps to actual portrait/landscape edges', () => {
  const view = {width:800,height:600}, wide = fittedPhoto(view,{width:2400,height:1200});
  assert.deepEqual(wide,{width:800,height:400});
  const zoom = transformPhoto({scale:1,x:0,y:0},3,{x:100,y:50},{x:150,y:80},view,wide);
  assert.deepEqual(zoom,{scale:3,x:-150,y:-70});
  assert.equal((150-zoom.x)/zoom.scale,100);
  assert.equal((80-zoom.y)/zoom.scale,50);
  assert.deepEqual(constrainPhoto({scale:2,x:999,y:-999},view,wide),{scale:2,x:400,y:-100});
  const portrait=fittedPhoto(view,{width:1200,height:2400});
  assert.deepEqual(constrainPhoto({scale:2,x:999,y:999},view,portrait),{scale:2,x:0,y:300});
  assert.deepEqual(constrainPhoto({scale:.2,x:999,y:-999},view,portrait),{scale:1,x:0,y:0});
  assert.equal(constrainPhoto({scale:100,x:0,y:0},view,wide).scale,8);
});

function fixture() {
  const frames=new Map(); let id=0, latest, observer;
  const originals={requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame,ResizeObserver:globalThis.ResizeObserver};
  globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.ResizeObserver=class {constructor(fn){observer=fn;} observe(){} disconnect(){observer=null;}};
  const element={clientWidth:800,clientHeight:600,clientLeft:0,clientTop:0,listeners:new Map(),captures:new Set(),
    getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}), focus(){},
    setPointerCapture(id){this.captures.add(id);},hasPointerCapture(id){return this.captures.has(id);},releasePointerCapture(id){this.captures.delete(id);},
    addEventListener(type,fn){this.listeners.set(type,fn);},removeEventListener(type){this.listeners.delete(type);},
    fire(type,fields={}){const event={type,target:this,cancelable:true,button:0,pointerType:'touch',clientX:400,clientY:300,
      preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...fields};this.listeners.get(type)?.(event);return event;}};
  const controller=attachPhotoZoom(element,state=>latest=state); controller.setImageSize(2400,1800);
  const flush=()=>{for(const [key,fn] of frames){frames.delete(key);fn();} return latest;};flush();
  return {element,controller,flush,resize:()=>observer(),destroy(){controller.destroy();Object.assign(globalThis,originals);assert.equal(element.listeners.size,0);assert.equal(frames.size,0);assert.equal(element.captures.size,0);}};
}

test('two touch pointers pinch, pan, transition to one finger and cancel without a jump', () => {
  const f=fixture(), e=f.element;
  try {
    e.fire('pointerdown',{pointerId:1,clientX:300});e.fire('pointerdown',{pointerId:2,clientX:500});
    e.fire('pointermove',{pointerId:2,clientX:700});
    assert.deepEqual(f.flush(),{scale:2,x:100,y:0,width:800,height:600,dragging:true});
    f.controller.setImageSize(1200,900); // The preview arrives during the gesture.
    e.fire('pointerup',{pointerId:2,clientX:700});e.fire('pointermove',{pointerId:1,clientX:320,clientY:340});
    assert.equal(f.flush().x,120);assert.equal(f.flush().y,40);
    e.fire('pointercancel',{pointerId:1});assert.equal(f.flush().dragging,false);
    e.fire('pointermove',{pointerId:1,clientX:700});assert.equal(f.flush().x,120);
    e.fire('pointerdown',{pointerId:3,clientX:500});e.fire('pointermove',{pointerId:3,clientX:510});assert.equal(f.flush().x,130);
    f.controller.reset();assert.equal(f.flush().scale,1);
  } finally {f.destroy();}
});

test('trackpad pinch, two-finger scroll and Safari gestures do not zoom twice or scroll the page', () => {
  const f=fixture(), e=f.element;
  try {
    assert.equal(e.fire('wheel',{ctrlKey:true,deltaY:-Math.log(2)*100,deltaMode:0}).prevented,true);
    assert.equal(f.flush().scale,2);
    assert.equal(e.fire('wheel',{deltaX:35,deltaY:-45,deltaMode:0}).prevented,true);
    assert.equal(f.flush().x,-35);assert.equal(f.flush().y,45);
    e.fire('gesturestart');e.fire('gesturechange',{scale:1.5});assert.equal(f.flush().scale,3);
    e.fire('wheel',{ctrlKey:true,deltaY:-100,deltaMode:0});assert.equal(f.flush().scale,3);
    e.fire('gestureend');f.controller.reset();f.flush();
    assert.equal(e.fire('wheel',{deltaX:0,deltaY:30,deltaMode:0}).prevented,undefined);
  } finally {f.destroy();}
});

test('double tap/click and keyboard reset, while arrows pan only when zoomed', () => {
  const f=fixture(),e=f.element;
  try {
    for(let id=1;id<=2;id++){e.fire('pointerdown',{pointerId:id});e.fire('pointerup',{pointerId:id});}
    assert.equal(f.flush().scale,3);
    e.fire('dblclick');assert.equal(f.flush().scale,3); // Ignore the synthesized mouse double click.
    const arrow=e.fire('keydown',{key:'ArrowRight'});assert.equal(arrow.stopped,true);assert.equal(f.flush().x,-60);
    e.fire('keydown',{key:'0'});assert.equal(f.flush().scale,1);
    assert.equal(e.fire('keydown',{key:'ArrowRight'}).stopped,undefined);
    e.fire('keydown',{key:'+'});assert.equal(f.flush().scale,1.5);
    e.clientWidth=400;e.clientHeight=700;f.resize();assert.equal(f.flush().width,400);
    assert.ok(Math.abs(f.flush().x)<=100);
  } finally {f.destroy();}
});
