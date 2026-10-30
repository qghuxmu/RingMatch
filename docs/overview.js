/* Explore recorded inference through linked, selectable data views. */
(() => {
  'use strict';
  const root=document.getElementById('rm-motion');
  if(!root||!window.RINGMATCH_TRACE)return;
  const $=selector=>root.querySelector(selector),panel=$('#rmx-panel');
  const palette=['#d58b30','#238ac2','#aa70b4','#648d54'];
  const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  let d=window.RINGMATCH_TRACE,loadVersion=0,lastRequested='',initialized=false;
  const state={view:'search',input:'root',group:null,points:'clusters',showPruned:true,inspected:null,angle:null,pinned:false,ground:true,aerial:true,loaded:false,extracting:false};
  const views=['search','rings','verification'];
  let animation=0,extractionStart=0,lastPaintedInput='';
  const announce=text=>$('#rmx-explanation').textContent=text;
  const interact=()=>document.dispatchEvent(new CustomEvent('ringmatch:interact'));
  const node=id=>d.byId[id];
  const children=id=>d.nodes.filter(n=>n.parent===id).sort((a,b)=>a.p[1]-b.p[1]||a.p[0]-b.p[0]||a.id.localeCompare(b.id));
  function orderedNodes(){const result=[];function visit(n){result.push(n);children(n.id).forEach(visit);}visit(node('root'));return result;}
  const color=n=>n.id==='root'?'#738c5f':palette[n.familyIndex%palette.length];
  const candidateFor=id=>d.candidates.find(c=>c.id===id);
  const inputNode=()=>node(state.input)||node('root');
  const activeGroup=()=>inputNode().groups?.[state.group]||null;
  const selectedNode=()=>node(activeGroup()?.child)||inputNode();
  function ancestors(n){const path=[];while(n){path.unshift(n);n=n.parent?node(n.parent):null;}return path;}
  const scale=n=>n.depth<4?d.config.schedule[n.depth]:null;
  function nodeName(n){const candidate=candidateFor(n.id),index=orderedNodes().filter(item=>item.depth===n.depth).findIndex(item=>item.id===n.id)+1;return n.id==='root'?'Full region':candidate?'Candidate '+candidate.label:n.depth<4?scale(n)+' m branch '+index:'Final hypothesis '+index;}
  function percentage(p){const v=p*100;return v<.01?v.toFixed(4)+'%':v>99.99?v.toFixed(4)+'%':v.toFixed(2)+'%';}
  function svgImage(box,{overlay='',label='Aerial image',className='',map=false}={}){
    const h=box.h??box.w;
    return `<svg class="rmx-map-svg ${className}" viewBox="0 0 1000 1000" ${map?'':'role="img"'} aria-label="${esc(label)}"><image href="${esc(d.assets.aerial)}" x="${-box.x/box.w*1000}" y="${-box.y/h*1000}" width="${1000/box.w}" height="${1000/h}" preserveAspectRatio="none"/>${overlay}</svg>`;
  }
  function relativePoint(p,box){return [(p[0]-box.x)/box.w*1000,(p[1]-box.y)/(box.h??box.w)*1000];}
  function boxOverlay(box,within,stroke,dashed=false){
    const [x,y]=relativePoint([box.x,box.y],within);
    return `<rect x="${x}" y="${y}" width="${box.w/within.w*1000}" height="${(box.h??box.w)/(within.h??within.w)*1000}" fill="${stroke}18" stroke="white" stroke-width="13"/><rect x="${x}" y="${y}" width="${box.w/within.w*1000}" height="${(box.h??box.w)/(within.h??within.w)*1000}" fill="none" stroke="${stroke}" stroke-width="7" ${dashed?'stroke-dasharray="19 11"':''}/>`;
  }
  function treePositions(){
    const positions=new Map(),leaves=[];
    function visit(n){const kids=children(n.id);if(!kids.length){leaves.push(n);return;}kids.forEach(visit);}
    visit(node('root'));
    const height=368,step=(height-42)/Math.max(1,leaves.length-1);
    leaves.forEach((n,i)=>positions.set(n.id,{x:18+n.depth*55,y:leaves.length===1?height/2:28+i*step}));
    function locate(n){if(positions.has(n.id))return positions.get(n.id);const kids=children(n.id).map(locate);const p={x:18+n.depth*55,y:kids.reduce((sum,p)=>sum+p.y,0)/kids.length};positions.set(n.id,p);return p;}
    locate(node('root'));return positions;
  }
  function treeHTML(){
    const positions=treePositions(),selected=selectedNode(),path=new Set(ancestors(selected).map(n=>n.id));
    const headings=['400','200','100','50','Final'];
    let svg=`<svg class="rmx-tree" viewBox="0 0 260 410" aria-label="Recorded search tree">${headings.map((text,i)=>`<text x="${18+i*55}" y="12" text-anchor="middle" font-size="9" fill="#8b977f">${text}${i<4?' m':''}</text>`).join('')}`;
    d.nodes.filter(n=>n.parent).forEach(n=>{
      const a=positions.get(n.parent),b=positions.get(n.id),on=path.has(n.id),dim=!n.kept;
      svg+=`<path class="rmx-edge" data-edge="${esc(n.id)}" d="M${a.x+9},${a.y+27} C${a.x+29},${a.y+27} ${b.x-29},${b.y+27} ${b.x-9},${b.y+27}" stroke="${color(n)}" stroke-width="${on?2:1.1}" opacity="${dim?(state.showPruned?.35:.06):on?.95:.4}"/>`;
    });
    d.nodes.forEach(n=>{
      const p=positions.get(n.id),candidate=candidateFor(n.id),selectedHere=selected.id===n.id,off=!n.kept&&!state.showPruned;
      const label=n.id==='root'?'○':candidate?candidate.label:n.count;
      svg+=`<g class="rmx-node ${off?'rmx-node-off':''}" data-node="${esc(n.id)}" role="button" tabindex="${off?-1:0}" aria-label="${esc(nodeName(n)+', '+(n.id==='root'?'16 samples':n.count+' points, cumulative support '+n.score)+(n.kept?'':', pruned'))}" aria-pressed="${selectedHere}" transform="translate(${p.x},${p.y+27})" opacity="${off?.12:!n.kept?.45:1}"><title>${esc(nodeName(n)+(n.id==='root'?'':' · S '+n.score)+(n.kept?'':' · Pruned'))}</title><rect x="-17" y="-17" width="34" height="34" fill="transparent"/><circle class="rmx-node-halo" r="15"/><circle r="10" fill="${selectedHere?color(n):'#fff'}" stroke="${color(n)}" stroke-width="${candidate?2:1.4}" ${n.kept?'':'stroke-dasharray="3 2"'}/><text text-anchor="middle" y="3.2" font-size="${candidate?11:9}" fill="${selectedHere?'#fff':color(n)}" font-weight="${candidate?600:400}">${label}</text></g>`;
    });
    svg+='</svg>';
    const options=orderedNodes().filter(n=>n.id==='root'||state.showPruned||n.kept).map(n=>`<option value="${esc(n.id)}" ${selected.id===n.id?'selected':''}>${'↳ '.repeat(n.depth)}${esc(nodeName(n))}${n.id==='root'?'':' · S '+n.score}${n.kept?'':' · Pruned'}</option>`).join('');
    return `<div class="rmx-tree-pane"><p class="rmx-panel-label">Search tree <small>M = 16 · B = 4</small></p>${svg}<label class="rmx-prune"><input type="checkbox" id="rmx-show-pruned" ${state.showPruned?'checked':''}>Show pruned branches</label><div class="rmx-mobile-nodes"><label for="rmx-node-select">Branch</label><select id="rmx-node-select">${options}</select></div></div>`;
  }
  function samplesSVG(){
    const n=inputNode(),groups=n.groups||[],chosen=activeGroup(),selectedMembers=new Set(chosen?.members||[]),clip=[];
    const groupColors=new Map();groups.forEach(g=>g.members.forEach(i=>groupColors.set(i,g.child?color(node(g.child)):'#a7b09c')));
    let overlay='';
    (n.points||[]).forEach((point,i)=>{
      const [x,y]=relativePoint(point,n.input),outside=x<0||x>1000||y<0||y>1000;
      if(outside){clip.push(i);return;}
      overlay+=`<circle class="rmx-sample" data-sample="${i}" cx="${x}" cy="${y}" r="8" fill="${state.points==='raw'?'#e9f4dd':groupColors.get(i)}" stroke="white" stroke-width="3" opacity="${chosen&&!selectedMembers.has(i)?.25:1}"/>`;
    });
    if(state.points==='clusters')groups.forEach((g,i)=>{
      const [x,y]=relativePoint(g.p,n.input),inside=x>=0&&x<=1000&&y>=0&&y<=1000;
      if(!inside)return;
      const c=g.child?color(node(g.child)):'#8b9980',chosenHere=state.group===i;
      const points=g.members.map(index=>relativePoint(n.points[index],n.input));
      const rx=Math.max(26,...points.map(p=>Math.abs(p[0]-x)+12)),ry=Math.max(26,...points.map(p=>Math.abs(p[1]-y)+12));
      const labelY=clamp(y-ry-28,25,965),labelX=clamp(x,32,968);
      overlay+=`<g class="rmx-group" data-group="${i}" role="button" tabindex="0" aria-label="Cluster ${i+1}, ${g.count} ${g.count===1?'point':'points'}${g.child&&!node(g.child).kept?', pruned':''}" aria-pressed="${chosenHere}"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}${chosenHere?'35':'14'}" stroke="white" stroke-width="8"/><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="${chosenHere?6:3.5}"/><path d="M${x-13},${y}h26 M${x},${y-13}v26" stroke="white" stroke-width="8"/><path d="M${x-13},${y}h26 M${x},${y-13}v26" stroke="${c}" stroke-width="3.5"/><rect x="${labelX-27}" y="${labelY-22}" width="54" height="43" rx="9" fill="${c}"/><text x="${labelX}" y="${labelY+9}" text-anchor="middle" fill="white" font-size="29" font-weight="600">${g.count}</text><ellipse class="rmx-hit" cx="${x}" cy="${y}" rx="${Math.max(rx,33)}" ry="${Math.max(ry,33)}" fill="transparent"/><rect class="rmx-hit" x="${labelX-31}" y="${labelY-25}" width="62" height="51" fill="transparent"/></g>`;
    });
    return {svg:svgImage(n.input,{overlay,label:`${scale(n)} m input with ${n.points?.length||0} coordinate samples`,map:true}),outside:clip.length};
  }
  function mapHTML(){
    const n=inputNode(),samples=samplesSVG();
    const crumbs=ancestors(n).map(a=>`<button type="button" data-node="${esc(a.id)}" aria-current="${a.id===n.id}">${a.id==='root'?'400 m':scale(a)+' m'}</button>`).join('<span>›</span>');
    return `<div class="rmx-map-pane"><div class="rmx-breadcrumb" aria-label="Crop ancestry">${crumbs}</div><img class="rmx-input-pano" src="${esc(d.assets.pano)}" alt="Ground panorama"><div class="rmx-map-wrap" id="rmx-active-map">${samples.svg}</div><div class="rmx-map-tools"><div class="rmx-switch" role="group" aria-label="Coordinate display"><button type="button" data-points="raw" aria-pressed="${state.points==='raw'}">Raw points</button><button type="button" data-points="clusters" aria-pressed="${state.points==='clusters'}">Clusters</button></div><span>${n.points?.length||0} samples${samples.outside?' · '+samples.outside+' outside crop':''}</span></div></div>`;
  }
  function rankInfo(n){const level=d.levels[n.depth-1];return level?{level,rank:level.ranking.indexOf(n.id)+1}:null;}
  function nodeSummary(n){
    if(n.id==='root')return `<p class="rmx-summary">400 m aerial region</p><dl class="rmx-stat-list"><div><dt>Coordinate samples</dt><dd>${n.points.length}</dd></div><div><dt>Spatial hypotheses</dt><dd>${children(n.id).length}</dd></div><div><dt>Expansion budget</dt><dd>Up to ${d.config.budget}</dd></div></dl>`;
    const rank=rankInfo(n),candidate=candidateFor(n.id),terminal=n.depth===4;
    return `<p class="rmx-summary">${esc(nodeName(n))}</p><dl class="rmx-stat-list"><div><dt>Cluster size</dt><dd>${n.count} points</dd></div><div><dt>Cumulative support</dt><dd>${n.path.join(' + ')} = <strong>${n.score}</strong></dd></div><div><dt>${terminal?'Search rank':'Level rank'}</dt><dd>${rank?.rank||'–'} / ${rank?.level.ranking.length||'–'}</dd></div><div><dt>Status</dt><dd>${candidate?'Top 2':terminal?'Not shortlisted':n.kept?'Retained':'Pruned'}</dd></div></dl>`;
  }
  function inspectorHTML(){
    const current=inputNode(),group=activeGroup(),selected=selectedNode(),candidate=candidateFor(selected.id);
    const info=group&&!group.child?`<p class="rmx-summary">Unexpanded sample group</p><p class="rmx-quiet">${group.count} ${group.count===1?'point':'points'}; no search branch was recorded for this group.</p>`:nodeSummary(selected);
    const groups=current.groups||[];
    let action='';
    if(group?.child){if(selected.queried)action=`<button type="button" class="rmx-action" data-open="${esc(selected.id)}">Open ${scale(selected)} m crop <span aria-hidden="true">→</span></button>`;
      else if(candidate)action=`<button type="button" class="rmx-action" data-verify="${candidate.label}">Inspect candidate ${candidate.label} <span aria-hidden="true">→</span></button>`;
      else action=`<p class="rmx-quiet">${selected.kept?'No further crop was evaluated.':'This branch was not expanded.'}</p>`;
    }else if(candidate)action=`<button type="button" class="rmx-action" data-verify="${candidate.label}">Inspect candidate ${candidate.label} →</button>`;
    const list=groups.map((g,i)=>`<button type="button" data-group="${i}" aria-pressed="${state.group===i}"><span><i class="rmx-dot" style="--branch:${g.child?color(node(g.child)):'#aab39e'}"></i>Cluster ${i+1}</span><span>${g.count} ${g.count===1?'point':'points'}</span></button>`).join('');
    const target=group?.child?selected:current;
    const position=target.id!=='root'&&target.input?`<div class="rmx-mini"><p>Position in aerial region</p><div class="rmx-map-wrap">${svgImage({x:0,y:0,w:1},{overlay:(target.parent&&node(target.parent).id!=='root'?boxOverlay(node(target.parent).input,{x:0,y:0,w:1},'#a4ad9a',true):'')+boxOverlay(target.input,{x:0,y:0,w:1},color(target)),label:'Actual crop position in the original aerial image'})}</div></div>`:'';
    const rank=rankInfo(selected);
    const ranking=rank?`<details class="rmx-ranking"><summary>${selected.depth===4?'Final ranking':'Level ranking'}</summary>${rank.level.ranking.map((id,i)=>{const item=node(id);return `<button type="button" class="rmx-rank-row ${item.kept?'':'rmx-pruned-row'}" data-node="${esc(id)}" aria-pressed="${id===selected.id}"><span>${i+1}</span><span>${candidateFor(id)?'Candidate '+candidateFor(id).label:item.kept?'Retained':'Pruned'}</span><span>${item.score}</span></button>`;}).join('')}</details>`:'';
    return `<aside class="rmx-inspector" aria-label="Selected hypothesis details"><p class="rmx-panel-label">${group?'Selected cluster':'Current input'}</p>${info}${action}${!group?`<p class="rmx-quiet">Select a cluster to see its support and next crop.</p><div class="rmx-count-list">${list}</div>`:`<button type="button" class="rmx-origin" data-clear-group>← Back to input</button>`}${position}${ranking}</aside>`;
  }
  function renderSearch(){panel.innerHTML=`<div class="rmx-search">${treeHTML()}${mapHTML()}${inspectorHTML()}</div>`;const key=d.id+':'+state.input;if(lastPaintedInput&&key!==lastPaintedInput)$('#rmx-active-map').classList.add('rmx-crossfade');lastPaintedInput=key;announce('Select a tree node to open its input; select a cluster to inspect its support.');}
  function inspectNode(id){
    const n=node(id);if(!n)return;
    state.group=null;
    if(n.id==='root'||n.queried){state.input=id;}
    else {state.input=n.parent;state.group=(node(n.parent).groups||[]).findIndex(g=>g.child===id);if(state.group<0)state.group=null;}
    state.view='search';render();
    announce(n.id==='root'?'16 predictions form spatial hypotheses.':`${nodeName(n)}: ${n.count} points; cumulative support ${n.path.join(' + ')} = ${n.score}.${n.kept?'':' This branch was pruned.'}`);
  }
  function chooseGroup(index){
    if(!inputNode().groups?.[index])return;
    state.group=index;
    if(state.points==='raw')state.points='clusters';
    renderSearch();
    const g=activeGroup(),n=node(g.child);announce(n?`${g.count} points support this hypothesis. Cumulative support: ${n.path.join(' + ')} = ${n.score}.${n.kept?'':' This branch was pruned.'}`:`${g.count} unexpanded ${g.count===1?'sample':'samples'}.`);
  }
  function polarPath(values,progress=1){
    let path='';for(let i=0;i<=Math.floor(clamp(progress)*359);i++){const r=values[i]/80*86,a=i*Math.PI/180;path+=(i?'L':'M')+(110+Math.sin(a)*r).toFixed(3)+','+(110-Math.cos(a)*r).toFixed(3);}
    return path+(progress>=1?'Z':'');
  }
  function polarSVG(key,{comparison=false,interactive=true}={}){
    const candidate=d.candidates.find(c=>c.label===key),c=key==='ground'?'#48543e':color(candidate),values=d.displayRings[key];
    const ground=comparison?`<path data-contour="ground" d="${polarPath(d.displayRings.ground)}" fill="none" stroke="#48543e" stroke-width="1.65" ${state.ground?'':'opacity="0"'}/>`:'';
    const ring=`<path data-contour="${key==='ground'?'ground':'aerial'}" data-ring-path="${key}" d="${polarPath(values)}" fill="none" stroke="${c}" stroke-width="${comparison?2.4:2}" stroke-linejoin="round" ${comparison&&!state.aerial?'opacity="0"':''}/>`;
    return `<svg class="rmx-polar" data-ring="${key}" viewBox="0 0 220 220" ${interactive?`role="slider" tabindex="0" aria-label="Inspect ${key==='ground'?'ground':'candidate '+key} ring direction" aria-valuemin="0" aria-valuemax="359" aria-valuenow="${state.angle??0}" aria-valuetext="${state.angle===null?'No direction selected':state.angle+' degrees'}"`:'role="img" aria-label="Ground depth ring"'}>${[.25,.5,.75,1].map(r=>`<circle cx="110" cy="110" r="${r*86}" fill="none" stroke="#e0e7d9" stroke-width=".7"/>`).join('')}<path d="M24 110H196 M110 24V196" stroke="#e5eadf" stroke-width=".65"/>${ground}${ring}<g data-direction-marker ${state.angle===null?'visibility="hidden"':''}><path data-direction-line fill="none" stroke="#98a68b" stroke-width=".8" stroke-dasharray="3 3"/>${comparison?'<circle data-ground-dot r="2.7" fill="#48543e" stroke="white" stroke-width=".8"/>':''}<circle data-direction-dot r="3" fill="${c}" stroke="white" stroke-width=".8"/></g></svg>`;
  }
  function candidatePatch(candidate){
    const [x,y]=relativePoint(candidate.p,candidate.crop);
    return svgImage(candidate.crop,{label:'Candidate '+candidate.label+' aerial patch',overlay:`<circle cx="${x}" cy="${y}" r="18" fill="${color(candidate)}" stroke="white" stroke-width="6"/>`});
  }
  function renderRings(){
    const [a,b]=d.candidates;
    panel.innerHTML=`<div class="rmx-rings"><div class="rmx-ring-input"><p>Ground panorama</p><div class="rmx-ground-images"><img class="rmx-erp" src="${esc(d.assets.pano)}" alt="Ground panorama"><div class="rmx-down-arrow" aria-hidden="true">↓</div><p class="rmx-ring-caption">Depth map</p><div class="rmx-depth"><img class="rmx-erp" src="${esc(d.assets.depth)}" alt="Full-panorama depth preview"><span class="rmx-depth-band"></span><span class="rmx-depth-scan"></span></div></div><div class="rmx-extraction-control"><button type="button" id="rmx-extract" aria-label="${state.extracting?'Stop ring extraction':'Show ring extraction'}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${state.extracting?'M3 3h10v10H3z':'M4 2v12l10-6z'}"/></svg>${state.extracting?'Stop':'Show extraction'}</button></div></div>${[a,b].map(candidate=>`<div class="rmx-ring-input" style="--branch:${color(candidate)}"><p>Candidate ${candidate.label}</p><div class="rmx-patch">${candidatePatch(candidate)}</div></div>`).join('')}<div class="rmx-ground-link" aria-hidden="true">↓</div><div class="rmx-predictor">Aerial-to-ring predictor</div><div class="rmx-ring-cell">${polarSVG('ground')}<p class="rmx-ring-caption">Ground ring</p></div>${[a,b].map(candidate=>`<div class="rmx-ring-cell">${polarSVG(candidate.label)}<p class="rmx-ring-caption">Aerial ring ${candidate.label}</p></div>`).join('')}<div class="rmx-direction-tools"><span>Point to a ring to compare the same direction. Click to hold.</span><button type="button" data-clear-angle ${state.angle===null?'hidden':''}>Clear direction</button></div></div>`;
    updateDirection();announce('Ground and aerial rings are shown separately. Select a direction to compare their spatial profiles.');
  }
  function finalMap(){
    const full={x:0,y:0,w:1};let overlay='';
    d.candidates.forEach(candidate=>{
      const [x,y]=relativePoint(candidate.p,full),winner=candidate.label===d.verification.selected,inspect=state.inspected===candidate.label,c=color(candidate);
      const labelX=x>900?x-42:x+35,labelY=y<70?y+48:y-25;
      overlay+=`<g data-inspect="${candidate.label}" role="button" tabindex="0" aria-label="Inspect candidate ${candidate.label}${winner?', selected by verifier':''}" aria-pressed="${inspect}" opacity="${winner||inspect?1:.55}"><circle class="rmx-hit" cx="${x}" cy="${y}" r="37" fill="transparent"/>${winner?`<circle cx="${x}" cy="${y}" r="31" fill="${c}28" stroke="${c}" stroke-width="5"/>`:''}${inspect?`<circle cx="${x}" cy="${y}" r="41" fill="none" stroke="white" stroke-width="7"/><circle cx="${x}" cy="${y}" r="41" fill="none" stroke="#38482e" stroke-width="3"/>`:''}<circle cx="${x}" cy="${y}" r="14" fill="${c}" stroke="white" stroke-width="5"/><text x="${labelX}" y="${labelY}" font-size="39" fill="${c}" stroke="white" stroke-width="7" paint-order="stroke" font-weight="600">${candidate.label}</text></g>`;
    });
    const [gx,gy]=relativePoint(d.groundTruth,full);let star='';for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?11:24;star+=(i?'L':'M')+(gx+Math.cos(a)*r)+','+(gy+Math.sin(a)*r);}overlay+=`<path d="${star}Z" fill="#4b6b32" stroke="white" stroke-width="5" pointer-events="none"><title>Ground truth</title></path>`;
    return svgImage(full,{overlay,label:'Final location with ground truth and both candidates',map:true});
  }
  function cardHTML(candidate){
    const p=d.verification.probabilities?.[candidate.label],winner=candidate.label===d.verification.selected;
    return `<article class="rmx-candidate-card" style="--branch:${color(candidate)}" data-card="${candidate.label}" data-winner="${winner}" data-inspected="${state.inspected===candidate.label}"><div class="rmx-candidate-head"><button type="button" data-inspect="${candidate.label}" aria-pressed="${state.inspected===candidate.label}">Candidate ${candidate.label}</button>${winner?'<span class="rmx-winner-label">✓ Selected</span>':''}</div><button type="button" class="rmx-candidate-patch" data-inspect="${candidate.label}" aria-label="Inspect candidate ${candidate.label} aerial evidence">${candidatePatch(candidate)}</button>${polarSVG(candidate.label,{comparison:true})}<button type="button" class="rmx-probability" data-inspect="${candidate.label}" title="A/B-normalized output-token probability"><small>LVLM output</small><b>${Number.isFinite(p)?percentage(p):'Unavailable'}</b></button>${Number.isFinite(p)?`<div class="rmx-prob-bar" style="--probability:${p*100}%"><span></span></div>`:''}<button type="button" class="rmx-origin" data-origin="${candidate.label}">← Search origin · rank ${candidate.searchRank}</button></article>`;
  }
  function actualInputsHTML(){
    const images=[{src:d.assets.pano,name:'Ground panorama'},{src:d.assets.context,name:'Aerial context'},...d.candidates.map(c=>({src:d.assets['crop'+c.sourceLabel],name:'Candidate '+c.label})),...d.candidates.map(c=>({src:d.assets['polar'+c.sourceLabel],name:'Aligned rings · '+c.label}))];
    // Images are remapped by physical candidate, not by the display letter alone.
    return `<details class="rmx-actual-inputs"><summary>View LVLM inputs</summary><div class="rmx-input-grid">${images.map(image=>`<figure><img src="${esc(image.src)}" alt="${image.name}"><figcaption>${image.name}</figcaption></figure>`).join('')}</div><p>${d.candidates.map(c=>`Candidate ${c.label}: (${(c.p[0]*1000).toFixed(1)}, ${(c.p[1]*1000).toFixed(1)})`).join(' · ')}</p></details>`;
  }
  function renderVerification(){
    panel.innerHTML=`<div class="rmx-verification"><div class="rmx-evidence"><div class="rmx-shared"><div><p>Ground panorama</p><img class="rmx-shared-pano" src="${esc(d.assets.pano)}" alt="Ground panorama"></div><div><p>Aerial context</p><img src="${esc(d.assets.context)}" alt="Shared aerial context"></div></div><div class="rmx-comparison">${d.candidates.map(cardHTML).join('')}</div><div class="rmx-contours" role="group" aria-label="Ring contours"><label><input type="checkbox" id="rmx-ground-contour" ${state.ground?'checked':''}>Ground ring</label><label><input type="checkbox" id="rmx-aerial-contour" ${state.aerial?'checked':''}>Aerial ring</label></div></div><aside class="rmx-result"><p class="rmx-panel-label">Final location <small>Candidate ${d.verification.selected} selected</small></p><div class="rmx-map-wrap" id="rmx-final-map">${finalMap()}</div><div class="rmx-map-legend"><span>★ GT</span>${d.candidates.map(c=>`<button type="button" style="--branch:${color(c)}" data-inspect="${c.label}" aria-pressed="${state.inspected===c.label}"><i class="rmx-dot"></i>${c.label}${c.label===d.verification.selected?' selected':''}</button>`).join('')}</div><span class="rmx-direction-readout" id="rmx-direction-readout"></span>${actualInputsHTML()}</aside></div>`;
    updateDirection();announce('Select a candidate, probability, or map point to inspect the same recorded evidence.');
  }
  function render(){
    if(!state.loaded)return;
    root.dataset.caseId=d.id;root.dataset.view=state.view;
    $$('.rmx-tabs [data-view]').forEach(button=>{const on=button.dataset.view===state.view;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});
    panel.setAttribute('aria-labelledby','rmx-tab-'+state.view);
    if(state.view==='search')renderSearch();else if(state.view==='rings')renderRings();else renderVerification();
  }
  function $$(selector){return [...root.querySelectorAll(selector)];}
  function stopExtraction(){cancelAnimationFrame(animation);animation=0;state.extracting=false;}
  function changeView(view){if(!views.includes(view)||!state.loaded)return;interact();stopExtraction();state.view=view;state.angle=null;state.pinned=false;render();}
  function candidateInspect(label){
    if(label!==null&&!d.candidates.some(c=>c.label===label))return;
    state.inspected=label;
    $$('.rmx-candidate-card').forEach(card=>card.dataset.inspected=String(card.dataset.card===state.inspected));
    $$('[data-inspect]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.inspect===state.inspected)));
    $('#rmx-final-map').innerHTML=finalMap();
    announce(state.inspected?`Inspecting candidate ${label}. The recorded verifier selected ${d.verification.selected}.`:'Both candidate locations and the recorded verifier decision are shown.');
  }
  function updateDirection(){
    const angle=state.angle,phi=angle===null?0:angle,a=phi*Math.PI/180;
    $$('.rmx-polar').forEach(svg=>{
      const marker=svg.querySelector('[data-direction-marker]');if(!marker)return;
      marker.setAttribute('visibility',angle===null?'hidden':'visible');
      svg.setAttribute('aria-valuenow',String(phi));svg.setAttribute('aria-valuetext',angle===null?'No direction selected':phi+' degrees'+(state.pinned?', held':''));
      svg.querySelector('[data-direction-line]').setAttribute('d',`M110 110L${110+Math.sin(a)*86} ${110-Math.cos(a)*86}`);
      const key=svg.dataset.ring,values=d.displayRings[key],r=values[phi]/80*86,dot=svg.querySelector('[data-direction-dot]');
      dot.setAttribute('cx',110+Math.sin(a)*r);dot.setAttribute('cy',110-Math.cos(a)*r);dot.setAttribute('visibility',state.view==='verification'&&!state.aerial?'hidden':'visible');
      const ground=svg.querySelector('[data-ground-dot]');if(ground){const gr=d.displayRings.ground[phi]/80*86;ground.setAttribute('cx',110+Math.sin(a)*gr);ground.setAttribute('cy',110-Math.cos(a)*gr);ground.setAttribute('visibility',state.ground?'visible':'hidden');}
    });
    const clear=$('[data-clear-angle]');if(clear)clear.hidden=angle===null;
    const readout=$('#rmx-direction-readout');if(readout)readout.textContent=angle===null?'':`${phi}° · Ground ${d.displayRings.ground[phi].toFixed(1)} m · A ${d.displayRings.A[phi].toFixed(1)} m · B ${d.displayRings.B[phi].toFixed(1)} m`;
  }
  function pointerAngle(event,svg){const b=svg.getBoundingClientRect();return (Math.round(Math.atan2(event.clientX-b.left-b.width/2,-(event.clientY-b.top-b.height/2))*180/Math.PI)+360)%360;}
  function extractionFrame(timestamp){
    if(!state.extracting||state.view!=='rings'||!state.loaded)return;
    if(!extractionStart)extractionStart=timestamp;
    const elapsed=timestamp-extractionStart,groundProgress=clamp(elapsed/3200),aerialProgress=clamp((elapsed-3600)/1100);
    const scan=$('.rmx-depth-scan');if(scan){scan.style.opacity=groundProgress<1?'1':'0';scan.style.left=groundProgress*100+'%';}
    const gp=$('[data-ring-path="ground"]');if(gp)gp.setAttribute('d',polarPath(d.displayRings.ground,groundProgress));
    $$('[data-ring-path="A"],[data-ring-path="B"]').forEach(path=>path.setAttribute('d',aerialProgress>0?polarPath(d.displayRings[path.dataset.ringPath],aerialProgress):''));
    const predictor=$('.rmx-predictor');if(predictor)predictor.style.opacity=elapsed<3200?'.3':'1';
    if(elapsed>=4700){state.extracting=false;animation=0;const button=$('#rmx-extract');button.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2v12l10-6z"/></svg>Show extraction';button.setAttribute('aria-label','Show ring extraction');announce('Ground ring extraction is complete; the aerial rings are predicted from candidate patches.');return;}
    animation=requestAnimationFrame(extractionFrame);
  }
  function toggleExtraction(){
    if(state.extracting){stopExtraction();renderRings();return;}
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){announce('The highlighted depth band defines the directional ground-ring representation.');return;}
    state.extracting=true;state.angle=null;state.pinned=false;extractionStart=0;renderRings();
    $$('[data-ring-path]').forEach(path=>path.setAttribute('d',''));animation=requestAnimationFrame(extractionFrame);
    announce('Scanning the depth band to illustrate ground-ring extraction. Aerial prediction follows.');
  }
  function restoreFocus(target){
    if(!target)return;
    const attrs=['data-node','data-group','data-points','data-inspect','data-open','data-clear-group'];
    for(const attr of attrs)if(target.hasAttribute(attr)){const value=target.getAttribute(attr);const next=$(`[${attr}="${CSS.escape(value)}"]`);next?.focus({preventScroll:true});return;}
    if(target.id)$('#'+CSS.escape(target.id))?.focus({preventScroll:true});
  }
  root.addEventListener('click',event=>{
    const target=event.target.closest('button,[role="button"],[role="slider"]');if(!target||!state.loaded)return;
    const svg=target.closest('.rmx-polar');
    if(svg){interact();if(state.pinned){state.pinned=false;state.angle=null;}else{state.angle=pointerAngle(event,svg);state.pinned=true;}updateDirection();return;}
    if(target.hasAttribute('data-view'))changeView(target.dataset.view);
    else if(target.hasAttribute('data-node')){interact();const candidate=candidateFor(target.dataset.node);if(candidate&&target.classList.contains('rmx-node')){state.inspected=candidate.label;changeView('verification');}else{inspectNode(target.dataset.node);restoreFocus(target);}}
    else if(target.hasAttribute('data-group')){interact();chooseGroup(Number(target.dataset.group));restoreFocus(target);}
    else if(target.hasAttribute('data-points')){interact();state.points=target.dataset.points;state.group=null;renderSearch();restoreFocus(target);}
    else if(target.hasAttribute('data-open')){interact();inspectNode(target.dataset.open);}
    else if(target.hasAttribute('data-clear-group')){interact();state.group=null;renderSearch();}
    else if(target.hasAttribute('data-verify')){interact();state.inspected=target.dataset.verify;changeView('verification');}
    else if(target.hasAttribute('data-inspect')){interact();candidateInspect(target.dataset.inspect);}
    else if(target.hasAttribute('data-origin')){interact();const c=d.candidates.find(c=>c.label===target.dataset.origin);inspectNode(c.id);}
    else if(target.hasAttribute('data-clear-angle')){state.angle=null;state.pinned=false;updateDirection();}
    else if(target.id==='rmx-extract'){interact();toggleExtraction();}
  });
  root.addEventListener('change',event=>{
    const t=event.target;
    if(t.id==='rmx-show-pruned'){interact();state.showPruned=t.checked;if(!t.checked&&!selectedNode().kept){state.input='root';state.group=null;}renderSearch();$('#rmx-show-pruned').focus({preventScroll:true});}
    else if(t.id==='rmx-node-select'){interact();inspectNode(t.value);$('#rmx-node-select').focus({preventScroll:true});}
    else if(t.id==='rmx-ground-contour'||t.id==='rmx-aerial-contour'){
      interact();state[t.id==='rmx-ground-contour'?'ground':'aerial']=t.checked;
      $$('[data-contour="'+(t.id==='rmx-ground-contour'?'ground':'aerial')+'"]').forEach(path=>path.style.opacity=t.checked?'1':'0');updateDirection();
    }
  });
  root.addEventListener('pointermove',event=>{const svg=event.target.closest('.rmx-polar');if(svg&&!state.pinned&&!state.extracting&&event.pointerType!=='touch'){state.angle=pointerAngle(event,svg);updateDirection();}});
  root.addEventListener('pointerout',event=>{const svg=event.target.closest('.rmx-polar');if(svg&&!svg.contains(event.relatedTarget)&&!state.pinned){state.angle=null;updateDirection();}});
  root.addEventListener('keydown',event=>{
    const target=event.target,svg=target.closest('.rmx-polar');
    if(event.key==='Escape'){interact();state.angle=null;state.pinned=false;if(state.view==='search'){state.group=null;renderSearch();$('#rmx-active-map')?.querySelector('[role="button"]')?.focus({preventScroll:true});}else if(state.view==='verification'){state.inspected=null;renderVerification();}updateDirection();event.preventDefault();}
    else if(target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const i=views.indexOf(state.view),next=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;changeView(views[next]);$('#rmx-tab-'+views[next]).focus();}
    else if(svg&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key)){
      event.preventDefault();interact();if(event.key==='Enter'||event.key===' '){state.pinned=!state.pinned;state.angle??=0;}else{state.angle=event.key==='Home'?0:event.key==='End'?359:((state.angle??0)+(['ArrowRight','ArrowUp'].includes(event.key)?1:359))%360;state.pinned=true;}updateDirection();
    }else if(target.matches('[role="button"]')&&['Enter',' '].includes(event.key)){event.preventDefault();target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
  });
  root.addEventListener('focusout',event=>{if(event.target.matches('.rmx-polar')&&!state.pinned){state.angle=null;updateDirection();}});
  panel.addEventListener('click',event=>{if(event.target.closest('button,[role="button"],[role="slider"],input,select,summary'))return;if(state.view==='search'&&state.group!==null){state.group=null;renderSearch();}else if(state.view==='verification'&&state.inspected){candidateInspect(null);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.extracting){stopExtraction();renderRings();}});
  const selector=$('#rm-case-select'),entries=window.RINGMATCH_CASES||[];
  entries.forEach(entry=>{const option=document.createElement('option');option.value=entry.id;option.textContent=entry.label;selector.append(option);});
  selector.value=root.dataset.defaultCase||'case-02';
  function loading(on){root.setAttribute('aria-busy',String(on));$('.rmx-workspace').setAttribute('aria-busy',String(on));panel.inert=on;$('#rm-case-loading').hidden=!on;$$('[data-view]').forEach(button=>button.disabled=on);}
  function imageReady(url){return new Promise((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>{if(image.decode)image.decode().then(resolve,reject);else resolve();};image.onerror=()=>reject(new Error('Image unavailable'));image.src=url;});}
  async function switchCase(id){
    if(!entries.some(entry=>entry.id===id))return;
    const version=++loadVersion;lastRequested=id;stopExtraction();loading(true);$('#rmx-status').textContent='';$('#rmx-retry').hidden=true;
    try{
      const trace=await window.loadRingMatchCase(id);
      await Promise.all([...new Set(['aerial','pano','depth','context','cropA','cropB','polarA','polarB'].map(key=>trace.assets[key]))].map(imageReady));
      if(version!==loadVersion)return;
      d=trace;state.loaded=true;state.input='root';state.group=null;state.inspected=null;state.angle=null;state.pinned=false;state.ground=true;state.aerial=true;state.points='clusters';
      selector.value=d.id;render();loading(false);
    }catch(error){
      if(version!==loadVersion)return;
      loading(false);state.loaded=!!panel.children.length;
      if(state.loaded)selector.value=d.id;
      $('#rmx-status').textContent='Unable to load case.';$('#rmx-retry').hidden=false;
    }
  }
  selector.addEventListener('change',()=>{interact();switchCase(selector.value);});
  function stepCase(delta){interact();const i=entries.findIndex(entry=>entry.id===selector.value),next=entries[(i+delta+entries.length)%entries.length];selector.value=next.id;switchCase(next.id);}
  $('#rm-case-prev').addEventListener('click',()=>stepCase(-1));$('#rm-case-next').addEventListener('click',()=>stepCase(1));
  $('#rmx-retry').addEventListener('click',()=>switchCase(lastRequested));
  function initialize(){if(initialized)return;initialized=true;switchCase(selector.value);}
  loading(true);
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();initialize();}},{rootMargin:'300px'});observer.observe(root);}else initialize();
})();
