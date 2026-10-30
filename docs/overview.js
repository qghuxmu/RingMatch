/* Replay recorded search, depth rings, and verifier decisions. */
(() => {
  'use strict';
  let d=window.RINGMATCH_TRACE;
  const root=document.querySelector('#rm-motion');
  if(!d||!root)return;
  const canvas=root.querySelector('canvas'),c=canvas.getContext('2d',{alpha:false});
  const $=s=>root.querySelector(s),duration=102,baselineSpeed=1.6875;
  const palette=['#d58b30','#238ac2','#aa70b4'];
  const state={time:0,playing:false,last:0,raf:0,mobile:false,w:1120,h:650,scale:1,loaded:false,playRequested:false,userPaused:false,resumeOnEnter:false,phase:'',frames:[],frameCount:0};
  let images={};
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=v=>{v=clamp(v);return v*v*v*(v*(v*6-15)+10);};
  const u=(t,a,b)=>smooth((t-a)/(b-a));
  const mix=(a,b,p)=>a+(b-a)*p;
  const blend=(a,b,p)=>'#'+[1,3,5].map(i=>Math.round(mix(parseInt(a.slice(i,i+2),16),parseInt(b.slice(i,i+2),16),p)).toString(16).padStart(2,'0')).join('');
  const rect=(a,b,p)=>({x:mix(a.x,b.x,p),y:mix(a.y,b.y,p),w:mix(a.w,b.w,p),h:mix(a.h??a.w,b.h??b.w,p)});
  const n=id=>d.byId[id];
  const kids=id=>d.nodes.filter(node=>node.parent===id).sort((a,b)=>a.p[1]-b.p[1]||a.p[0]-b.p[0]||a.id.localeCompare(b.id));
  const family=node=>node.id==='root'?'#7b8c6a':palette[node.familyIndex%palette.length];
  const score=value=>String(Math.round(value));
  const probabilityText=value=>{
    const percent=value*100;
    return percent>0&&percent<.01?'<0.01%':percent>99.99&&percent<100?'>99.99%':percent.toFixed(2)+'%';
  };
  const chosen=label=>d.candidates.find(x=>x.label===label);
  let shortlistedIds=new Set(d.candidates.map(candidate=>candidate.id));
  function region(node,extent){const w=extent/400;return {x:clamp(node.p[0]-w/2,0,1-w),y:clamp(node.p[1]-w/2,0,1-w),w};}
  function mapPoint(p,box,r){return {x:box.x+(p[0]-r.x)/r.w*box.w,y:box.y+(p[1]-r.y)/r.w*(box.h??box.w)};}
  const withAlpha=(alpha,fn)=>{if(alpha<=.001)return;c.save();c.globalAlpha*=clamp(alpha);fn();c.restore();};
  function text(str,x,y,size=13,color='#66765a',align='left',weight=400){c.font=`${weight} ${size}px "Helvetica Neue",Arial,sans-serif`;c.textAlign=align;c.textBaseline='alphabetic';c.fillStyle=color;c.fillText(str,x,y);}
  function rounded(box,r=5){c.beginPath();c.roundRect(box.x,box.y,box.w,box.h??box.w,r);}
  function circle(x,y,r,fill,stroke=null,width=1){c.beginPath();c.arc(x,y,Math.max(.01,r),0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
  function pill(str,x,y,color='#5b7543',size=12){c.font=`600 ${size}px Arial`;const w=c.measureText(str).width+13;rounded({x:x-w/2,y:y-12,w,h:20},5);c.fillStyle=color;c.fill();text(str,x,y+2,size,'#fff','center',600);}
  function imageIn(img,box,{cover=false}={}){
    if(!img?.complete||!img.naturalWidth){c.fillStyle='#eef2e9';c.fillRect(box.x,box.y,box.w,box.h??box.w);return;}
    const h=box.h??box.w;let sx=0,sy=0,sw=img.naturalWidth,sh=img.naturalHeight;
    if(cover){const target=box.w/h;if(sw/sh>target){const w=sh*target;sx=(sw-w)/2;sw=w;}else{const height=sw/target;sy=(sh-height)*.43;sh=height;}}
    c.drawImage(img,sx,sy,sw,sh,box.x,box.y,box.w,h);
  }
  function cropImage(r,box,color='#a2b18e',opacity=1,dim=.08){
    withAlpha(opacity,()=>{c.save();rounded(box,5);c.clip();if(images.aerial?.naturalWidth)c.drawImage(images.aerial,r.x*images.aerial.naturalWidth,r.y*images.aerial.naturalHeight,r.w*images.aerial.naturalWidth,r.w*images.aerial.naturalHeight,box.x,box.y,box.w,box.h??box.w);else{c.fillStyle='#edf1e7';c.fillRect(box.x,box.y,box.w,box.h??box.w);}c.fillStyle=`rgba(20,30,14,${dim})`;c.fillRect(box.x,box.y,box.w,box.h??box.w);c.restore();rounded(box,5);c.strokeStyle='#fff';c.lineWidth=4;c.stroke();rounded(box,5);c.strokeStyle=color;c.lineWidth=1.35;c.stroke();});
  }
  function cubic(a,b,p,bend=0){const dx=b.x-a.x,dy=b.y-a.y,p1={x:a.x+dx*.46,y:a.y+bend},p2={x:b.x-dx*.46,y:b.y-bend};const q=1-p;return {x:q*q*q*a.x+3*q*q*p*p1.x+3*q*p*p*p2.x+p*p*p*b.x,y:q*q*q*a.y+3*q*q*p*p1.y+3*q*p*p*p2.y+p*p*p*b.y};}
  function connection(a,b,progress,color,width=1.5,{alpha=1,bend=0}={}){
    if(progress<=0)return;withAlpha(alpha,()=>{c.beginPath();c.moveTo(a.x,a.y);const steps=34;for(let i=1;i<=steps;i++){const p=cubic(a,b,progress*i/steps,bend);c.lineTo(p.x,p.y);}c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();});
  }
  function vertical(index,count,x,maxSize){const pitch=575/Math.max(1,count),w=Math.min(maxSize,pitch-22);return {x,y:45+index*pitch+(pitch-w-18)/2,w};}
  function mobileRow(index,count,y,maxSize=110){const pitch=520/Math.max(1,count),w=Math.min(maxSize,pitch-15);return {x:20+index*pitch+(pitch-w)/2,y,w};}
  function mobilePool(index,count,y){const cols=Math.min(4,count),rows=Math.ceil(count/cols),w=Math.min(105,520/cols-20);return {x:20+(index%cols)*520/cols+(520/cols-w)/2,y:y+Math.floor(index/cols)*140,w};}
  function layout(){
    if(!state.mobile)return {root:{x:24,y:223,w:268},pano:{x:24,y:72,w:268,h:105},col200:kids('root').map((node,i)=>vertical(i,kids('root').length,365,156)),all100:i=>vertical(i,column100Order.length,625,76),kept100:i=>vertical(i,kept100Order.length,625,100),all50:i=>vertical(i,pool50Order.length,835,76),col50:i=>vertical(i,col50Order.length,825,96),shortlist:i=>({x:975,y:168+i*210,w:120}),verify:{pano:{x:35,y:76,w:400,h:125},depth:{x:35,y:270,w:400,h:125},ring:{x:235,y:520,r:80},patches:[{x:580,y:76,w:190},{x:870,y:76,w:190}],predictor:{x:580,y:328,w:480,h:46},plots:[{x:675,y:520,r:80},{x:965,y:520,r:80}],model:{x:783,y:570,w:207,h:43},output:{x:35,y:229,w:380}}};
    return {root:{x:155,y:186,w:250},pano:{x:155,y:62,w:250,h:86},col200:kids('root').map((node,i)=>mobileRow(i,kids('root').length,500,145)),all100:i=>mobilePool(i,column100Order.length,760),kept100:i=>mobileRow(i,kept100Order.length,820),all50:i=>mobilePool(i,pool50Order.length,1000),col50:i=>mobileRow(i,col50Order.length,1040),shortlist:i=>({x:118+i*215,y:1230,w:130}),verify:{pano:{x:65,y:82,w:430,h:130},depth:{x:65,y:326,w:430,h:130},ring:{x:280,y:629,r:80},patches:[{x:60,y:795,w:180},{x:320,y:795,w:180}],predictor:{x:60,y:1015,w:440,h:46},plots:[{x:150,y:1210,r:80},{x:410,y:1210,r:80}],model:{x:170,y:1332,w:220,h:48},output:{x:65,y:282,w:430}}};
  }
  let column100Order,kept100Order,col50Order,pool50Order;
  function updateOrders(){
    shortlistedIds=new Set(d.candidates.map(candidate=>candidate.id));
    column100Order=kids('root').filter(parent=>parent.kept).flatMap(parent=>kids(parent.id).map(node=>node.id));
    kept100Order=column100Order.filter(id=>n(id).kept);
    pool50Order=kept100Order.flatMap(id=>kids(id).map(node=>node.id));
    col50Order=pool50Order.filter(id=>n(id).kept);
  }
  updateOrders();
  function searchView(node,t=state.time){
    const expand=node.depth===1?u(t,18.5,19.5)*(1-u(t,24.3,25)):node.depth===2?u(t,34.5,35.5)*(1-u(t,40.3,41)):0;
    return expand&&node.zoomContext?rect(node.input,node.zoomContext,expand):node.input;
  }
  function box100(id,t,L){const initial=L.all100(column100Order.indexOf(id)),k=kept100Order.indexOf(id);return k<0?initial:rect(initial,L.kept100(k),u(t,28,29.5));}
  function sourceCrop(parent,child,parentBox,extent){const a=searchView(parent),b=child.input||region(child,extent);return {x:parentBox.x+(b.x-a.x)/a.w*parentBox.w,y:parentBox.y+(b.y-a.y)/a.w*parentBox.w,w:b.w/a.w*parentBox.w};}
  function card(node,box,extent,opacity,scoreProgress=1,dim=.09,rejected=0){
    // Use the recorded next request bounds, including boundary-adjusted crops.
    const r=searchView(node)||region(node,extent);
    cropImage(r,box,blend(family(node),'#b6bcae',rejected),opacity,dim+rejected*.62);
    if(node.input&&r.w>node.input.w+1e-5){
      const point=mapPoint([node.input.x,node.input.y],box,r),query={x:point.x,y:point.y,w:node.input.w/r.w*box.w};
      withAlpha(opacity,()=>{c.save();rounded(box,5);c.clip();
        c.setLineDash([3,3]);c.strokeStyle='#fff';c.lineWidth=2.7;c.strokeRect(query.x,query.y,query.w,query.w);c.strokeStyle='#526647';c.lineWidth=.9;c.strokeRect(query.x,query.y,query.w,query.w);c.setLineDash([]);
        c.fillStyle='#4e6248dd';c.fillRect(query.x+2,query.y+2,25,12);text('Input',query.x+5,query.y+11,8,'#fff');c.restore();});
    }
    const supportGap=node.depth>=2?14:17;
    withAlpha(opacity,()=>{text('S '+score(node.score),box.x+box.w/2,box.y+box.w+supportGap,state.mobile?13:10.5,blend('#6b7c5d','#a0a99a',rejected),'center',500);});
  }
  function samples(node,box,start,clusterAt,t,{root=false,shortlist=false}={}){
    if(!node.points||t<start)return;
    const r=searchView(node),grouping=u(t,clusterAt,clusterAt+1.15);
    const scale=root?1:clamp(box.w/140,.68,1),dot=root?3.5:2.5*scale,stagger=root?.145:.115;
    // Predictions appear at their sampled coordinates. Clustering never moves them.
    node.points.forEach((raw,i)=>{
      const a=u(t,start+i*stagger,start+i*stagger+.32);
      if(!a)return;
      const group=node.groups.find(g=>g.members.includes(i)),child=group.child?n(group.child):null;
      const rejected=shortlist&&child&&!shortlistedIds.has(child.id)?u(t,55,56.3):0;
      const p=mapPoint(raw,box,r),alpha=a*(child?1:1-grouping*.8)*(1-rejected*.82);
      if(p.x<box.x||p.x>box.x+box.w||p.y<box.y||p.y>box.y+box.w)return;
      withAlpha(alpha,()=>circle(p.x,p.y,dot,blend(blend('#2399d4',child?family(child):'#a4ad99',grouping),'#c8cec0',rejected),'#fff',root?1.25:1));
    });
    withAlpha(u(t,start+.1,start+.6)*(1-grouping),()=>pill(String(Math.min(node.points.length,Math.max(0,Math.floor((t-start)/stagger)+1))),box.x+box.w-15,box.y+17,'#435e38',root?12:10));
    // Group boundaries and centroid symbols fade in while the observations stay visible.
    kids(node.id).forEach(child=>{
      const rejected=shortlist&&!shortlistedIds.has(child.id)?u(t,55,56.3):0,color=blend(family(child),'#c8cec0',rejected);
      withAlpha(grouping*(1-rejected*.82),()=>{
      const pts=child.members.map(i=>mapPoint(node.points[i],box,r)),p=mapPoint(child.p,box,r);
      if(p.x<box.x||p.x>box.x+box.w||p.y<box.y||p.y>box.y+box.w)return;
      const rx=Math.max(root?12:8,...pts.map(q=>Math.abs(q.x-p.x)+(root?6:4)));
      const ry=Math.max(root?12:8,...pts.map(q=>Math.abs(q.y-p.y)+(root?6:4)));
      c.beginPath();c.ellipse(p.x,p.y,rx,ry,0,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=1.3;c.stroke();
      const arm=root?4.5:3;
      c.beginPath();c.moveTo(p.x-arm,p.y);c.lineTo(p.x+arm,p.y);c.moveTo(p.x,p.y-arm);c.lineTo(p.x,p.y+arm);
      c.strokeStyle='#fff';c.lineWidth=3;c.stroke();c.strokeStyle=color;c.lineWidth=1.4;c.stroke();
      pill(String(child.count),p.x,p.y-ry-10,color,root?12:10);
    });});
  }
  function cropRevealBox(box,progress){
    const scale=mix(.88,1,progress),inset=box.w*(1-scale)/2;
    return {x:box.x+inset,y:box.y+inset,w:box.w*scale};
  }
  function cropGuide(parent,child,parentBox,childBox,extent,start,t){
    const alpha=u(t,start-.45,start-.05)*(1-u(t,start+2.65,start+3.5));
    if(alpha<=0)return;
    const source=sourceCrop(parent,child,parentBox,extent),color=family(child),progress=u(t,start+.05,start+.80);
    // Matching corners make the crop-to-inset correspondence explicit; no image tile flies across the tree.
    const x0=clamp(source.x,parentBox.x,parentBox.x+parentBox.w),x1=clamp(source.x+source.w,parentBox.x,parentBox.x+parentBox.w),y0=clamp(source.y,parentBox.y,parentBox.y+parentBox.w),y1=clamp(source.y+source.w,parentBox.y,parentBox.y+parentBox.w);
    const from=state.mobile?[{x:x0,y:y1},{x:x1,y:y1}]:[{x:x1,y:y0},{x:x1,y:y1}];
    const to=state.mobile?[{x:childBox.x,y:childBox.y},{x:childBox.x+childBox.w,y:childBox.y}]:[{x:childBox.x,y:childBox.y},{x:childBox.x,y:childBox.y+childBox.w}];
    from.forEach((point,i)=>connection(point,to[i],progress,color,1.1,{alpha:alpha*.48}));
    withAlpha(alpha,()=>{
      c.fillStyle=color+'16';c.fillRect(source.x,source.y,source.w,source.w);
      c.strokeStyle='#fff';c.lineWidth=3.6;c.strokeRect(source.x,source.y,source.w,source.w);
      c.strokeStyle=color;c.lineWidth=1.7;c.strokeRect(source.x,source.y,source.w,source.w);
      const arm=Math.min(9,source.w*.18);
      c.beginPath();[[0,0,1,1],[1,0,-1,1],[0,1,1,-1],[1,1,-1,-1]].forEach(([x,y,dx,dy])=>{const px=source.x+x*source.w,py=source.y+y*source.w;c.moveTo(px+dx*arm,py);c.lineTo(px,py);c.lineTo(px,py+dy*arm);});
      c.strokeStyle=color;c.lineWidth=2.8;c.stroke();
    });
  }
  function headers(t,L){
    text('Multi-hypothesis search',24,27,15,'#3d5132','left',550);
    if(!state.mobile){
      text('400 m',L.root.x+L.root.w/2,L.root.y-12,12,'#819171','center');
      const headerY=28,initial100=L.all100(0),retained100=L.kept100(0);
      withAlpha(u(t,10,11),()=>text('200 m',L.col200[0].x+L.col200[0].w/2,headerY,12,'#819171','center'));
      withAlpha(u(t,20,21),()=>text('100 m',mix(initial100.x+initial100.w/2,retained100.x+retained100.w/2,u(t,28,29.5)),headerY,12,'#819171','center'));
      withAlpha(u(t,36,37),()=>text('50 m',L.col50(0).x+L.col50(0).w/2,headerY,12,'#819171','center'));
      withAlpha(u(t,59.3,60),()=>text('Top 2',L.shortlist(0).x+L.shortlist(0).w/2,headerY,12,'#819171','center'));
    }else{
      text('400 m',280,L.root.y-14,16,'#7a8d69','center');
      withAlpha(u(t,10,11),()=>text('200 m',280,476,16,'#7a8d69','center'));
      withAlpha(u(t,20,21),()=>text('100 m',280,735,16,'#7a8d69','center'));
      withAlpha(u(t,36,37),()=>text('50 m',280,976,16,'#7a8d69','center'));
      withAlpha(u(t,59.3,60),()=>text('Top 2',280,1208,16,'#7a8d69','center'));
    }
  }
  function pool50Box(index,t,L){
    const initial=L.all50(index);
    const id=pool50Order[index],k=col50Order.indexOf(id);
    return k<0?initial:rect(initial,L.col50(k),u(t,44,45.5));
  }
  function survivorOutline(box,node,progress){
    withAlpha(progress,()=>{rounded({x:box.x-2,y:box.y-2,w:box.w+4,h:box.w+4},6);c.strokeStyle=family(node);c.lineWidth=2;c.stroke();});
  }
  function leafScores(t,L){
    if(t<51)return;
    col50Order.forEach((id,index)=>{
      const parent=n(id),b=L.col50(index);kids(id).forEach((leaf,j)=>{
        const source=mapPoint(leaf.p,b,parent.input);
        const siblings=kids(id),target=state.mobile?{x:b.x+b.w*(j+1)/(siblings.length+1),y:1180}:{x:958,y:b.y+17+j*Math.min(26,(b.w-10)/siblings.length)};
        const p=u(t,51+j*.12,52.5+j*.12),best=shortlistedIds.has(leaf.id),retention=u(t,55,56.3),rejected=best?0:retention;
        const shortlistFade=u(t,58.9,59.3),alpha=p*(1-shortlistFade)*(1-rejected*.7),color=blend(family(leaf),'#c8cec0',rejected);
        connection(source,target,p,color,mix(1.2,best?2:1,retention),{alpha:alpha*(1-rejected*.6)});
        withAlpha(alpha,()=>{
          circle(source.x,source.y,3.2,color,'white',1.4);
          circle(target.x,target.y,mix(4,best?6:3.5,retention),color,'white',1.6);
          text(score(leaf.score),target.x+(state.mobile?0:10),target.y+(state.mobile?20:4),state.mobile?11:11,rejected>.5?'#a5aea0':'#536d3e',state.mobile?'center':'left',best&&retention>.5?600:400);
        });
      });
    });
  }
  function drawSearch(t,L){
    headers(t,L);
    const rootNode=n('root'),children=kids('root');
    const spawn200=children.map((node,i)=>{const start=10+i*.58,p=u(t,start+.65,start+2.25),end=L.col200[i];return {node,start,p,box:cropRevealBox(end,p),end};});
    spawn200.forEach(({node,p,end})=>connection(mapPoint(node.p,L.root,rootNode.input),{x:end.x,y:end.y+end.w/2},p,family(node),1.5+node.count*.14,{alpha:p*(1-u(t,9.55,10)* (1-u(t,13.8,14.7)))}));
    // Replay the recorded global pruning decision, then compact the retained hypotheses.
    const out100=column100Order.map((id,i)=>{
      const node=n(id),parent=n(node.parent),pb=L.col200[children.findIndex(x=>x.id===parent.id)];
      const start=20+(i%2)*.8,p=u(t,start+.65,start+2.3),target=box100(id,t,L),rejected=node.kept?0:u(t,25,26.5);
      return {node,parent,start,p,target,box:cropRevealBox(target,p),rejected,alpha:p*(node.kept?1:1-u(t,28,29.5)),pb};
    });
    out100.forEach(o=>connection(mapPoint(o.node.p,o.pb,searchView(o.parent)),{x:o.target.x,y:o.target.y+o.target.w/2},o.p,blend(family(o.node),'#cbd0c5',o.rejected),1.8,{alpha:o.alpha*(1-u(t,19.55,20)*(1-u(t,23.45,24.3)))}));
    // All recorded alternatives precede the next global top-B decision.
    const all50=pool50Order.map((id,i)=>{
      const node=n(id),parent=n(node.parent),pb=box100(parent.id,t,L),start=36+(i%2)*.8,p=u(t,start+.65,start+2.3),target=pool50Box(i,t,L);
      const rejected=node.kept?0:u(t,41,42.5);
      return {node,parent,start,p,pb,target,box:cropRevealBox(target,p),rejected,alpha:p*(node.kept?1:1-u(t,44,45.5))};
    });
    all50.forEach(o=>connection(mapPoint(o.node.p,o.pb,searchView(o.parent)),{x:o.target.x,y:o.target.y+o.target.w/2},o.p,blend(family(o.node),'#cbd0c5',o.rejected),1.5,{alpha:o.alpha*(1-u(t,35.55,36)*(1-u(t,39.45,40.3)))}));
    cropImage(rootNode.input,L.root,'#c2ceb5',1,.15);
    samples(rootNode,L.root,2,6,t,{root:true});
    spawn200.forEach(o=>cropGuide(rootNode,o.node,L.root,o.box,200,o.start,t));
    spawn200.forEach(({node,p,box})=>{if(p<=0)return;card(node,box,200,p,p);if(p>.99)samples(node,box,14,17,t);});
    out100.forEach(o=>cropGuide(o.parent,o.node,o.pb,o.box,100,o.start,t));
    out100.forEach(o=>{
      if(o.p<=0)return;const descendantsSurvive=d.levels[2].kept.some(id=>n(id).parent===o.node.id);
      const historyDim=o.node.kept&&!descendantsSurvive?u(t,41,42.5)*.55:0;
      card(o.node,o.box,100,o.alpha,o.p,.09,Math.max(o.rejected,historyDim));
      if(o.node.kept){survivorOutline(o.box,o.node,u(t,25,26.5)*(1-u(t,30,31)));if(t>=30){const parentSurvives=d.levels[2].kept.some(id=>n(id).parent===o.node.id);withAlpha(1-u(t,41,42.5)*(parentSurvives?0:.70),()=>samples(o.node,o.box,30,33,t));}}
    });
    all50.forEach(o=>cropGuide(o.parent,o.node,o.pb,o.box,50,o.start,t));
    all50.forEach(o=>{if(o.p<=0)return;const descendantsSurvive=d.candidates.some(candidate=>candidate.parent===o.node.id);
      const historyDim=o.node.kept&&!descendantsSurvive?u(t,55,56.3)*.62:0;
      card(o.node,o.box,50,o.alpha,o.p,.09,Math.max(o.rejected,historyDim));if(o.node.kept){survivorOutline(o.box,o.node,u(t,41,42.5)*(1-u(t,46,47)));if(t>=46)withAlpha(1-historyDim,()=>samples(o.node,o.box,46,49,t,{shortlist:true}));}});
    // Draw after the image cards so each score line stays visible all the way to its centroid.
    leafScores(t,L);
  }
  const selection=t=>u(t,91,92.5);
  function evidenceLayout(t,L){return {...L.verify,bundle:0,output:0};}
  function pano(t,L){
    const V=evidenceLayout(t,L),b=rect(L.pano,V.pano,u(t,64,66));
    text('Ground panorama',b.x,b.y-12,state.mobile?15:12,'#738466');
    c.save();rounded(b,4);c.clip();imageIn(images.pano,b,{cover:true});c.restore();
    return b;
  }
  function patchImage(candidate,box,color=family(candidate),opacity=1,dim=0){
    cropImage(candidate.crop,box,color,opacity,dim);
    const point=mapPoint(candidate.p,box,candidate.crop);
    withAlpha(opacity,()=>circle(point.x,point.y,box.w<60?1.8:2.8,color,'#fff',.9));
  }
  function horizonY(img,box){
    if(!img?.naturalWidth)return box.y+box.h/2;
    const sourceHeight=Math.min(img.naturalHeight,img.naturalWidth/(box.w/box.h)),top=(img.naturalHeight-sourceHeight)*.43;
    return box.y+(img.naturalHeight/2-top)/sourceHeight*box.h;
  }
  function groundDepth(V,opacity=1){
    const box=V.depth;
    withAlpha(opacity,()=>{
      text('Depth map',box.x,box.y-12,state.mobile?15:12,'#738466');
      c.save();rounded(box,4);c.clip();imageIn(images.depth,box,{cover:true});
      withAlpha(u(state.time,68.8,70),()=>{
        const height=state.mobile?7:5,y=horizonY(images.depth,box),top=y-height/2,bottom=y+height/2;
        c.fillStyle='rgba(16,25,20,.62)';
        c.fillRect(box.x,box.y,box.w,top-box.y);
        c.fillRect(box.x,bottom,box.w,box.y+box.h-bottom);
        c.fillStyle='rgba(224,255,151,.24)';c.fillRect(box.x,top,box.w,height);
        c.strokeStyle='#ddf3ad';c.lineWidth=1.6;c.strokeRect(box.x,top,box.w,height);
        const extraction=u(state.time,70.5,75);
        if(extraction>0&&extraction<1){
          const scanX=box.x+box.w*extraction;
          c.fillStyle='rgba(239,255,198,.32)';c.fillRect(Math.max(box.x,scanX-5),top,Math.min(10,box.x+box.w-Math.max(box.x,scanX-5)),height);
          c.strokeStyle='#f4ffd5';c.lineWidth=2.2;c.beginPath();c.moveTo(scanX,y-height*1.7);c.lineTo(scanX,y+height*1.7);c.stroke();
        }
      });
      c.restore();
    });
  }
  function plotAxes(center,alpha=1){withAlpha(alpha,()=>{[.25,.5,.75,1].forEach(k=>circle(center.x,center.y,center.r*k,null,'#e0e7da',.8));c.strokeStyle='#e3e9dd';c.lineWidth=.7;c.beginPath();c.moveTo(center.x-center.r,center.y);c.lineTo(center.x+center.r,center.y);c.moveTo(center.x,center.y-center.r);c.lineTo(center.x,center.y+center.r);c.stroke();});}
  function ring(values,center,color,progress=1,width=2,alpha=1){if(progress<=0)return;withAlpha(alpha,()=>{c.beginPath();const count=Math.max(1,Math.floor(clamp(progress)*359));for(let i=0;i<=count;i++){const a=i*Math.PI/180,r=values[i]/80*center.r,x=center.x+Math.sin(a)*r,y=center.y-Math.cos(a)*r;if(i)c.lineTo(x,y);else c.moveTo(x,y);}if(progress>=.999)c.closePath();c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();});}
  function dotAtRing(values,center,phi,color){const a=phi*Math.PI/180,r=values[phi]/80*center.r;circle(center.x+Math.sin(a)*r,center.y-Math.cos(a)*r,3.1,color,'white',1);}
  function patchBox(index,t,L){return rect(L.shortlist(index),evidenceLayout(t,L).patches[index],u(t,64,66));}
  function candidates(t,L){
    d.candidates.forEach((candidate,index)=>{
      const appear=u(t,59.3+index*.15,61+index*.15);if(!appear)return;
      const b=patchBox(index,t,L),low=candidate.label===d.verification.selected?0:selection(t),bundle=evidenceLayout(t,L).bundle;
      const parentNode=n(candidate.parent),parentBox=L.col50(col50Order.indexOf(candidate.parent));
      const point=mapPoint(candidate.p,parentBox,parentNode.input),flow=u(t,59.3+index*.15,60.6+index*.15);
      const target=state.mobile?{x:b.x+b.w/2,y:b.y-8}:{x:b.x-8,y:b.y+b.w/2};
      arrow(point,target,flow,family(candidate),1-u(t,63.3,64),state.mobile);
      withAlpha(appear*(1-u(t,63.3,64)),()=>{
        circle(point.x,point.y,8,null,family(candidate),2.2);
        pill(candidate.label,parentBox.x+parentBox.w-12,parentBox.y+18,family(candidate),11);
      });
      patchImage(candidate,b,blend(family(candidate),'#aeb7a6',low),appear*(1-low*.55),.02+low*.30);
      withAlpha(appear*(1-low*.72),()=>{
        text(bundle>.6?'Candidate '+candidate.label:candidate.label,b.x+4,b.y-10,state.mobile?17:14,family(candidate),'left',600);
        withAlpha(1-bundle,()=>text('S '+score(candidate.score),b.x+b.w,b.y-10,state.mobile?15:11,'#819174','right'));
        withAlpha(1-u(t,64,66),()=>text('Search rank '+candidate.searchRank,b.x+b.w/2,b.y+b.w+18,state.mobile?13:10,'#859478','center'));
        withAlpha(bundle,()=>text('['+candidate.p.map(v=>Math.round(v*1000)).join(', ')+']',b.x+b.w/2,b.y+b.w+22,state.mobile?14:12,'#7a886d','center'));
      });
      withAlpha(selection(t)*(candidate.label===d.verification.selected?1:0),()=>{rounded({x:b.x-4,y:b.y-4,w:b.w+8,h:b.w+8},7);c.strokeStyle='#6b9550';c.lineWidth=3;c.stroke();pill(candidate.label,b.x+b.w-1,b.y+b.w-2,'#628a47',13);});
    });
  }
  function arrow(a,b,progress,color='#78935e',alpha=1,vertical=false){
    if(progress<=0)return;
    const point=vertical?(p=>{
      const q=1-p,dy=b.y-a.y,p1={x:a.x,y:a.y+dy*.46},p2={x:b.x,y:b.y-dy*.46};
      return {x:q*q*q*a.x+3*q*q*p*p1.x+3*q*p*p*p2.x+p*p*p*b.x,y:q*q*q*a.y+3*q*q*p*p1.y+3*q*p*p*p2.y+p*p*p*b.y};
    }):(p=>cubic(a,b,p));
    withAlpha(alpha,()=>{
      c.beginPath();c.moveTo(a.x,a.y);for(let i=1;i<=34;i++){const p=point(progress*i/34);c.lineTo(p.x,p.y);}c.strokeStyle=color;c.lineWidth=1.8;c.stroke();
      withAlpha(u(progress,.85,1),()=>{const tangent=point(.995),angle=Math.atan2(b.y-tangent.y,b.x-tangent.x);c.beginPath();c.moveTo(b.x-7*Math.cos(angle-.45),b.y-7*Math.sin(angle-.45));c.lineTo(b.x,b.y);c.lineTo(b.x-7*Math.cos(angle+.45),b.y-7*Math.sin(angle+.45));c.stroke();});
    });
  }
  function verification(t,L){
    const V=evidenceLayout(t,L),fade=u(t,64,66);if(!fade)return;
    text('Depth-ring verification',24,27,15,'#3d5132','left',550);
    depthFlow(t,V);groundDepth(V,u(t,67.25,68.5));
    const extraction=u(t,70.5,75),groundAlpha=u(t,70.5,71.2);
    withAlpha(groundAlpha,()=>{plotAxes(V.ring);ring(d.displayRings.ground,V.ring,'#343f2d',extraction,2.1);text('Ground ring',V.ring.x,V.ring.y+V.ring.r+27,state.mobile?15:12,'#596e48','center',500);});
    if(extraction>0&&extraction<1){
      const phi=Math.floor(extraction*359),angle=phi*Math.PI/180;
      withAlpha(groundAlpha,()=>{
        c.beginPath();c.moveTo(V.ring.x,V.ring.y);c.lineTo(V.ring.x+Math.sin(angle)*V.ring.r,V.ring.y-Math.cos(angle)*V.ring.r);c.strokeStyle='#93aa78';c.lineWidth=1;c.stroke();
        dotAtRing(d.displayRings.ground,V.ring,phi,'#56763e');
      });
    }
    aerialPredictor(t,V);
    const ringStart=u(t,77.2,80.2);
    V.plots.forEach((plot,index)=>{
      const candidate=d.candidates[index],col=family(candidate),appear=u(t,77.1+index*.1,77.7+index*.1);
      withAlpha(appear,()=>{plotAxes(plot);ring(d.displayRings[candidate.label],plot,col,ringStart,2.5);text('Aerial ring '+candidate.label,plot.x,plot.y+plot.r+27,state.mobile?15:12,'#596e48','center',500);});
    });
  }
  function aerialPredictor(t,V){
    const box=V.predictor,show=u(t,75.2,75.8);
    V.patches.forEach((patch,index)=>{
      const plot=V.plots[index],color=family(d.candidates[index]);
      arrow({x:patch.x+patch.w/2,y:patch.y+patch.w+10},{x:plot.x,y:box.y-6},u(t,75.8,76.5),color,1,true);
      arrow({x:plot.x,y:box.y+box.h+6},{x:plot.x,y:plot.y-plot.r-10},u(t,76.5,77.2),color,1,true);
    });
    withAlpha(show,()=>{
      rounded(box,6);c.fillStyle='#f7faf3';c.fill();c.strokeStyle='#c4d2b8';c.lineWidth=1.2;c.stroke();
      text('Aerial-to-ring predictor',box.x+box.w/2,box.y+box.h/2+5,state.mobile?15:14,'#536b41','center',550);
    });
  }
  function depthFlow(t,V){
    arrow({x:V.pano.x+V.pano.w/2,y:V.pano.y+V.pano.h+8},
      {x:V.depth.x+V.depth.w/2,y:V.depth.y-8},u(t,66.2,67.25),'#91a47c',1,true);
    const start={x:V.depth.x+V.depth.w/2,y:V.depth.y+V.depth.h+10};
    const end={x:V.ring.x,y:V.ring.y-V.ring.r-10};
    arrow(start,end,u(t,69.8,70.5),'#91a47c',1,true);
  }
  function decisionLayout(){
    if(state.mobile)return {
      board:{x:24,y:58,w:512,h:704},pano:{x:44,y:130,w:300,h:94},context:{x:384,y:120,w:132},
      patches:[{x:62,y:295,w:180},{x:318,y:295,w:180}],plots:[{x:152,y:630,r:85},{x:408,y:630,r:85}],
      model:{x:195,y:805,w:170,h:64},rows:[{x:44,y:946,w:218,h:70},{x:298,y:946,w:218,h:70}],
      map:{x:128,y:1104,w:304},outputTitle:{x:44,y:921}
    };
    return {
      board:{x:24,y:62,w:490,h:560},pano:{x:44,y:119,w:450,h:100},context:{x:50,y:327,w:140},
      patches:[{x:212,y:289,w:120},{x:362,y:289,w:120}],plots:[{x:272,y:525,r:65},{x:422,y:525,r:65}],
      model:{x:555,y:159,w:136,h:88},rows:[{x:750,y:141,w:328,h:54},{x:750,y:211,w:328,h:54}],
      map:{x:770,y:322,w:288},outputTitle:{x:750,y:111}
    };
  }
  function panoramaImage(box,opacity=1){
    withAlpha(opacity,()=>{c.save();rounded(box,4);c.clip();imageIn(images.pano,box,{cover:true});c.restore();});
  }
  function candidateMarker(candidate,box,{opacity=1,selected=false,large=false}={}){
    const point=mapPoint(candidate.p,box,{x:0,y:0,w:1}),color=family(candidate);
    withAlpha(opacity,()=>{
      if(selected&&large){circle(point.x,point.y,19,color+'24');circle(point.x,point.y,14,null,'#fff',5);}
      circle(point.x,point.y,large?(selected?7:5):3.7,color,'#fff',large?2.3:1.2);
      if(selected)circle(point.x,point.y,large?14:8,null,color,large?3:1.2);
      if(large){
        const offset=selected?21:9,left=point.x>box.x+box.w-(selected?45:28);
        mapLabel(candidate.label,point.x+(left?-offset:offset),clamp(point.y+(selected?19:-7),box.y+15,box.y+box.w-4),color,left?'right':'left',selected?16:14);
      }else text(candidate.label,point.x+8,point.y-6,10,color,'left',600);
    });
  }
  function mapLabel(label,x,y,color,align='left',size=13){
    c.font=`600 ${size}px Arial`;c.textAlign=align;c.textBaseline='alphabetic';c.strokeStyle='#fff';c.lineWidth=4;c.lineJoin='round';c.strokeText(label,x,y);text(label,x,y,size,color,align,600);
  }
  function star(x,y,r,fill='#293d22'){
    c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.43:r,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;if(i)c.lineTo(px,py);else c.moveTo(px,py);}c.closePath();c.strokeStyle='#fff';c.lineWidth=2;c.stroke();c.fillStyle=fill;c.fill();
  }
  function groundTruthMarker(box){
    const point=mapPoint(d.groundTruth,box,{x:0,y:0,w:1});
    const label={x:clamp(point.x-22,box.x+29,box.x+box.w-30),y:clamp(point.y-20,box.y+18,box.y+box.w-18)};
    c.beginPath();c.moveTo(point.x-5,point.y-6);c.lineTo(label.x+4,label.y+3);c.strokeStyle='#fff';c.lineWidth=3;c.stroke();c.strokeStyle='#435439';c.lineWidth=1;c.stroke();
    star(point.x,point.y,8);mapLabel('GT',label.x,label.y,'#293d22','right',13);
  }
  function routedArrow(points,progress,color){
    if(progress<=0)return;
    const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)),total=lengths.reduce((a,b)=>a+b,0);
    let remaining=total*progress;c.beginPath();c.moveTo(points[0].x,points[0].y);
    for(let i=0;i<lengths.length;i++){const portion=Math.min(1,remaining/lengths[i]);c.lineTo(mix(points[i].x,points[i+1].x,portion),mix(points[i].y,points[i+1].y,portion));remaining-=lengths[i];if(remaining<=0)break;}
    c.strokeStyle=color;c.lineWidth=1.8;c.lineJoin='round';c.lineCap='round';c.stroke();
    withAlpha(u(progress,.85,1),()=>{const b=points.at(-1),a=points.at(-2),angle=Math.atan2(b.y-a.y,b.x-a.x);c.beginPath();c.moveTo(b.x-7*Math.cos(angle-.45),b.y-7*Math.sin(angle-.45));c.lineTo(b.x,b.y);c.lineTo(b.x-7*Math.cos(angle+.45),b.y-7*Math.sin(angle+.45));c.stroke();});
  }
  function tickMark(x,y,color,progress){
    withAlpha(progress,()=>{c.beginPath();c.moveTo(x-4,y);c.lineTo(x-1,y+3);c.lineTo(x+5,y-4);c.strokeStyle=color;c.lineWidth=1.8;c.lineCap='round';c.stroke();});
  }
  function decisionSequence(t,L){
    const V=decisionLayout(),source=L.verify,assembly=u(t,80.5,83.5),feed=u(t,84.5,86);
    const decision=u(t,88.5,89.5),probability=u(t,89,90.5),select=selection(t);
    const winner=chosen(d.verification.selected);
    text('Depth-ring verification',24,27,15,'#3d5132','left',550);
    // Compact six-image evidence group. It stays in place as the decision and location are produced.
    withAlpha(assembly,()=>{
      rounded(V.board,7);c.fillStyle='#fafcf7';c.fill();c.strokeStyle='#d6dfce';c.lineWidth=1;c.stroke();
      text('Verifier inputs',V.board.x+16,V.board.y+23,state.mobile?16:13,'#566c46','left',550);
    });
    // Fade only the construction intermediates; they are not verifier inputs.
    withAlpha(1-u(t,80.5,82),()=>{
      depthFlow(t,source);
      aerialPredictor(t,source);
      groundDepth(source);
      plotAxes(source.ring);ring(d.displayRings.ground,source.ring,'#343f2d',1,2.1);text('Ground ring',source.ring.x,source.ring.y+source.ring.r+27,state.mobile?15:12,'#596e48','center',500);
    });
    const panoBox=rect(source.pano,V.pano,assembly),contextBox=V.context;
    panoramaImage(panoBox);text('Ground panorama',panoBox.x,panoBox.y-12,state.mobile?14:12,'#738466');
    withAlpha(u(t,81.2,82.5),()=>{
      cropImage({x:0,y:0,w:1},contextBox,'#c6d0bc',1,.03);
      text('Aerial context',contextBox.x,contextBox.y-12,state.mobile?13:11,'#738466');
      d.candidates.forEach(candidate=>candidateMarker(candidate,contextBox,{opacity:candidate.label===winner.label?1:1-select*.55}));
    });
    d.candidates.forEach((candidate,index)=>{
      const patch=rect(source.patches[index],V.patches[index],assembly),target=V.plots[index],original=source.plots[index];
      const plot={x:mix(original.x,target.x,assembly),y:mix(original.y,target.y,assembly),r:mix(original.r,target.r,assembly)};
      const low=candidate.label===winner.label?0:select,color=family(candidate),evidenceAlpha=1-low*.32;
      patchImage(candidate,patch,blend(color,'#a4ad9b',low),evidenceAlpha,.02+low*.12);
      withAlpha(evidenceAlpha,()=>{
        text('Candidate '+candidate.label,patch.x+2,patch.y-12,state.mobile?15:13,color,'left',550);
        withAlpha(assembly,()=>text('['+candidate.p.map(v=>Math.round(v*1000)).join(', ')+']',patch.x+patch.w/2,patch.y+patch.w+22,state.mobile?14:12,'#7c8871','center'));
        const pairing=u(t,80.8,82.5);
        plotAxes(plot);ring(d.displayRings.ground,plot,'#38432f',1,1.9,pairing);ring(d.displayRings[candidate.label],plot,color,1,2.3);
        withAlpha(1-pairing,()=>text('Aerial ring '+candidate.label,plot.x,plot.y+plot.r+27,state.mobile?15:12,'#596e48','center',500));
        withAlpha(pairing,()=>text('Ground + '+candidate.label,plot.x,plot.y+plot.r+21,state.mobile?14:11,'#718166','center'));
      });
    });
    // The two flow directions use the same spatial grammar on desktop and phone.
    const model=V.model,modelShow=u(t,83.8,84.5);
    if(state.mobile)arrow({x:280,y:V.board.y+V.board.h+3},{x:280,y:model.y-6},feed,'#789260');
    else arrow({x:V.board.x+V.board.w+3,y:model.y+model.h/2},{x:model.x-6,y:model.y+model.h/2},feed,'#789260');
    withAlpha(modelShow,()=>{
      rounded(model,7);c.fillStyle='#f0f5e9';c.fill();c.strokeStyle=blend('#c4d2b8','#829b69',feed);c.lineWidth=1.4;c.stroke();
      const cx=model.x+model.w/2,cy=model.y+model.h/2;
      text('LVLM',cx,cy-(state.mobile?1:7),state.mobile?20:20,'#4c6638','center',600);
      text('verifier',cx,cy+(state.mobile?17:14),state.mobile?13:12,'#829071','center');

    });
    const outputFlow=u(t,87.5,88.5);
    if(state.mobile){
      arrow({x:280,y:model.y+model.h+3},{x:280,y:918},outputFlow,'#789260');
    }else arrow({x:model.x+model.w+3,y:model.y+model.h/2},{x:V.rows[0].x-24,y:(V.rows[0].y+V.rows[1].y+V.rows[1].h)/2},outputFlow,'#789260');
    withAlpha(decision,()=>{
      c.beginPath();
      if(state.mobile){c.moveTo(44,940);c.lineTo(44,935);c.lineTo(516,935);c.lineTo(516,940);}
      else{c.moveTo(744,141);c.lineTo(738,141);c.lineTo(738,265);c.lineTo(744,265);}
      c.strokeStyle='#c5d1ba';c.lineWidth=1;c.stroke();
    });
    withAlpha(decision,()=>text('LVLM output',V.outputTitle.x,V.outputTitle.y,state.mobile?16:13,'#566c46','left',550));
    d.candidates.forEach((candidate,index)=>{
      const row=V.rows[index],color=family(candidate),selected=candidate.label===winner.label,low=selected?0:select;
      const thumb={x:row.x+8,y:row.y+(row.h-40)/2,w:40},left=thumb.x+thumb.w+12,right=row.x+row.w-12,barWidth=right-left;
      withAlpha(decision*(1-low*.28),()=>{
        rounded(row,6);c.fillStyle=selected?'#f8faf6':'#fcfcfa';c.fill();c.strokeStyle=blend('#e0e5da',selected?color:'#e0e5da',select);c.lineWidth=selected?mix(1,2,select):1;c.stroke();
        patchImage(candidate,thumb,color,1,.03);
        text(candidate.label,left,row.y+23,state.mobile?16:14,color,'left',600);
        if(selected)tickMark(left+21,row.y+18,color,select);
        withAlpha(probability,()=>{
          const p=d.verification.probabilities?.[candidate.label];
          if(Number.isFinite(p)){
            text(probabilityText(p),right,row.y+23,state.mobile?16:15,color,'right',600);
            rounded({x:left,y:row.y+row.h-19,w:barWidth,h:5},2.5);c.fillStyle='#e6ebdf';c.fill();
            rounded({x:left,y:row.y+row.h-19,w:Math.max(.1,barWidth*p*probability),h:5},2.5);c.fillStyle=color;c.fill();
          }else text(selected?'Selected':'Not selected',right,row.y+33,state.mobile?13:12,selected?color:'#939c8a','right',selected?550:400);
        });
      });
    });
    // Return the selected existing candidate on a separate fixed map, without displacing the evidence.
    const map=V.map,selectedRow=V.rows[d.candidates.findIndex(candidate=>candidate.label===winner.label)];
    const mapFlow=u(t,94.5,96),mapShow=u(t,95,96.5),pointShow=u(t,96.2,97.5);
    if(state.mobile)arrow({x:selectedRow.x+selectedRow.w/2,y:selectedRow.y+selectedRow.h+5},{x:map.x+map.w/2,y:map.y-9},mapFlow,family(winner),1,true);
    else routedArrow([{x:selectedRow.x+selectedRow.w+5,y:selectedRow.y+selectedRow.h/2},{x:1094,y:selectedRow.y+selectedRow.h/2},{x:1094,y:map.y+24},{x:map.x+map.w+7,y:map.y+24}],mapFlow,family(winner));
    withAlpha(mapShow,()=>{
      text('Final location',map.x,map.y-12,state.mobile?16:13,'#566c46','left',550);
      cropImage({x:0,y:0,w:1},map,'#c3cfb7',1,.03);
      d.candidates.forEach(candidate=>candidateMarker(candidate,map,{opacity:(candidate.label===winner.label?1:.62)*pointShow,selected:candidate.label===winner.label,large:true}));
      withAlpha(pointShow,()=>{
        groundTruthMarker(map);
        const y=map.y+map.w+23;star(map.x+8,y-4,5);text('GT',map.x+19,y,11,'#44553b');
        d.candidates.forEach((candidate,index)=>{const x=map.x+82+index*94,color=family(candidate);circle(x,y-4,4,color,'white',1);text(candidate.label+(candidate.label===winner.label?' selected':''),x+10,y,11,color,'left',candidate.label===winner.label?600:400);});
      });
    });
  }
  function render(){
    if(!c)return;const L=layout(),t=state.time;
    const open=u(t,7.8,9.5);
    if(!state.mobile){L.root=rect({x:360,y:205,w:400},L.root,open);L.pano=rect({x:360,y:54,w:400,h:105},L.pano,open);}
    else{L.root=rect({x:65,y:190,w:430},L.root,open);L.pano=rect({x:65,y:62,w:430,h:86},L.pano,open);}
    c.setTransform(state.scale,0,0,state.scale,0,0);c.globalAlpha=1;c.fillStyle='#fff';c.fillRect(0,0,state.w,state.h);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
    const searchFade=1-u(t,64,66);withAlpha(searchFade,()=>drawSearch(t,L));
    if(t<80.5){
      withAlpha(u(t,64,66),()=>verification(t,L));
      pano(t,L);candidates(t,L);
    }else decisionSequence(t,L);
    const phase=t<10?'Coordinate sampling and clustering':t<20?`${kids('root').length} parallel search branches`:t<25?`Comparing ${column100Order.length} hypothesis scores`:t<28?`Darkening pruned hypotheses and retaining up to B = ${d.config.budget}`:t<36?`${kept100Order.length} retained hypotheses continue searching`:t<41?`Comparing ${pool50Order.length} hypothesis scores`:t<44?`Darkening pruned hypotheses and retaining up to B = ${d.config.budget}`:t<52?`${col50Order.length} parallel local searches`:t<59.3?'Ranking leaf hypotheses by recorded path scores':t<64?'Two candidates shortlisted for verification':t<75?'Ground depth estimation and horizon-band pooling':t<80.5?'Predicting candidate depth rings':t<85?'Grouping six images and candidate coordinates':t<89?'Providing the grouped inputs to the LVLM':t<91?'Reading the recorded LVLM decision':t<95?'Dimming the unselected candidate':'Final candidate location';
    if(phase!==state.phase){state.phase=phase;$('#rm-motion-description').textContent=phase;canvas.setAttribute('aria-label',phase);}
    const label=t<64?'Search':t<95?'Depth-ring verification':'Final localization';
    canvas.dataset.phase=label;canvas.dataset.time=t.toFixed(3);canvas.dataset.parallelBranches=t<10?0:t<29.5?kids('root').length:t<44.5?kept100Order.length:t<59.3?col50Order.length:2;canvas.dataset.renderedFrames=String(++state.frameCount);
    canvas.dataset.decision=t>=25&&t<28?'pruning-100':t>=41&&t<44?'pruning-50':t>=80.5&&t<85?'grouped-inputs':t>=85&&t<89?'feeding-lvlm':t>=91&&t<95?'candidate-selected':'none';

  }
  function resize(){
    const width=root.clientWidth-2;state.mobile=width<650;state.w=state.mobile?560:1120;state.h=state.mobile?1450:650;const cssHeight=width*state.h/state.w;
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(cssHeight*dpr);canvas.style.aspectRatio=state.w+'/'+state.h;state.scale=canvas.width/state.w;render();
  }
  function updateButton(){
    const button=$('#rm-motion-run');button.textContent=state.playing?'Running…':'Run';button.disabled=state.playing||!state.loaded;
    $('#rm-motion-pause').disabled=!state.playing||!state.loaded;
    $('#rm-motion-reset').disabled=!state.loaded;
  }
  function pause(manual=true){state.playing=false;if(manual){state.userPaused=true;state.playRequested=false;state.resumeOnEnter=false;}cancelAnimationFrame(state.raf);updateButton();}
  function tick(timestamp){
    if(!state.playing)return;let dt=state.last?Math.min((timestamp-state.last)/1000,.08):0;state.last=timestamp;
    if(dt>0){state.frames.push(dt);if(state.frames.length>90)state.frames.shift();if(state.frameCount%20===0){canvas.dataset.fps=(state.frames.length/state.frames.reduce((a,b)=>a+b,0)).toFixed(1);const intervals=state.frames.slice().sort((a,b)=>a-b);canvas.dataset.frameP95=(intervals[Math.floor(intervals.length*.95)]*1000).toFixed(1);}}
    state.time=Math.min(duration,state.time+dt*baselineSpeed);render();if(state.time>=duration){pause(false);return;}state.raf=requestAnimationFrame(tick);
  }
  function replay(){state.time=0;state.last=0;state.userPaused=false;render();play();}
  function reset(){pause();state.time=0;state.last=0;render();}
  function play(){if(!state.loaded){state.playRequested=true;return;}state.playRequested=false;if(state.time>=duration){replay();return;}cancelAnimationFrame(state.raf);state.playing=true;state.userPaused=false;state.last=0;updateButton();state.raf=requestAnimationFrame(tick);}
  $('#rm-motion-run').addEventListener('click',play);
  $('#rm-motion-pause').addEventListener('click',()=>pause());
  $('#rm-motion-reset').addEventListener('click',reset);
  document.querySelector('#watch-demo')?.addEventListener('click',event=>{
    event.preventDefault();
    const box=root.getBoundingClientRect(),offset=Math.max(24,(window.innerHeight-box.height)/2);
    window.scrollTo({top:Math.max(0,window.scrollY+box.top-offset),behavior:reduced?'auto':'smooth'});
    window.history.replaceState(null,'','#rm-motion');
    root.focus({preventScroll:true});state.resumeOnEnter=false;replay();
  });

  new ResizeObserver(resize).observe(root);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{if(!entries[0].isIntersecting&&state.playing){state.resumeOnEnter=true;pause(false);}else if(entries[0].isIntersecting&&state.resumeOnEnter&&!state.userPaused){state.resumeOnEnter=false;play();}},{threshold:.12}).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(false);});
  let loadVersion=0;
  const entries=window.RINGMATCH_CASES||[];
  const selector=$('#rm-case-select'),status=$('.rm-motion-source');
  entries.forEach(entry=>{const option=document.createElement('option');option.value=entry.id;option.textContent=entry.label;selector.append(option);});
  selector.value=d.id;
  function controlsLoading(loading){
    root.setAttribute('aria-busy',String(loading));
    if(loading)['#rm-motion-run','#rm-motion-pause','#rm-motion-reset'].forEach(id=>$(id).disabled=true);
    else updateButton();
    status.textContent=loading?'Loading case…':'';
  }
  async function activateCase(trace,version){
    const nextImages={};
    const loadImage=(key,priority)=>new Promise(resolve=>{const img=new Image();nextImages[key]=img;img.decoding='async';img.fetchPriority=priority;img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=trace.assets[key];});
    const ready=await Promise.all([loadImage('aerial','high'),loadImage('pano','high')]);
    if(version!==loadVersion)return;
    if(!ready.every(Boolean))throw new Error('Input image download failed');
    d=trace;images=nextImages;updateOrders();state.loaded=true;state.time=0;state.last=0;state.phase='';state.userPaused=false;state.resumeOnEnter=false;selector.value=trace.id;controlsLoading(false);updateButton();resize();
    canvas.dataset.caseId=trace.id;
    if(state.playRequested)play();
    ['depth'].forEach(key=>loadImage(key,'low').then(()=>{if(version===loadVersion){images=nextImages;render();}}));
  }
  async function switchCase(id){
    const version=++loadVersion;pause(false);state.playRequested=false;state.loaded=false;controlsLoading(true);
    try{const trace=await window.loadRingMatchCase(id);if(version!==loadVersion)return;await activateCase(trace,version);}
    catch(error){if(version!==loadVersion)return;controlsLoading(false);status.textContent='Unable to load case';selector.value=d.id;state.loaded=!!images.aerial?.naturalWidth;updateButton();}
  }
  selector.addEventListener('change',event=>switchCase(event.target.value));
  function stepCase(delta){const index=entries.findIndex(entry=>entry.id===selector.value),next=entries[(index+delta+entries.length)%entries.length];selector.value=next.id;switchCase(next.id);}
  $('#rm-case-prev').addEventListener('click',()=>stepCase(-1));$('#rm-case-next').addEventListener('click',()=>stepCase(1));
  controlsLoading(true);activateCase(d,++loadVersion).catch(()=>{controlsLoading(false);updateButton();status.textContent='Unable to load case';});
  resize();
})();
