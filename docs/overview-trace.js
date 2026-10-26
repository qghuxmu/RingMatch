/* Illustrative data. The search rules follow the submission; no model inference is performed. */
(() => {
  'use strict';
  const config = {samples:16, threshold:50, minSupport:2, clustersPerNode:3, budget:3, shortlist:2, schedule:[400,200,100,50], azimuths:360, maxDepth:80, minVerificationSeparation:10};
  const colors = ['#b27733','#417c9c','#8b729a','#56877d'];
  let seed=1020;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const crop=(p,size)=>{const w=size/400;return {x:Math.max(0,Math.min(1-w,p[0]-w/2)),y:Math.max(0,Math.min(1-w,p[1]-w/2)),w};};
  const root={id:'root',depth:0,p:[.5,.5],score:0,count:0,path:[],color:'#718363',input:{x:0,y:0,w:1},parent:null,kept:true};
  const nodes=[root],levels=[];
  const specs={
    root:[[7,.370,.540],[5,.816,.405],[3,.273,.102]],
    'h1':[[10,.376,.548],[4,.480,.660]],
    'h2':[[12,.816,.405],[3,.700,.300]],
    'h3':[[9,.278,.110],[5,.360,.210]],
    'h1.1':[[12,.374,.545],[3,.405,.600]],
    'h2.1':[[11,.815,.405],[4,.760,.445]],
    'h3.1':[[13,.280,.108],[2,.230,.150]],
    'h1.2':[[8,.482,.659],[6,.430,.630]],
    'h1.1.1':[[13,.375,.546],[2,.404,.580]],
    'h2.1.1':[[13,.816,.405],[2,.780,.440]],
    'h3.1.1':[[9,.278,.110],[6,.310,.140]],
    'h2.1.2':[[9,.760,.445],[5,.790,.470]]
  };
  function cluster(points,region){
    const groups=[],seen=new Set();
    for(let i=0;i<points.length;i++){
      if(seen.has(i))continue;
      const stack=[i],members=[];seen.add(i);
      while(stack.length){const a=stack.pop();members.push(a);for(let b=0;b<points.length;b++)if(!seen.has(b)&&Math.hypot(points[a][0]-points[b][0],points[a][1]-points[b][1])/region.w*1000<=config.threshold){seen.add(b);stack.push(b);}}
      groups.push({members,count:members.length,p:[0,1].map(k=>members.reduce((s,i)=>s+points[i][k],0)/members.length)});
    }
    return groups.sort((a,b)=>b.count-a.count);
  }
  let active=[root];
  config.schedule.forEach((extent,level)=>{
    const expanded=[];
    active.forEach(parent=>{
      const region=parent.depth===0?root.input:crop(parent.p,extent);parent.input=region;
      const plan=specs[parent.id];
      if(!plan)throw new Error('Missing illustrative expansion: '+parent.id);
      const points=[];
      plan.forEach(([n,x,y])=>{
        // Illustrative coordinate spread, with connected local clusters and exact planned centroids.
        const radius=n===2?.018:n===3?.025:.032,phase=random()*Math.PI*2;
        const offsets=Array.from({length:n},(_,i)=>{
          const angle=phase+i*Math.PI*2/n+(random()-.5)*.10,r=radius*(.88+random()*.20);
          return [Math.cos(angle)*r,Math.sin(angle)*r];
        });
        const mean=[0,1].map(k=>offsets.reduce((sum,o)=>sum+o[k],0)/n);
        offsets.forEach(o=>points.push([x+(o[0]-mean[0])*region.w,y+(o[1]-mean[1])*region.w]));
      });
      while(points.length<config.samples){const p=[region.x+(.1+random()*.8)*region.w,region.y+(.1+random()*.8)*region.w];if(points.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>region.w*.09))points.push(p);}
      const groups=cluster(points,region);parent.points=points;parent.groups=groups;
      const retained=groups.filter(g=>g.count>=config.minSupport).slice(0,config.clustersPerNode);
      retained.forEach((group,index)=>{
        const id=parent===root?'h'+(index+1):parent.id+'.'+(index+1);
        const child={id,parent:parent.id,depth:level+1,p:group.p,count:group.count,score:parent.score+group.count,path:[...parent.path,group.count],color:parent===root?colors[index]:parent.color,kept:false,members:group.members};
        nodes.push(child);expanded.push(child);group.child=id;
      });
    });
    const ranked=expanded.slice().sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
    const kept=ranked.slice(0,config.budget);kept.forEach(n=>n.kept=true);
    levels.push({extent,inputs:active.map(n=>n.id),children:expanded.map(n=>n.id),ranking:ranked.map(n=>n.id),kept:kept.map(n=>n.id)});
    active=kept;
  });
  const byId=Object.fromEntries(nodes.map(n=>[n.id,n]));
  const candidates=levels.at(-1).ranking.slice(0,2).map((id,i)=>({...byId[id],label:i===0?'A':'B'}));
  const ring=Array.from({length:360},(_,i)=>{
    const a=i*Math.PI/180;
    return Math.max(6,Math.min(77,13+49*Math.exp(-Math.pow(Math.sin(a-.62)/.28,2))+7*Math.sin(a*3+1)+3*Math.cos(a*7)));
  });
  const rings={ground:ring,A:ring.map((v,i)=>Math.max(5,Math.min(79,20+38*Math.exp(-Math.pow(Math.sin((i*Math.PI/180)-1.35)/.30,2))+6*Math.cos(i/21)))),B:ring.map((v,i)=>Math.max(4,Math.min(79,v+3.4*Math.sin(i/13)+2*Math.cos(i/29))))};
  window.RINGMATCH_TRACE={kind:'simulated',config,colors,nodes,byId,levels,candidates,rings,verification:{probabilities:{A:.17,B:.83},selected:'B',probabilityKind:'illustrative preference, not calibrated model output'},assets:{aerial:'assets/overview/search-aerial.webp',panorama:'assets/overview/search-panorama.webp',depth:'assets/overview/depth-map.webp'}};
})();
