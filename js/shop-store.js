window.addEventListener('DOMContentLoaded', () => {
  const money = n => `${new Intl.NumberFormat('ar-SA').format(Number(n)||0)} ر.س`;
  const esc = s => String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const grid = document.querySelector('#products-grid');
  const year = document.querySelector('#year'); if (year) year.textContent = new Date().getFullYear();
  const PAGE = 24;
  let offset = 0, total = 0, loading = false, allLoaded = [], section = 'all';
  const SS_KEY = 'tiqnora-shop-first-v1';
  const params = new URLSearchParams(location.search);
  const initialCat = params.get('cat') || '';
  if (initialCat) {
    const catSel = document.querySelector('#f-cat');
    if (catSel) {
      const opt = document.createElement('option');
      opt.value = initialCat; opt.textContent = initialCat; opt.selected = true;
      catSel.appendChild(opt);
    }
  }
  function renderCount(){
    const c = (window.TiqnoraStore?.getCart()||[]).reduce((a,i)=>a+i.qty,0);
    const el = document.querySelector('#store-cart-count');
    if (el) { el.textContent = c; el.style.display = c > 0 ? 'grid' : 'none'; }
  }
  function finalPrice(p){
    const d = Number(p.discount_percent)||0;
    return d > 0 ? p.price * (1 - d / 100) : Number(p.price)||0;
  }
  function inStock(p){ return !(p.track_stock && p.stock_quantity <= 0); }
  function card(p, idx) {
    const hasDisc = Number(p.discount_percent) > 0;
    const final = finalPrice(p);
    const out = !inStock(p);
    const img = (p.images && p.images[0]) ? p.images[0] : '';
    const brand = p.brands?.name || '';
    const priority = idx < 4 ? 'fetchpriority="high"' : 'fetchpriority="low"';
    const lazy = idx < 4 ? '' : 'loading="lazy"';
    const badge = out ? '<span class="badge out">غير متوفر</span>'
      : (hasDisc ? `<span class="badge sale">-${Math.round(p.discount_percent)}%</span>`
        : (p.featured ? '<span class="badge">مميز</span>' : ''));
    const save = hasDisc ? `<span class="price-save">وفر ${money(Number(p.price)-final)}</span>` : '';
    return `<a class="product-card" href="product.html?slug=${encodeURIComponent(p.slug)}" style="animation-delay:${Math.min(idx,12)*0.03}s">
      ${badge}
      <div class="product-thumb">${img
        ? `<img src="${esc(img)}" alt="${esc(p.name_ar)}" width="320" height="320" decoding="async" ${lazy} ${priority}>`
        : '<span style="color:#94A3B8;font-size:2rem">▣</span>'}</div>
      <div class="product-body">
        ${brand ? `<span class="p-brand">${esc(brand)}</span>` : `<span class="p-cat">${esc(p.categories?.name_ar || '')}</span>`}
        <h3>${esc(p.name_ar)}</h3>
        <div class="product-price"><strong>${money(final)}</strong>${hasDisc?`<s>${money(p.price)}</s>`:''}${save}</div>
      </div>
    </a>`;
  }
  function skeleton(n=8){
    return Array.from({length:n},()=>`<div class="skel" aria-hidden="true"><div class="skel-img"></div><div class="skel-line"></div><div class="skel-line s"></div></div>`).join('');
  }
  function meta(shown){
    const el=document.querySelector('#shop-result-meta');
    if(el) el.textContent=total?`عرض ${shown} من ${total}`:(shown?`${shown} منتج`:'لا توجد منتجات');
  }
  function ensureLoadMore(){
    let btn=document.querySelector('#shop-load-more');
    if(!btn){
      btn=document.createElement('button');
      btn.id='shop-load-more'; btn.type='button'; btn.textContent='عرض المزيد';
      grid.after(btn);
      btn.addEventListener('click',()=>loadPage(false));
    }
    return btn;
  }
  function applyClientSection(list){
    if(section==='featured') return list.filter(p=>!!p.featured);
    if(section==='national') return list.filter(p=>p.categories?.slug==='national-day');
    return list;
  }
  function applyClientFilters(list){
    let out=list;
    const price=document.querySelector('#f-price')?.value||'';
    const status=document.querySelector('#f-status')?.value||'';
    if(price){const [a,b]=price.split('-').map(Number); out=out.filter(p=>{const v=finalPrice(p); return v>=a&&v<=b;});}
    if(status==='in') out=out.filter(inStock);
    if(status==='out') out=out.filter(p=>!inStock(p));
    if(status==='featured') out=out.filter(p=>!!p.featured);
    if(status==='national') out=out.filter(p=>p.categories?.slug==='national-day');
    return out;
  }
  function paintFeatured(items){
    const rail=document.querySelector('#rail-featured');
    const track=document.querySelector('#rail-featured-track');
    if(!rail||!track) return;
    const featured=items.filter(p=>p.featured).slice(0,12);
    if(!featured.length){rail.hidden=true;return;}
    rail.hidden=false;
    track.innerHTML=featured.map((p,i)=>card(p,i)).join('');
  }
  function tryInstantCache(){
    try{
      const raw=sessionStorage.getItem(SS_KEY);
      if(!raw) return false;
      const data=JSON.parse(raw);
      if(!data||!Array.isArray(data.items)||!data.items.length) return false;
      if(initialCat||(document.querySelector('#f-q')?.value||'').trim()) return false;
      allLoaded=data.items; total=data.total||data.items.length; offset=data.items.length;
      grid.innerHTML=data.items.map((p,i)=>card(p,i)).join('');
      meta(allLoaded.length); paintFeatured(allLoaded);
      const btn=ensureLoadMore(); btn.style.display=data.hasMore?'block':'none';
      return true;
    }catch(_){return false;}
  }
  function saveCache(page){
    try{
      if(offset===page.items.length&&!initialCat&&!(document.querySelector('#f-q')?.value||'').trim()&&section==='all'){
        sessionStorage.setItem(SS_KEY, JSON.stringify({items:page.items,total:page.total,hasMore:page.hasMore,t:Date.now()}));
      }
    }catch(_){}
  }
  async function loadPage(reset){
    if(loading) return;
    loading=true;
    const btn=ensureLoadMore();
    btn.disabled=true; btn.textContent='جارٍ التحميل…';
    if(reset){offset=0;allLoaded=[];grid.innerHTML=skeleton(8);}
    const q=(document.querySelector('#f-q')?.value||'').trim();
    const cat=document.querySelector('#f-cat')?.value||null;
    const brand=document.querySelector('#f-brand')?.value||null;
    try{
      if(!window.TiqnoraDB?.getProductsPage){
        await new Promise(r=>{const t=setTimeout(r,2500); window.addEventListener('tiqnora:db-ready',()=>{clearTimeout(t);r();},{once:true});});
      }
      if(!window.TiqnoraDB?.getProductsPage){
        if(reset) grid.innerHTML='<p style="color:var(--shop-muted)">تعذر الاتصال بقاعدة المنتجات. شغّل SQL 057 في Supabase.</p>';
        return;
      }
      const page=await window.TiqnoraDB.getProductsPage({limit:PAGE,offset,cat:cat||null,brand:brand||null,q:q||null});
      if(!page||!page.items){
        if(reset) grid.innerHTML='<p style="color:var(--shop-muted)">لا توجد منتجات. تأكد من تشغيل SQL 057 ومن أن is_active=true.</p>';
        return;
      }
      total=page.total||0;
      let items=applyClientFilters(applyClientSection(page.items));
      if(reset){
        allLoaded=items;
        grid.innerHTML=items.map((p,i)=>card(p,i)).join('')||'<p style="color:var(--shop-muted)">لا توجد منتجات مطابقة.</p>';
        paintFeatured(items);
        if(!cat&&!brand&&!q&&section==='all') saveCache(page);
      } else {
        allLoaded=allLoaded.concat(items);
        const wrap=document.createElement('div');
        wrap.innerHTML=items.map((p,i)=>card(p,offset+i)).join('');
        while(wrap.firstChild) grid.appendChild(wrap.firstChild);
      }
      offset+=PAGE;
      meta(allLoaded.length);
      const hasMore=page.hasMore&&allLoaded.length<(total||Infinity);
      btn.style.display=hasMore?'block':'none';
      btn.disabled=false; btn.textContent='عرض المزيد';
    }catch(e){
      console.warn(e);
      if(reset) grid.innerHTML='<p style="color:var(--shop-muted)">تعذر تحميل المنتجات.</p>';
      btn.disabled=false; btn.textContent='عرض المزيد';
    }finally{
      loading=false; renderCount();
    }
  }
  async function loadBrandsAndCats(){
    try{
      if(!window.TiqnoraDB) return;
      const [brandRows,catRows]=await Promise.all([
        window.TiqnoraDB.getBrands?.()||[],
        window.TiqnoraDB.getCategories?.()||[],
      ]);
      const brandSel=document.querySelector('#f-brand');
      if(brandSel&&brandRows?.length){
        const cur=brandSel.value;
        brandSel.innerHTML='<option value="">كل العلامات</option>'+brandRows.map(b=>`<option value="${esc(b.slug)}">${esc(b.name||b.name_ar||b.slug)}</option>`).join('');
        brandSel.value=cur;
      }
      const catSel=document.querySelector('#f-cat');
      if(catSel&&catRows?.length){
        const cur=catSel.value||initialCat;
        const productCats=catRows.filter(c=>!c.type||c.type==='product'||c.type==='products');
        if(productCats.length){
          catSel.innerHTML='<option value="">كل التصنيفات</option>'+productCats.map(c=>`<option value="${esc(c.slug)}">${esc(c.name_ar||c.slug)}</option>`).join('');
          catSel.value=cur||'';
          const chipHost=document.querySelector('#cat-chips');
          if(chipHost){
            chipHost.innerHTML=`<button type="button" class="chip${!catSel.value?' active':''}" data-cat="">كل المنتجات</button>`+
              productCats.map(c=>`<button type="button" class="chip${catSel.value===c.slug?' active':''}" data-cat="${esc(c.slug)}">${esc(c.name_ar||c.slug)}</button>`).join('');
            chipHost.querySelectorAll('[data-cat]').forEach(btn=>{
              btn.addEventListener('click',()=>{
                catSel.value=btn.getAttribute('data-cat')||'';
                chipHost.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x===btn));
                loadPage(true);
              });
            });
          }
          const linksHost=document.querySelector('#cat-links');
          if(linksHost){
            linksHost.innerHTML=productCats.map(c=>`<a class="chip" href="shop.html?cat=${encodeURIComponent(c.slug)}">${esc(c.name_ar||c.slug)}</a>`).join('');
          }
        }
      }
    }catch(_){}
  }
  document.querySelectorAll('[data-shop-section]').forEach(el=>{
    el.addEventListener('click',e=>{e.preventDefault(); section=el.getAttribute('data-shop-section')||'all';
      document.querySelectorAll('[data-shop-section]').forEach(x=>x.classList.toggle('active',x===el)); loadPage(true);});
  });
  ['#f-q','#f-cat','#f-brand','#f-price','#f-status'].forEach(sel=>{
    const el=document.querySelector(sel); if(!el) return;
    el.addEventListener('change',()=>loadPage(true));
    if(el.tagName==='INPUT'){let t; el.addEventListener('input',()=>{clearTimeout(t); t=setTimeout(()=>loadPage(true),280);});}
  });
  document.getElementById('mobile-cat-btn')?.addEventListener('click',()=>{
    document.getElementById('cat-nav')?.classList.toggle('mobile-open');
  });
  document.querySelectorAll('.cat-item[data-mega] > button').forEach(btn=>{
    btn.addEventListener('click',e=>{
      if(window.matchMedia('(max-width:960px)').matches){
        e.preventDefault();
        btn.closest('.cat-item').classList.toggle('open');
      }
    });
  });
  tryInstantCache();
  loadPage(true);
  loadBrandsAndCats();
  renderCount();
});
