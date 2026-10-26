/* Still-image scroll film: canvas Ken Burns + parallax + cross-dissolve, scroll-scrubbed.
   Engine contract per guide: sticky stage, lerped playhead, beat envelopes, adaptive header,
   seam fade, ?jump / window.__ready, reduced-motion, jank meter. */
(function(){
  const cfg = window.FILM; const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const JUMP = new URLSearchParams(location.search).get('jump');
  if (JUMP !== null) history.scrollRestoration = 'manual';
  const drive = document.querySelector('.film'), cv = document.querySelector('.film canvas'), ctx = cv.getContext('2d');
  const beats = [...document.querySelectorAll('.beat')].map(el => ({el, in:+el.dataset.in, peak:+el.dataset.peak, out:+el.dataset.out}));
  const fade = document.querySelector('.film .seam'), header = document.querySelector('.site-header');
  const bitmaps = []; let cur = 0, target = 0, shown = -1;
  function size(){ const d = Math.min(devicePixelRatio||1, 1.5); cv.width = innerWidth*d; cv.height = innerHeight*d; shown=-1; }
  function prog(){ const r = drive.getBoundingClientRect(); return Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - innerHeight))); }
  const ease = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
  function drawShot(i, t, a){
    const s = cfg.shots[i], bm = bitmaps[s.img]; if (!bm) return;
    const mob = innerWidth < 768, k = ease(t);
    const sc = s.from.s + (s.to.s - s.from.s)*k, x = s.from.x + (s.to.x - s.from.x)*k, y = s.from.y + (s.to.y - s.from.y)*k;
    const cw = cv.width, ch = cv.height, base = Math.max(cw/bm.width, ch/bm.height) * sc;
    const w = bm.width*base, h = bm.height*base;
    // focal point (x,y in -1..1) keeps the subject in frame on portrait screens
    const fx = (s.fx||0) * (mob ? 1 : .35);
    const ox = (cw - w)/2 - x*(w-cw)/2 - fx*(w-cw)/2, oy = (ch - h)/2 - y*(h-ch)/2;
    ctx.globalAlpha = a; ctx.drawImage(bm, ox, oy, w, h); ctx.globalAlpha = 1;
  }
  function draw(p){
    const n = cfg.shots.length, pos = p * n, i = Math.min(n-1, Math.floor(pos)), t = Math.min(1, pos - i);
    ctx.fillStyle = cfg.bg || '#000'; ctx.fillRect(0,0,cv.width,cv.height);
    drawShot(i, t, 1);
    const X = cfg.dissolve || .28;  // dissolve window at end of each shot
    if (i < n-1 && t > 1-X) drawShot(i+1, (t-(1-X))*0.0, (t-(1-X))/X);
    beats.forEach(b => { let a=0; if (p>=b.in && p<=b.out){ a = p<b.peak ? (p-b.in)/Math.max(1e-4,b.peak-b.in) : (b.out>1.5?1:1-(p-b.peak)/Math.max(1e-4,b.out-b.peak)); }
      b.el.style.opacity = a.toFixed(3); b.el.style.transform = `translateY(${(1-a)*24}px)`; b.el.style.pointerEvents = a>.5?'auto':'none'; });
    if (fade) fade.style.opacity = Math.max(0, (p-.92)/.08).toFixed(3);
  }
  let lastLum = 0;
  function lum(now){ if (!header || now-lastLum < 180) return; lastLum = now;
    if (drive.getBoundingClientRect().bottom < 80){ header.classList.toggle('on-light', !!cfg.light); return; }
    try{ const d = ctx.getImageData(0,0,cv.width,Math.max(1,cv.height*.08|0)).data; let s=0,c=0; for(let q=0;q<d.length;q+=4*97){ s+=.299*d[q]+.587*d[q+1]+.114*d[q+2]; c++; }
      header.classList.toggle('on-light', s/c > 138); }catch(e){} }
  let lastT = performance.now(), maxD = 0;
  function tick(now){ const dt = now-lastT; lastT = now; if (dt>maxD) maxD = dt;
    target = prog(); cur += (target-cur) * (RM ? 1 : .14);
    if (Math.abs(cur-shown) > 1e-4){ draw(cur); shown = cur; } lum(now);
    requestAnimationFrame(tick); }
  setInterval(()=>{ window.__jankMax = maxD; maxD = 0; }, 2000);
  // reveals below the film (finishing §3)
  const io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} }), {rootMargin:'0px 0px -12% 0px', threshold:.12});
  document.querySelectorAll('.section').forEach(s=>io.observe(s));
  // char-split hero
  document.querySelectorAll('[data-split]').forEach(el=>{ el.innerHTML = el.textContent.split(' ').map(w=>'<span style="display:inline-block;white-space:nowrap">'+w.split('').map(c=>`<span class="ch">${c}</span>`).join('')+'</span>').join(' '); });
  Promise.all(cfg.images.map((src,i)=>fetch(src).then(r=>r.blob()).then(b=>createImageBitmap(b)).then(bm=>bitmaps[i]=bm))).then(()=>{
    size(); addEventListener('resize', size);
    if (!RM && JUMP===null && window.Lenis){ const lenis = new Lenis({lerp:.09, smoothWheel:true});
      (function raf(t){ lenis.raf(t); requestAnimationFrame(raf); })(performance.now()); }
    if (window.gsap && !RM) gsap.from('.ch', {yPercent:120, opacity:0, stagger:.035, duration:1.1, ease:'power4.out'});
    if (JUMP !== null){ scrollTo(0, +JUMP||0); cur = target = prog(); draw(cur); shown = cur;
      document.querySelectorAll('.section').forEach(s=>{ const r=s.getBoundingClientRect(); if (r.top < innerHeight) s.classList.add('in'); }); }
    else { cur = target = prog(); draw(cur); }
    requestAnimationFrame(tick); document.documentElement.classList.add('ready');
    setTimeout(()=>{ window.__ready = true; }, 300);
  });
})();
