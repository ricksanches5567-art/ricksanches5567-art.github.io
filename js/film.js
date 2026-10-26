/* Lane B scrub engine (guide engine.md §Scrub-engine): canvas + pre-extracted JPEG frames from the
   chained generated film. ImageBitmap sliding window, lerped playhead, concurrency-capped pump,
   nearestFrame fallback, fit-not-blind-cover, DPR cap 1.0, adaptive header, beats, seam handoff,
   ?jump / window.__ready dev contract, reduced-motion poster fallback, rAF jank meter. */
(function(){
  const cfg = window.FILM, N = cfg.frames, RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const JUMP = new URLSearchParams(location.search).get('jump');
  if (JUMP !== null) history.scrollRestoration = 'manual';
  const drive = document.querySelector('.film'), cv = document.querySelector('.film canvas'), ctx = cv.getContext('2d');
  const beats = [...document.querySelectorAll('.beat')].map(el => ({el, in:+el.dataset.in, peak:+el.dataset.peak, out:+el.dataset.out}));
  const fade = document.querySelector('.film .seam'), header = document.querySelector('.site-header'), bar = document.querySelector('.loadbar i');
  const src = i => `frames/f_${String(i+1).padStart(4,'0')}.jpg`;
  const images = new Array(N), bitmaps = new Map(), decoding = new Set();
  const AHEAD = 48, KEEP = 32; let bmpCenter = -999, cur = 0, target = 0, displayed = -1, loaded = 0;
  function size(){ cv.width = innerWidth; cv.height = innerHeight; displayed = -1; }   // DPR capped at 1.0
  function prog(){ const r = drive.getBoundingClientRect(); return Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - innerHeight))); }
  const MAX_CROP = 0.22;
  function fit(bm){ const cw=cv.width, ch=cv.height, bw=bm.width||bm.naturalWidth, bh=bm.height||bm.naturalHeight;
    const sC = Math.max(cw/bw, ch/bh), crop = 1 - Math.min(cw/(bw*sC), ch/(bh*sC));
    const s = crop > MAX_CROP ? Math.min(cw/bw, ch/bh) : sC, w = bw*s, h = bh*s;
    ctx.fillStyle = cfg.seam; ctx.fillRect(0,0,cw,ch); ctx.drawImage(bm, (cw-w)/2, (ch-h)/2, w, h); }
  let posterBm = null;
  // nearest DECODED bitmap only — drawing an HTMLImageElement forces a synchronous decode (the jank spike)
  function nearest(i){ for (let d=0; d<N; d++){ for (const j of [i-d, i+d]) if (j>=0 && j<N && bitmaps.has(j)) return bitmaps.get(j); } return posterBm; }
  let shownBm = null;
  function drawFrame(i, force){ if (i === displayed && !force) return; const bm = nearest(i); if (!bm) return; if (bm !== shownBm || force){ fit(bm); shownBm = bm; } displayed = bitmaps.has(i) ? i : -1; }
  function ensureBitmaps(c){ if (Math.abs(c - bmpCenter) < 3) return; bmpCenter = c;
    const lo = Math.max(0, c-KEEP), hi = Math.min(N-1, c+AHEAD);
    for (let i=lo; i<=hi; i++){ const im = images[i]; if (bitmaps.has(i) || decoding.has(i) || !im || !im.complete || !im.naturalWidth) continue;
      decoding.add(i); createImageBitmap(im).then(b => { decoding.delete(i);
        if (i < bmpCenter-KEEP || i > bmpCenter+AHEAD){ b.close(); return; } bitmaps.set(i, b); if (i === displayed) drawFrame(i, true); }).catch(()=>decoding.delete(i)); }
    for (const k of Array.from(bitmaps.keys())) if (k < c-KEEP || k > c+AHEAD){ bitmaps.get(k).close(); bitmaps.delete(k); } }
  // concurrency-capped pump; opening run first, then stream the rest
  let next = 0, inflight = 0; const order = [...Array(N).keys()];
  function pump(){ while (inflight < 10 && next < N){ const i = order[next++]; inflight++; const im = new Image(); im.decoding = 'async';
      im.onload = im.onerror = () => { inflight--; loaded++; if (bar) bar.style.transform = `scaleX(${loaded/N})`; if (loaded===N) document.documentElement.classList.add('loaded'); bmpCenter = -999; pump(); };
      im.src = src(i); images[i] = im; } }
  function setBeats(p){ beats.forEach(b => { let a=0; if (p>=b.in && p<=b.out){ a = p<b.peak ? (p-b.in)/Math.max(1e-4,b.peak-b.in) : (b.out>1.5?1:1-(p-b.peak)/Math.max(1e-4,b.out-b.peak)); }
      b.el.style.opacity = a.toFixed(3); b.el.style.transform = `translateY(${(1-a)*24}px)`; b.el.style.pointerEvents = a>.5?'auto':'none'; });
    if (fade) fade.style.opacity = Math.max(0, (p-.93)/.07).toFixed(3); }
  let lastLum = 0; const lc = document.createElement('canvas'); lc.width=32; lc.height=4; const lctx = lc.getContext('2d', {willReadFrequently:true});
  function lum(now){ if (!header || now-lastLum < 180) return; lastLum = now;
    if (drive.getBoundingClientRect().bottom < 80){ header.classList.toggle('on-light', !!cfg.light); return; }
    if (!shownBm) return;
    try{ lctx.clearRect(0,0,32,4); lctx.drawImage(shownBm, 0,0,shownBm.width,Math.max(1,shownBm.height*.08|0), 0,0,32,4); const d = lctx.getImageData(0,0,32,4).data; let s=0,c=0; for(let q=0;q<d.length;q+=4){ s+=.299*d[q]+.587*d[q+1]+.114*d[q+2]; c++; }
      header.classList.toggle('on-light', s/c > 138); }catch(e){} }
  let lastT = performance.now(), maxD = 0, lastP = -1; const deltas = [];
  function tick(now){ const dt = now-lastT; lastT = now; if (dt>maxD) maxD = dt; deltas.push(dt); if (deltas.length>600) deltas.shift();
    const p = prog(); target = p*(N-1); cur += (target-cur) * (RM ? 1 : .14); if (Math.abs(target-cur) < .01) cur = target;
    const f = Math.round(cur); ensureBitmaps(f); drawFrame(f);
    if (p !== lastP){ setBeats(p); lastP = p; } lum(now); requestAnimationFrame(tick); }
  setInterval(()=>{ window.__jankMax = maxD; maxD = 0; const s=[...deltas].sort((a,b)=>a-b); window.__jankP95 = s[Math.floor(s.length*.95)]||0; }, 2000);
  const io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} }), {rootMargin:'0px 0px -12% 0px', threshold:.12});
  document.querySelectorAll('.section').forEach(s=>io.observe(s));
  document.querySelectorAll('[data-split]').forEach(el=>{ el.innerHTML = el.textContent.split(' ').map(w=>'<span style="display:inline-block;white-space:nowrap">'+w.split('').map(c=>`<span class="ch">${c}</span>`).join('')+'</span>').join(' '); });
  size(); addEventListener('resize', size);
  const poster = new Image(); poster.src = cfg.poster;
  if (RM){ // reduced motion: still poster, no scrub, no pump
    poster.onload = () => { fit(poster); shownBm = null; setBeats(0); window.__ready = true; }; beats.forEach(b=>b.el.style.opacity=1); return; }
  pump();
  poster.decode().catch(()=>{}).then(()=> poster.naturalWidth ? createImageBitmap(poster).then(b=>{ posterBm = b; if (!shownBm){ fit(b); shownBm = b; } }) : 0).then(()=>{
    const first = images.slice(0, 24); return Promise.all(first.map(im => im && (im.complete ? 0 : new Promise(r=>{ im.addEventListener('load', r, {once:true}); im.addEventListener('error', r, {once:true}); }))));
  }).then(()=>{
    if (JUMP===null && window.Lenis){ const lenis = new Lenis({lerp:.09, smoothWheel:true}); (function raf(t){ lenis.raf(t); requestAnimationFrame(raf); })(performance.now()); }
    if (window.gsap) gsap.from('.ch', {yPercent:120, opacity:0, stagger:.035, duration:1.1, ease:'power4.out'});
    if (JUMP !== null){ scrollTo(0, +JUMP||0); document.querySelectorAll('.section').forEach(s=>{ const r=s.getBoundingClientRect(); if (r.top < innerHeight) s.classList.add('in'); }); }
    const p = prog(); cur = target = p*(N-1); setBeats(p); requestAnimationFrame(tick); document.documentElement.classList.add('ready');
    const wait = () => { const f = Math.round(cur); if (bitmaps.has(f) || JUMP===null) setTimeout(()=>{ window.__ready = true; }, 300); else { ensureBitmaps(f); setTimeout(wait, 100); } };
    // for ?jump, wait until the frame at the jump position is loaded
    wait();
  });
})();
