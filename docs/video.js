/* Native MP4 playback with a persistent, accessible control bar. */
(() => {
  'use strict';
  const player=document.querySelector('#demo-video'),video=document.querySelector('#overview-video');
  if(!player||!video)return;
  const $=id=>document.getElementById(id),button=$('video-play'),seek=$('video-seek'),clock=$('video-time'),notice=$('video-notice'),overlay=$('video-play-overlay');
  let userPaused=false,inView=true,wasPlaying=false,scrubbing=false,scrubWasPlaying=false,failed=false;
  const format=time=>{time=Number.isFinite(time)?Math.max(0,Math.floor(time)):0;return Math.floor(time/60)+':'+String(time%60).padStart(2,'0');};
  function refresh(){
    const duration=video.duration,known=Number.isFinite(duration)&&duration>0;
    if(!scrubbing)seek.value=known?String(Math.round(video.currentTime/duration*1000)):'0';
    seek.disabled=!known||failed;
    seek.setAttribute('aria-valuetext',`${format(video.currentTime)} of ${known?format(duration):'unknown duration'}`);
    clock.textContent=format(video.currentTime)+' / '+(known?format(duration):'1:00');
    const paused=video.paused||video.ended;
    button.setAttribute('aria-label',paused?'Play overview video':'Pause overview video');
    button.innerHTML=paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  }
  async function play(manual=false){
    if(failed)return;
    if(manual){userPaused=false;video.muted=true;}
    try{await video.play();overlay.hidden=true;}
    catch(error){
      if(error.name==='AbortError')return;
      notice.hidden=true;overlay.hidden=false;userPaused=true;refresh();
    }
  }
  function toggle(){
    if(video.paused||video.ended){if(video.ended)video.currentTime=0;play(true);}
    else{userPaused=true;video.pause();}
  }
  button.addEventListener('click',toggle);
  overlay.addEventListener('click',()=>play(true));
  video.addEventListener('click',toggle);
  video.addEventListener('play',()=>{overlay.hidden=true;refresh();});
  video.addEventListener('pause',refresh);
  video.addEventListener('ended',()=>{userPaused=true;notice.hidden=true;refresh();});
  ['timeupdate','loadedmetadata','durationchange'].forEach(event=>video.addEventListener(event,refresh));
  ['playing','canplay','seeked'].forEach(event=>video.addEventListener(event,()=>{notice.hidden=true;refresh();}));
  video.addEventListener('waiting',()=>{if(!video.paused)notice.hidden=false;});
  video.addEventListener('error',()=>{failed=true;notice.textContent='Unable to load video. Please reload to try again.';notice.hidden=false;overlay.hidden=true;button.disabled=true;refresh();});
  seek.addEventListener('pointerdown',()=>{scrubbing=true;scrubWasPlaying=!video.paused;video.pause();});
  seek.addEventListener('input',()=>{
    if(!Number.isFinite(video.duration)||video.duration<=0)return;
    video.currentTime=Number(seek.value)/1000*video.duration;
    clock.textContent=format(video.currentTime)+' / '+format(video.duration);
    seek.setAttribute('aria-valuetext',format(video.currentTime)+' of '+format(video.duration));
  });
  function finishScrub(){if(!scrubbing)return;scrubbing=false;if(scrubWasPlaying&&!userPaused&&inView&&!document.hidden)play();refresh();}
  seek.addEventListener('change',finishScrub);
  document.addEventListener('pointerup',finishScrub);
  document.addEventListener('pointercancel',finishScrub);
  $('video-speed').addEventListener('change',event=>{video.playbackRate=Number(event.target.value);});
  $('video-fullscreen').addEventListener('click',async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(player.requestFullscreen)await player.requestFullscreen();
      else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();
    }catch(error){/* Inline playback remains usable when fullscreen is unavailable. */}
  });
  document.addEventListener('fullscreenchange',()=>$('video-fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen'));
  document.querySelector('#watch-demo')?.addEventListener('click',event=>{
    event.preventDefault();const box=player.getBoundingClientRect(),offset=Math.max(24,(window.innerHeight-box.height)/2);
    window.scrollTo({top:Math.max(0,window.scrollY+box.top-offset),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    window.history.replaceState(null,'','#demo-video');player.focus({preventScroll:true});
    video.currentTime=0;play(true);
  });
  document.addEventListener('ringmatch:interact',()=>{userPaused=true;wasPlaying=false;video.pause();});
  function visibility(){
    const visible=inView&&!document.hidden;
    if(!visible){if(!video.paused){wasPlaying=true;video.pause();}}
    else if(!userPaused&&!video.ended&&!scrubbing&&(wasPlaying||video.paused)){wasPlaying=false;play();}
  }
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;visibility();},{threshold:.12}).observe(video);
  document.addEventListener('visibilitychange',visibility);
  video.muted=true;video.controls=false;$('video-controls').hidden=false;refresh();
  if(!('IntersectionObserver' in window))play();
})();
