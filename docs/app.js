'use strict';
const q = s => document.querySelector(s);
const qa = s => [...document.querySelectorAll(s)];
const state={setting:'cross',scale:'400',stage:0};
function selectGroup(selector,key,value){qa(selector).forEach(b=>{const active=b.dataset[key]===String(value);b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});}
function renderResults(){
  const {setting,scale}=state;
  const rows=window.RESULTS[setting];
  const settingLabel=setting==='cross'?'Cross-area':'Same-area';
  q('#table-caption').textContent=`VIGOR-Pro · ${settingLabel} · ${scale} m`;
  const groups=[
    {name:'End-to-end',id:'end-to-end',rows:rows.slice(0,4)},
    {name:'Retrieval-based',id:'retrieval-based',rows:rows.slice(4,7)},
    {name:'Search-based',id:'search-based',rows:rows.slice(7,10)}
  ];
  qa('#results-table tbody').forEach(body=>body.remove());
  for(const group of groups){
    const body=document.createElement('tbody');
    body.className=`approach-group ${group.id}`;
    body.setAttribute('aria-label',group.name);
    group.rows.forEach((row,index)=>{
      const tr=document.createElement('tr');
      if(index===0)tr.classList.add('group-start');
      if(row.method==='RingMatch')tr.classList.add('ours');
      else if(row.method.startsWith('RingMatch'))tr.classList.add('search-row');
      if(index===0){
        const approach=document.createElement('th');
        approach.scope='rowgroup';approach.rowSpan=group.rows.length;
        approach.className='approach-cell';approach.textContent=group.name;
        tr.append(approach);
      }
      const method=document.createElement('th');
      method.scope='row';method.className='method-cell';method.textContent=row.method;
      tr.append(method);
      const values=row.values[scale];
      for(const value of [values.mean,values.median]){
        const cell=document.createElement('td');
        cell.className='metric-cell';cell.textContent=value.toFixed(2);
        tr.append(cell);
      }
      body.append(tr);
    });
    q('#results-table').append(body);
  }
  const ours=rows.find(row=>row.method==='RingMatch').values[scale];
  const baseline=rows.find(row=>row.method==='Sample4Geo + FG²').values[scale];
  q('#result-summary').textContent=`With ${scale} m aerial regions under ${settingLabel.toLowerCase()} evaluation, RingMatch achieves ${ours.mean.toFixed(2)} m mean and ${ours.median.toFixed(2)} m median error, compared with ${baseline.mean.toFixed(2)} m and ${baseline.median.toFixed(2)} m for Sample4Geo + FG².`;
}
qa('[data-setting]').forEach(b=>b.addEventListener('click',()=>{state.setting=b.dataset.setting;selectGroup('[data-setting]','setting',state.setting);renderResults();}));
qa('[data-scale]').forEach(b=>b.addEventListener('click',()=>{state.scale=b.dataset.scale;selectGroup('[data-scale]','scale',state.scale);renderResults();}));
qa('[data-case]').forEach((b,i)=>b.addEventListener('click',()=>{
  qa('[data-case]').forEach(other=>{const active=other===b;other.classList.toggle('selected',active);other.setAttribute('aria-pressed',String(active));});
  const src=`assets/depth_ring_case_${b.dataset.case}.png`;
  q('#case-image').src=src;
  q('#case-image').alt=`Example ${i+1}: ground panorama, aerial candidates and depth-ring comparisons from the paper`;
  q('#case-enlarge').dataset.image=src;
}));
qa('[data-image]').forEach(b=>b.addEventListener('click',()=>{
  q('#image-dialog img').src=b.dataset.image;
  q('#image-dialog img').alt=b.querySelector('img').alt;
  q('#image-dialog').showModal();
}));
q('.dialog-close').addEventListener('click',()=>q('#image-dialog').close());
q('#image-dialog').addEventListener('click',e=>{
  if(e.target!==e.currentTarget)return;
  const r=e.currentTarget.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();
});
renderResults();

q('#copy-citation').addEventListener('click',async()=>{
  const code=q('#citation-code').textContent;
  try{
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(code);
    q('#copy-citation').textContent='Copied';
    q('#citation-status').textContent='BibTeX copied to clipboard.';
  }catch{
    const range=document.createRange();range.selectNodeContents(q('#citation-code'));
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    q('#copy-citation').textContent='Text selected';
    q('#citation-status').textContent='Use your copy shortcut to copy the selected BibTeX.';
  }
});
