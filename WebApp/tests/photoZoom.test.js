import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPhotoZoom, constrainPhoto, fittedPhoto, transformPhoto } from '../src/photoZoom.js';

test('zoom preserves the point under a moving pinch and bounds panning including fitted margins', () => {
  const view = {width:800,height:600}, wide = fittedPhoto(view,{width:2400,height:1200});
  assert.deepEqual(wide,{width:800,height:400});
  const zoom = transformPhoto({scale:1,x:0,y:0},3,{x:100,y:50},{x:150,y:80},view,wide);
  assert.deepEqual(zoom,{scale:3,x:-150,y:-70});
  assert.equal((150-zoom.x)/zoom.scale,100);
  assert.equal((80-zoom.y)/zoom.scale,50);
  assert.deepEqual(constrainPhoto({scale:2,x:999,y:-999},view,wide),{scale:2,x:400,y:-200});
  const portrait=fittedPhoto(view,{width:1200,height:2400});
  assert.deepEqual(constrainPhoto({scale:2,x:999,y:999},view,portrait),{scale:2,x:150,y:300});
  assert.deepEqual(constrainPhoto({scale:.2,x:999,y:-999},view,portrait),{scale:1,x:0,y:0});
  assert.equal(constrainPhoto({scale:100,x:0,y:0},view,wide).scale,8);
});

test('wheel zoom keeps the image point under the cursor even with portrait or landscape margins', () => {
  const view = { width: 800, height: 600 };
  for (const natural of [{ width: 2400, height: 1200 }, { width: 1200, height: 2400 }]) {
    const image = fittedPhoto(view, natural), anchor = { x: image.width * .4, y: image.height * .4 };
    const start = { scale: 1, x: 0, y: 0 };
    const zoom = transformPhoto(start, 1.5, anchor, anchor, view, image);
    assert.equal((anchor.x - zoom.x) / zoom.scale, anchor.x);
    assert.equal((anchor.y - zoom.y) / zoom.scale, anchor.y);
    assert.deepEqual(transformPhoto(zoom, 1, anchor, anchor, view, image), start);
  }
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

test('plain wheel zoom is anchored at the cursor and a primary mouse drag pans the enlarged photo', () => {
  const f = fixture(), e = f.element;
  try {
    assert.equal(e.fire('wheel', { deltaY: -Math.log(2) * 500, deltaMode: 0, clientX: 600, clientY: 400 }).prevented, true);
    assert.deepEqual(f.flush(), { scale: 2, x: -200, y: -100, width: 800, height: 600, dragging: false });
    e.fire('pointerdown', { pointerType: 'mouse', pointerId: 1, clientX: 600, clientY: 400 });
    e.fire('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 650, clientY: 430 });
    assert.equal(f.flush().x, -150); assert.equal(f.flush().y, -70);
    assert.equal(f.flush().scale, 2); assert.equal(f.flush().dragging, true);
    e.fire('pointerup', { pointerType: 'mouse', pointerId: 1 });
    assert.equal(f.flush().dragging, false);
    e.fire('wheel', { deltaY: Math.log(2) * 500, clientX: 650, clientY: 430 });
    assert.deepEqual(f.flush(), { scale: 1, x: 0, y: 0, width: 800, height: 600, dragging: false });
  } finally { f.destroy(); }
});

test('wheel units, limits and face overlays keep zoom usable without capturing form controls', () => {
  const f = fixture(), e = f.element;
  try {
    for (const [deltaMode, factor] of [[0, 1], [1, 16], [2, 600]]) {
      f.controller.reset();
      e.fire('wheel', { deltaY: -Math.log(2) * 500 / factor, deltaMode });
      assert.ok(Math.abs(f.flush().scale - 2) < 1e-10);
    }
    const face = { closest: selector => selector === '.photo-face-box' || selector.includes('button') ? face : null };
    e.fire('wheel', { target: face, deltaY: -10000 }); assert.equal(f.flush().scale, 8);
    e.fire('wheel', { deltaY: NaN }); assert.equal(f.flush().scale, 8);
    e.fire('wheel', { deltaY: Infinity }); assert.equal(f.flush().scale, 8);
    const control = { closest: selector => selector.includes('button') ? control : null };
    assert.equal(e.fire('wheel', { target: control, deltaY: 100 }).prevented, undefined);
    assert.equal(f.flush().scale, 8);
    assert.equal(e.fire('wheel', { deltaY: 10000 }).prevented, true);
    assert.equal(f.flush().scale, 1);
    assert.equal(e.fire('wheel', { deltaY: 100 }).prevented, true);
  } finally { f.destroy(); }
});

test('trackpad pinch and Safari gestures do not zoom twice or scroll the page', () => {
  const f=fixture(), e=f.element;
  try {
    assert.equal(e.fire('wheel',{ctrlKey:true,deltaY:-Math.log(2)*100,deltaMode:0}).prevented,true);
    assert.equal(f.flush().scale,2);
    e.fire('gesturestart');e.fire('gesturechange',{scale:1.5});assert.equal(f.flush().scale,3);
    e.fire('wheel',{ctrlKey:true,deltaY:-100,deltaMode:0});assert.equal(f.flush().scale,3);
    e.fire('gestureend');f.controller.reset();f.flush();
    assert.equal(e.fire('wheel',{deltaX:0,deltaY:30,deltaMode:0}).prevented,true);
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
