"use strict";
var META=null, BIBLE=null;   /* fetched by boot() at the end of this file */
var view=document.getElementById('view'), top=document.getElementById('top'),
    nav=document.getElementById('nav'), scrim=document.getElementById('scrim'),
    drawer=document.getElementById('drawer'), toc=document.getElementById('toc'),
    sheet=document.getElementById('sheet');

var ERA={}, SEC={}, BOOKS=[], FACTS=[], ALIAS={};
function indexData(){
  META.eras.forEach(function(e){ERA[e.key]=e;});
  META.sections.forEach(function(s){SEC[s.key]=s;});
  BOOKS=META.books; FACTS=META.facts; ALIAS=META.aliases||{};
}

/* ---------- scripture reference parsing ----------
   Turns free text like "Matthew 19:16-17; Eccl. 12:13; Leviticus 11" into
   resolvable references, so study-sheet entries link straight to the text.
   Anything that will not resolve is kept as a plain label rather than dropped. */
function normName(s){
  return s.toLowerCase().replace(/\./g,'').replace(/\s+/g,' ')
          .replace(/^([123])\s*/,'$1 ').trim();
}
function lookupBook(name){
  var n=normName(name);
  if(ALIAS[n]!==undefined) return ALIAS[n];
  n=n.replace(/s$/,'');
  if(ALIAS[n]!==undefined) return ALIAS[n];
  for(var i=0;i<BOOKS.length;i++)
    if(normName(BOOKS[i].name)===n) return i;
  return -1;
}
function parseRefs(text){
  if(!text) return [];
  var out=[], parts=String(text).split(/[;,]/), lastBook=-1;
  parts.forEach(function(raw){
    var p=raw.trim(); if(!p) return;
    // "Book 12:3-4" | "Book 12" | "12:3" (carries the previous book)
    // book, then a number that may be a chapter or (in one-chapter books) a
    // verse, either of which may carry a range, then an optional :verse[-verse]
    var m=p.match(/^([1-3]?\s*[A-Za-z][A-Za-z\s.']*?)\s*(\d+)(?:\s*[-\u2013]\s*(\d+))?(?::(\d+)(?:\s*[-\u2013]\s*(\d+))?)?$/);
    var bi,c,v1,v2;
    if(m){
      bi=lookupBook(m[1]);
      c=+m[2];
      v1=m[4]?+m[4]:null;
      v2=m[5]?+m[5]:null;
      if(v1===null && m[3]) v2=+m[3];   // a range on the first number
    } else {
      var m2=p.match(/^(\d+):(\d+)(?:\s*[-\u2013]\s*(\d+))?$/);
      if(m2&&lastBook>=0){ bi=lastBook; c=+m2[1]; v1=+m2[2]; v2=m2[3]?+m2[3]:null; }
      else { out.push({label:p, ok:false}); return; }
    }
    if(bi<0||!BOOKS[bi]){ out.push({label:p, ok:false}); return; }
    lastBook=bi;
    var nch=BOOKS[bi].nch;
    // Single-chapter books are cited by bare verse: "2 John 6", "Jude 14-15".
    if(nch===1 && v1===null){ v1=c; c=1; }
    else if(v1===null){ v2=null; }      // "Genesis 1-3" is a chapter span; open the first
    if(!(c>=1&&c<=nch)){ out.push({label:p, ok:false}); return; }
    var label=BOOKS[bi].name+' '+(nch===1
      ? (v1?v1+(v2&&v2!==v1?'-'+v2:''):'')
      : c+(v1?':'+v1+(v2&&v2!==v1?'-'+v2:''):''));
    // Verse divisions in the Apocrypha come from an OCR'd scan and a few are
    // merged, so a real reference can sit past the end of our chapter. Keep the
    // link, aim it at the chapter, and mark it so the label can say why.
    var len=(BIBLE[String(bi)]&&BIBLE[String(bi)][String(c)])
            ? BIBLE[String(bi)][String(c)].length : 0;
    var approx=false;
    if(v1 && len && v1>len){ approx=true; v1=null; v2=null; }
    out.push({b:bi, c:c, v1:v1, v2:v2, ok:true, approx:approx, label:label});
  });
  return out;
}
function refKey(r){ return r.b+':'+r.c+':'+(r.v1||1); }

var S={tab:'home', mode:'shelf', book:null, btab:'overview', ch:1,
       openEra:null, q:'', reading:null, hl:{}, notes:[], sheet:null,
       saveQ:'', saveColor:'all', saveSort:'book', editing:null, ready:false,
       speaking:false, speakAt:-1, speakOpts:false, follow:true,
       sheets:[], sheet:null, sheetQ:'', sheetEdit:null, jumpRef:null,
       bibleBook:null, bibleQ:'', drawerBook:null,
       voiceMode:'system', kokoroVoice:'af_heart', sysVoiceURI:null,
       voiceNotice:'', voicePicker:false};

/* ---------- colours ---------- */
var COLORS=[
 {k:'yellow',n:'Yellow',dot:'#FACC15',bg:'#FEF3C0'},
 {k:'green', n:'Green', dot:'#22C55E',bg:'#D7F5E1'},
 {k:'blue',  n:'Blue',  dot:'#377DFF',bg:'#DCE9FF'},
 {k:'pink',  n:'Pink',  dot:'#F47286',bg:'#FDDDE4'},
 {k:'purple',n:'Purple',dot:'#8B5CF6',bg:'#E9DEFB'}
];
var CMAP={}; COLORS.forEach(function(c){CMAP[c.k]=c;});

/* ---------- storage ----------
   Tries the artifact store, then browser storage, then memory, so the file
   keeps working whether it is opened here, downloaded, or run offline. */
var Store=(function(){
  var mem={};
  var hasArtifact=(typeof window!=='undefined'&&window.storage&&window.storage.get);
  function ls(){
    try{ if(typeof localStorage==='undefined') return null;
         localStorage.setItem('__t','1'); localStorage.removeItem('__t');
         return localStorage; }catch(e){ return null; }
  }
  var L=ls();
  return {
    get:function(k){
      if(hasArtifact) return window.storage.get(k).then(function(r){
        return r&&r.value?JSON.parse(r.value):null;}).catch(function(){return null;});
      try{ if(L){var v=L.getItem(k); return Promise.resolve(v?JSON.parse(v):null);} }catch(e){}
      return Promise.resolve(mem[k]!==undefined?mem[k]:null);
    },
    set:function(k,v){
      mem[k]=v;
      if(hasArtifact) return window.storage.set(k,JSON.stringify(v)).catch(function(){});
      try{ if(L) L.setItem(k,JSON.stringify(v)); }catch(e){}
      return Promise.resolve();
    }
  };
})();

function saveHl(){ Store.set('strata:highlights',S.hl); }
function saveNotes(){ Store.set('strata:notes',S.notes); }
function saveSheets(){ Store.set('strata:sheets',S.sheets); }

/* Ships with the built-in sheets; anything the reader edits is stored and
   replaces them on load, so edits survive but nothing is lost on first run. */
function defaultSheets(){ return JSON.parse(JSON.stringify(META.sheets||[])); }

function loadAll(cb){
  Store.get('strata:highlights').then(function(h){
    S.hl=h||{};
    return Store.get('strata:notes');
  }).then(function(n){
    S.notes=Array.isArray(n)?n:[];
    return Store.get('strata:sheets');
  }).then(function(sh){
    S.sheets=(Array.isArray(sh)&&sh.length)?sh:defaultSheets();
    return Store.get('strata:voice');
  }).then(function(v){
    if(v&&typeof v==='object'){
      S.kokoroVoice=v.kokoro||S.kokoroVoice;
      S.sysVoiceURI=v.sys||null;
      if(v.rate) Speech.setRate(v.rate);
      /* the neural model is never auto-downloaded on launch; the reader opts in */
      S.voiceMode='system';
      S.wantKokoro=(v.mode==='kokoro');
    }
    S.ready=true; cb();
  }).catch(function(){ S.sheets=defaultSheets(); S.ready=true; cb(); });
}

/* ---------- verse helpers ---------- */
function vKey(b,c,v){ return b+':'+c+':'+v; }
function vText(b,c,v){
  var ch=BIBLE[String(b)]; if(!ch) return '';
  var arr=ch[String(c)]; return arr?(arr[v-1]||''):'';
}
function vRef(b,c,v){ return BOOKS[b]?BOOKS[b].name+' '+c+':'+v:'Unfiled'; }
function parseKey(k){ var p=k.split(':'); return {b:+p[0],c:+p[1],v:+p[2]}; }

/* ---------- read aloud ----------
   Two engines behind one interface:

     system  - the browser's built-in SpeechSynthesis. Always available,
               works offline, voices vary by device.
     kokoro  - Kokoro-82M (hexgrad, Apache-2.0) run entirely in the browser
               through kokoro-js and Transformers.js. Much better prosody,
               but the weights (~86 MB at q8) have to be fetched once, so it
               needs a network connection the first time and a browser that
               allows dynamic import of an ES module from a CDN.

   Both speak a chapter verse by verse, so the active verse can be tracked
   and scrolled to either way. If Kokoro cannot load for any reason we fall
   straight back to the system engine and say so rather than going silent. */

var KOKORO_CDN='https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
var KOKORO_MODEL='onnx-community/Kokoro-82M-v1.0-ONNX';

/* Shown in the picker before the model is loaded; replaced by the model's own
   list once it reports one. */
var KOKORO_VOICES=[
 {id:'af_heart',   name:'Heart',    note:'American \u00b7 female'},
 {id:'af_bella',   name:'Bella',    note:'American \u00b7 female'},
 {id:'af_nicole',  name:'Nicole',   note:'American \u00b7 female'},
 {id:'af_sarah',   name:'Sarah',    note:'American \u00b7 female'},
 {id:'af_sky',     name:'Sky',      note:'American \u00b7 female'},
 {id:'am_michael', name:'Michael',  note:'American \u00b7 male'},
 {id:'am_adam',    name:'Adam',     note:'American \u00b7 male'},
 {id:'am_fenrir',  name:'Fenrir',   note:'American \u00b7 male'},
 {id:'am_puck',    name:'Puck',     note:'American \u00b7 male'},
 {id:'bf_emma',    name:'Emma',     note:'British \u00b7 female'},
 {id:'bf_isabella',name:'Isabella', note:'British \u00b7 female'},
 {id:'bm_george',  name:'George',   note:'British \u00b7 male'},
 {id:'bm_fable',   name:'Fable',    note:'British \u00b7 male'},
 {id:'bm_lewis',   name:'Lewis',    note:'British \u00b7 male'}
];

/* ---- Kokoro loader ---- */
var Kokoro=(function(){
  var tts=null, state='idle', err='', loading=null;
  function status(){ return state; }
  function error(){ return err; }
  function ready(){ return state==='ready'&&!!tts; }
  function canTry(){
    return typeof window!=='undefined' && typeof Audio!=='undefined';
  }
  function load(onState){
    if(ready()) return Promise.resolve(tts);
    if(loading) return loading;
    if(!canTry()){
      state='error'; err='This browser cannot run the neural voice.';
      if(onState) onState(); return Promise.reject(new Error(err));
    }
    state='loading'; err=''; if(onState) onState();
    var webgpu=(typeof navigator!=='undefined'&&navigator.gpu);
    loading=import(/* webpackIgnore: true */ KOKORO_CDN)
      .then(function(mod){
        if(!mod||!mod.KokoroTTS) throw new Error('kokoro-js did not load');
        return mod.KokoroTTS.from_pretrained(KOKORO_MODEL,
          webgpu?{dtype:'fp32',device:'webgpu'}:{dtype:'q8',device:'wasm'});
      })
      .then(function(t){
        tts=t; state='ready'; loading=null;
        if(onState) onState();
        return tts;
      })
      .catch(function(e){
        state='error'; loading=null;
        err=(e&&e.message)?e.message:'The neural voice could not be loaded.';
        if(onState) onState();
        throw e;
      });
    return loading;
  }
  /* Returns a playable object URL for one passage. */
  function synth(text, voice, speed){
    if(!ready()) return Promise.reject(new Error('not ready'));
    return Promise.resolve(tts.generate(text,{voice:voice,speed:speed||1}))
      .then(function(audio){ return toURL(audio); });
  }
  function toURL(audio){
    if(!audio) throw new Error('no audio returned');
    if(typeof audio.toBlob==='function')
      return URL.createObjectURL(audio.toBlob());
    /* fall back to building a WAV from the raw samples */
    var data=audio.audio||audio.data, sr=audio.sampling_rate||audio.sampleRate||24000;
    if(!data) throw new Error('no audio samples');
    return URL.createObjectURL(new Blob([wav(data,sr)],{type:'audio/wav'}));
  }
  function wav(samples,sr){
    var n=samples.length, buf=new ArrayBuffer(44+n*2), v=new DataView(buf);
    function str(o,s){ for(var i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); }
    str(0,'RIFF'); v.setUint32(4,36+n*2,true); str(8,'WAVE'); str(12,'fmt ');
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true);
    v.setUint16(34,16,true); str(36,'data'); v.setUint32(40,n*2,true);
    for(var i=0;i<n;i++){
      var s=Math.max(-1,Math.min(1,samples[i]));
      v.setInt16(44+i*2, s<0?s*0x8000:s*0x7FFF, true);
    }
    return buf;
  }
  function listVoices(){
    if(!ready()||typeof tts.list_voices!=='function') return null;
    try{
      var v=tts.list_voices();
      if(Array.isArray(v)&&v.length) return v;
      if(v&&typeof v==='object'){ var k=Object.keys(v); return k.length?k:null; }
    }catch(e){}
    return null;
  }
  return {load:load, synth:synth, ready:ready, status:status, error:error,
          listVoices:listVoices, canTry:canTry,
          _reset:function(){tts=null;state='idle';err='';loading=null;}};
})();

/* ---- unified player ---- */
var Speech=(function(){
  var synth=(typeof window!=='undefined'&&window.speechSynthesis)?window.speechSynthesis:null;
  var queue=[], idx=0, playing=false, paused=false, onTick=null, onDone=null;
  var rate=1, voice=null;
  var el=null, urls=[], nextURL=null, token=0;

  function supported(){ return !!synth && typeof SpeechSynthesisUtterance!=='undefined'; }
  function engine(){ return S.voiceMode==='kokoro'&&Kokoro.ready()?'kokoro':'system'; }

  /* -- system -- */
  function sysAt(i){
    if(!supported()||i>=queue.length){ stop(); if(onDone)onDone(); return; }
    idx=i; if(onTick) onTick(idx);
    var u=new SpeechSynthesisUtterance(queue[i]);
    u.rate=rate; if(voice) u.voice=voice;
    u.onend=function(){ if(playing&&!paused) sysAt(i+1); };
    u.onerror=function(){ if(playing&&!paused) sysAt(i+1); };
    try{ synth.speak(u); }catch(e){ stop(); }
  }

  /* -- kokoro -- */
  function audioEl(){
    if(!el&&typeof Audio!=='undefined') el=new Audio();
    return el;
  }
  function revoke(){
    urls.forEach(function(u){ try{ URL.revokeObjectURL(u); }catch(e){} });
    urls=[]; nextURL=null;
  }
  function kokAt(i,pre){
    var mine=token;
    if(i>=queue.length){ stop(); if(onDone)onDone(); return; }
    idx=i; if(onTick) onTick(idx);
    var got=pre?Promise.resolve(pre):Kokoro.synth(queue[i],S.kokoroVoice,rate);
    got.then(function(url){
      if(mine!==token||!playing) { try{URL.revokeObjectURL(url);}catch(e){} return; }
      urls.push(url);
      var a=audioEl(); if(!a){ stop(); return; }
      a.src=url;
      a.onended=function(){
        if(mine!==token||!playing||paused) return;
        var n=nextURL; nextURL=null; kokAt(i+1,n);
      };
      a.onerror=function(){
        if(mine!==token||!playing||paused) return;
        kokAt(i+1,null);
      };
      var p=a.play();
      if(p&&p.catch) p.catch(function(){});
      /* pre-render the next verse while this one plays */
      if(i+1<queue.length){
        Kokoro.synth(queue[i+1],S.kokoroVoice,rate)
          .then(function(u2){ if(mine===token) { nextURL=u2; urls.push(u2); }
                              else { try{URL.revokeObjectURL(u2);}catch(e){} } })
          .catch(function(){});
      }
    }).catch(function(){
      /* one verse failed to render: fall back to the device voice */
      if(mine!==token) return;
      S.voiceMode='system'; S.voiceNotice='The neural voice stopped responding, '+
        'so playback switched to the device voice.';
      if(supported()) sysAt(i); else { stop(); if(onDone)onDone(); }
      renderSpeakBar();
    });
  }

  function start(lines,from){
    stop();
    queue=lines; playing=true; paused=false; token++;
    if(engine()==='kokoro'){ kokAt(from||0,null); return true; }
    if(!supported()){ playing=false; return false; }
    try{ synth.cancel(); }catch(e){}
    sysAt(from||0);
    return true;
  }
  function pause(){
    if(!playing) return; paused=true;
    if(engine()==='kokoro'){ var a=audioEl(); if(a) try{a.pause();}catch(e){} }
    else if(supported()){ try{ synth.pause(); }catch(e){} }
  }
  function resume(){
    if(!playing) return; paused=false;
    if(engine()==='kokoro'){ var a=audioEl(); if(a){ var p=a.play(); if(p&&p.catch)p.catch(function(){}); } }
    else if(supported()){ try{ synth.resume(); }catch(e){} }
  }
  function stop(){
    playing=false; paused=false; idx=0; token++;
    if(supported()){ try{ synth.cancel(); }catch(e){} }
    if(el){ try{ el.pause(); el.removeAttribute('src'); }catch(e){} }
    revoke();
  }
  function voices(){ try{ return synth?synth.getVoices():[]; }catch(e){ return []; } }

  return {supported:supported, start:start, pause:pause, resume:resume, stop:stop,
    voices:voices, engine:engine,
    isPlaying:function(){return playing;}, isPaused:function(){return paused;},
    at:function(){return idx;},
    setRate:function(r){rate=r;}, getRate:function(){return rate;},
    setVoice:function(v){voice=v;}, getVoice:function(){return voice;},
    onTick:function(f){onTick=f;}, onDone:function(f){onDone=f;}};
})();

/* Any engine at all? Kokoro can work even where SpeechSynthesis is missing. */
function canRead(){ return Speech.supported()||Kokoro.canTry(); }

function speakChapter(from){
  var b=BOOKS[S.reading]; if(!b) return;
  var vs=BIBLE[String(b.i)][String(S.ch)]||[];
  var lines=vs.map(function(t,i){ return (i===0? b.name+', chapter '+S.ch+'. ':'')+t; });
  Speech.onTick(function(i){ S.speakAt=i; paintSpeaking(); });
  Speech.onDone(function(){ S.speaking=false; S.speakAt=-1; renderSpeakBar(); paintSpeaking(); });
  if(Speech.start(lines,from||0)){ S.speaking=true; S.speakAt=from||0; renderSpeakBar(); }
}
function stopSpeaking(){
  Speech.stop(); S.speaking=false; S.speakAt=-1;
  renderSpeakBar(); paintSpeaking();
}
function paintSpeaking(){
  var nodes=document.querySelectorAll('.rd .v');
  if(!nodes||!nodes.length) return;
  for(var i=0;i<nodes.length;i++) nodes[i].classList.remove('speaking');
  if(S.speaking&&S.speakAt>=0&&nodes[S.speakAt]){
    nodes[S.speakAt].classList.add('speaking');
    if(S.follow) nodes[S.speakAt].scrollIntoView({block:'center'});
  }
}
function renderSpeakBar(){
  var el=document.getElementById('speakbar');
  if(el) el.innerHTML=speakBarHTML();
}

/* Load Kokoro, then pick up playback where we were. */
function enableKokoro(resumeAfter){
  S.voiceNotice='';
  Kokoro.load(function(){ renderSpeakBar(); }).then(function(){
    S.voiceMode='kokoro'; saveVoice(); renderSpeakBar();
    if(resumeAfter&&S.reading!==null){ var at=Math.max(0,S.speakAt); stopSpeaking(); speakChapter(at); }
  }).catch(function(){
    S.voiceMode='system'; renderSpeakBar();
  });
}
function saveVoice(){
  Store.set('strata:voice',{mode:S.voiceMode, kokoro:S.kokoroVoice, sys:S.sysVoiceURI, rate:Speech.getRate()});
}
function applySysVoice(uri){
  S.sysVoiceURI=uri;
  var v=Speech.voices().filter(function(x){return x.voiceURI===uri;})[0];
  Speech.setVoice(v||null);
}


function esc(s){return String(s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function eraOf(b){return ERA[b.eras[b.eras.length-1]];}
function factsFor(i){return FACTS.filter(function(f){return f.book===i;});}

var I={
 home:'<path d="M3 10l9-7 9 7v9a2 2 0 01-2 2h-4v-6H9v6H5a2 2 0 01-2-2z"/>',
 book:'<path d="M4 4h7a2 2 0 012 2v14a2 2 0 00-2-2H4z"/><path d="M20 4h-7a2 2 0 00-2 2v14a2 2 0 012-2h7z"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 back:'<path d="M15 5l-7 7 7 7"/>',
 next:'<path d="M9 5l7 7-7 7"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 mark:'<path d="M6 3h12v18l-6-4-6 4z"/>',
 pen:'<path d="M5 3h9l5 5v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v6h5"/><path d="M8 13h8M8 17h5"/>',
 hilite:'<path d="M15 3.5l5.5 5.5-8 8H7v-5.5z"/><path d="M4 21h9"/><path d="M9.5 11.5l3 3"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 bible:'<path d="M5 3h13a1 1 0 011 1v16a1 1 0 01-1 1H5a2 2 0 010-4h13"/><path d="M11.5 6.5h3M13 5v3"/>',
 trash:'<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>',
 close:'<path d="M6 6l12 12M18 6L6 18"/>',
 sort:'<path d="M4 7h12M4 12h9M4 17h6"/>',
 play:'<path d="M7 4.5l12 7.5-12 7.5z"/>',
 pause:'<path d="M8 5v14M16 5v14"/>'
};
function svg(p,c){return '<svg viewBox="0 0 24 24" class="'+(c||'')+'">'+p+'</svg>';}

/* ================= TOP BAR ================= */
function renderTop(){
  var h='';
  if(S.reading!==null){
    var b=BOOKS[S.reading];
    h='<button class="icon" data-a="closeread">'+svg(I.back)+'</button>'+
      '<div class="ver">'+esc(b.name)+' '+S.ch+'</div>'+
      '<button class="icon" data-a="toc">'+svg(I.menu)+'</button>';
  } else if(S.book!==null){
    h='<button class="icon" data-a="closebook">'+svg(I.back)+'</button>'+
      '<h1>'+esc(BOOKS[S.book].name)+'</h1>'+
      '<button class="icon" data-a="toc" title="Books and chapters">'+svg(I.menu)+'</button>';
  } else {
    var TITLES={home:'Sword Forge',library:'Library',topics:'Topics',notes:'Note Gallery',
                saves:'Saves',bible:'The Bible',about:'About',search:'Search'};
    var t=TITLES[S.tab]||'Sword Forge';
    h='<button class="icon" data-a="toc" title="Books and chapters">'+svg(I.menu)+'</button>'+
      '<h1>'+t+'</h1>'+
      (S.tab==='search'?'':'<button class="icon" data-a="search">'+svg(I.search)+'</button>');
  }
  top.innerHTML=h;
}

/* ================= NAV ================= */
function renderNav(){
  var items=[['home','Home',I.home],['library','Library',I.book],
             ['notes','Notes',I.pen],['saves','Saves',I.hilite],
             ['bible','Bible',I.bible]];
  nav.innerHTML=items.map(function(it){
    return '<button data-nav="'+it[0]+'" aria-selected="'+(S.tab===it[0]&&S.book===null&&S.reading===null)+'">'+
      svg(it[2])+'<span>'+it[1]+'</span></button>';}).join('');
}

/* ================= HOME ================= */
var VERSES=[[53,'John',3,16],[22,'Isaiah',41,10],[19,'Psalms',23,1],
            [45,'Ecclesiasticus',6,14],[63,'Philippians',4,13],[26,'Daniel',3,17]];
function heroVerse(){
  var v=VERSES[new Date().getDate()%VERSES.length];
  var bi=BOOKS.findIndex(function(b){return b.name===v[1];});
  if(bi<0) bi=v[0];
  var t=(BIBLE[String(bi)][String(v[2])]||[])[v[3]-1]||'';
  return {bi:bi,ch:v[2],vs:v[3],txt:t,ref:v[1]+' '+v[2]+':'+v[3]};
}
function vHome(){
  var hv=heroVerse();
  var h='<div class="search" data-a="search"><svg viewBox="0 0 24 24">'+I.search+
        '</svg><input placeholder="Search 80 books" readonly></div>';
  h+='<div class="hero" data-book="'+hv.bi+'" data-goch="'+hv.ch+'">'+
     '<span class="tag">VERSE OF THE DAY</span>'+
     '<div class="v">'+esc(hv.txt)+'</div><div class="r">'+esc(hv.ref)+'</div></div>';

  h+='<div class="seg"><button data-mode="shelf" aria-selected="'+(S.mode==='shelf')+'">Study</button>'+
     '<button data-mode="strata" aria-selected="'+(S.mode==='strata')+'">Timeline</button></div>';

  if(S.mode==='shelf'){
    h+='<div class="lab">Jump back in</div>';
    [[22,'Isaiah'],[0,'Genesis'],[26,'Daniel'],[51,'1 Maccabees']].forEach(function(x){
      var b=BOOKS.find(function(bb){return bb.name===x[1];}); if(!b) return;
      h+=itemRow(b.i, b.name, b.nch+' chapters \u00b7 '+eraOf(b).name, I.book);
    });
    h+='<div class="h2">Sections</div>';
    META.sections.forEach(function(s){
      var n=BOOKS.filter(function(b){return b.section===s.key;}).length;
      h+='<button class="item" data-sec="'+s.key+'"><span class="ic">'+svg(I.book)+
         '</span><span class="spacer"><span class="tt">'+esc(s.name)+'</span>'+
         '<span class="dd">'+esc(s.note)+' \u00b7 '+n+' books</span></span>'+
         '<span class="go">'+svg(I.next)+'</span></button>';
    });
  } else {
    h+='<div class="lab">Thirteen layers of history</div>';
    h+=strataHTML();
  }
  return h;
}
function itemRow(i,t,d,ic){
  return '<button class="item" data-book="'+i+'"><span class="ic">'+svg(ic)+
    '</span><span class="spacer"><span class="tt">'+esc(t)+'</span>'+
    '<span class="dd">'+esc(d)+'</span></span><span class="go">'+svg(I.next)+'</span></button>';
}

/* ================= STRATA ================= */
function strataHTML(){
  return META.eras.map(function(e){
    var bks=BOOKS.filter(function(b){return b.eras.indexOf(e.key)>-1;});
    var open=S.openEra===e.key;
    var h='<div class="era"><button class="hd" data-era="'+e.key+'" style="width:100%;text-align:left">'+
      '<span class="swatch" style="background:'+e.color+'"></span>'+
      '<span class="spacer"><span class="nm">'+esc(e.name)+'</span>'+
      '<span class="sp">'+esc(e.span)+'</span>'+
      '<span class="cp"><b>Power:</b> '+esc(e.power)+'</span>'+
      '<span class="cp"><b>Captivity:</b> '+esc(e.captivity)+'</span>'+
      '<span class="cnt">'+(bks.length?bks.length+' book'+(bks.length>1?'s':''):'no book')+'</span>'+
      '</span></button>';
    if(open){
      h+='<div class="body"><div style="font-size:13px;color:#475467;line-height:1.5;margin-bottom:9px">'+
         esc(e.note)+'</div><div class="pills">'+
         e.rulers.map(function(r){return '<span>'+esc(r)+'</span>';}).join('')+'</div>';
      if(bks.length) h+='<div class="bgrid" style="margin-top:11px">'+
         bks.map(function(b){return bookCard(b,e.color);}).join('')+'</div>';
      h+='</div>';
    }
    return h+'</div>';
  }).join('');
}
function bookCard(b,color){
  return '<button class="bk" data-book="'+b.i+'" style="--bc:'+(color||eraOf(b).color)+'">'+
    '<span class="n">'+esc(b.name)+'</span><span class="m">'+b.nch+' ch'+
    (b.apoc?' \u00b7 Apocrypha':'')+'</span></button>';
}

/* ================= LIBRARY ================= */
function vLibrary(){
  if(S.mode==='sheets'&&(S.sheet||S.sheetEdit)) return vSheets();
  var h='<div class="seg"><button data-mode="shelf" aria-selected="'+(S.mode==='shelf')+
        '">Shelves</button><button data-mode="strata" aria-selected="'+(S.mode==='strata')+
        '">Eras</button><button data-mode="sheets" aria-selected="'+(S.mode==='sheets')+
        '">Study</button></div>';
  if(S.mode==='sheets') return h+vSheets();
  if(S.mode==='strata') return h+strataHTML();
  META.sections.forEach(function(s){
    var bks=BOOKS.filter(function(b){return b.section===s.key;});
    if(!bks.length) return;
    h+='<div class="h2">'+esc(s.name)+'</div><div class="sub">'+esc(s.note)+'</div>';
    h+='<div class="bgrid">'+bks.map(function(b){return bookCard(b);}).join('')+'</div>';
  });
  return h;
}

/* ================= BOOK ================= */
function vBook(){
  var b=BOOKS[S.book];
  var h='<div class="bhead"><h2>'+esc(b.name)+'</h2>'+
        '<div class="full">'+esc(b.full)+'</div><div class="pills">'+
        '<span>'+esc(SEC[b.section].name)+'</span>'+
        b.eras.map(function(k){return '<span>'+esc(ERA[k].name)+'</span>';}).join('')+
        '<span>'+b.nch+' chapters</span></div></div>';
  var tabs=[['overview','Overview'],['timeline','Timeline'],['chapters','Chapters']];
  h+='<div class="tabs">'+tabs.map(function(t){
      return '<button data-btab="'+t[0]+'" aria-selected="'+(S.btab===t[0])+'">'+t[1]+'</button>';
    }).join('')+'</div>';
  h+='<div>'+({overview:tOverview,timeline:tTimeline,chapters:tChapters})[S.btab]()+'</div>';
  return h;
}
function tOverview(){
  var b=BOOKS[S.book];
  var h='<div class="card"><p style="margin:0;font-size:14.5px;line-height:1.6;color:#374151">'+
        esc(b.summary)+'</p></div>';
  h+='<button class="btn" data-readch="1" style="margin-bottom:12px">Read '+esc(b.name)+'</button>';
  h+='<div class="card"><div class="lab">Scribe \u2014 who wrote it</div>'+
     '<p style="margin:0;font-size:13.5px;line-height:1.55;color:#374151">'+esc(b.scribe)+'</p></div>';
  h+='<div class="card"><div class="lab">Setting</div><dl class="kv">'+
     '<dt>Written</dt><dd>'+esc(b.written)+'</dd>'+
     (b.power?'<dt>Power</dt><dd>'+esc(b.power)+'</dd>':'')+
     '<dt>Rulers</dt><dd>'+b.rulers.map(esc).join('<br>')+'</dd></dl></div>';
  if(b.captivity) h+='<div class="cap"><div class="lab">Captivity</div><p>'+esc(b.captivity)+'</p></div>';
  h+='<div class="card"><div class="lab">Themes</div><div class="pills">'+
     b.themes.map(function(t){return '<span>'+esc(t)+'</span>';}).join('')+'</div></div>';
  if(b.prophecies.length) h+='<div class="card"><div class="lab">Prophecies</div><ul class="tick">'+
     b.prophecies.map(function(p){return '<li>'+esc(p)+'</li>';}).join('')+'</ul></div>';
  if(b.laws.length) h+='<div class="card"><div class="lab">Laws given here</div><ul class="tick law">'+
     b.laws.map(function(p){return '<li>'+esc(p)+'</li>';}).join('')+'</ul></div>';
  var fx=factsFor(S.book);
  if(fx.length) h+='<div class="h2">Did you know</div>'+fx.map(factHTML).join('');
  return h;
}
function factHTML(f){
  return '<div class="fact"><div class="k">From Josephus</div><h4>'+esc(f.title)+'</h4>'+
    '<p>'+esc(f.text)+'</p><div class="c">'+esc(f.cite)+
    (f.ch?' \u00b7 on '+esc(BOOKS[f.book].name)+' '+f.ch:'')+'</div></div>';
}
function tTimeline(){
  var b=BOOKS[S.book],h='';
  b.eras.forEach(function(k){
    var e=ERA[k];
    h+='<div class="card" style="border-left:4px solid '+e.color+'">'+
       '<div class="lab">'+esc(e.name)+' \u00b7 '+esc(e.span)+'</div><dl class="kv">'+
       '<dt>Power</dt><dd>'+esc(e.power)+'</dd>'+
       '<dt>Captivity</dt><dd>'+esc(e.captivity)+'</dd>'+
       '<dt>Rulers</dt><dd>'+e.rulers.map(esc).join('<br>')+'</dd></dl>'+
       '<p style="margin:9px 0 0;font-size:13px;color:var(--ink2);line-height:1.5">'+esc(e.note)+'</p></div>';
  });
  if(b.moves.length){
    h+='<div class="h2">Sequence of events</div><div class="tl">'+b.moves.map(function(m){
      return '<div class="tl-i"><div class="tl-r">Chapters '+esc(m.r)+'</div>'+
        '<div class="tl-t">'+esc(m.t)+'</div><div class="tl-n">'+esc(m.n)+'</div></div>';
    }).join('')+'</div>';
  }
  return h;
}
function moveFor(b,n){
  for(var i=0;i<b.moves.length;i++){
    var p=b.moves[i].r.split('\u2013'), lo=parseInt(p[0],10), hi=parseInt(p[1]||p[0],10);
    if(!isNaN(lo)&&n>=lo&&n<=hi) return b.moves[i];
  }
  return null;
}
function tChapters(){
  var b=BOOKS[S.book], n=S.ch;
  var h='<div class="chg">';
  for(var i=1;i<=b.nch;i++)
    h+='<button class="chb'+(b.chapters[i]?' rich':'')+'" data-ch="'+i+
       '" aria-selected="'+(i===n)+'">'+i+'</button>';
  h+='</div>';
  var mv=moveFor(b,n), d=b.chapters[n];
  h+='<div class="card chd"><div class="num">'+n+'</div>';
  if(mv) h+='<div class="mv">'+esc(mv.t)+'</div>';
  h+='<div class="tx">'+esc(d||(mv?mv.n:'No chapter note written for this one yet.'))+'</div>';
  h+='<button class="btn" style="margin-top:13px" data-readch="'+n+'">Read chapter '+n+'</button></div>';
  var fx=factsFor(S.book).filter(function(f){return f.ch===n;});
  if(fx.length) h+=fx.map(factHTML).join('');
  return h;
}

/* ================= READER ================= */
function speakBarHTML(){
  if(!canRead())
    return '<div class="nospeak">Read aloud isn\u2019t available in this browser. '+
           'It works in Chrome, Edge and Safari.</div>';
  var on=S.speaking, pz=Speech.isPaused();
  var neural=(S.voiceMode==='kokoro'&&Kokoro.ready());
  var h='';
  if(S.voiceNotice) h+='<div class="nospeak">'+esc(S.voiceNotice)+'</div>';
  if(Kokoro.status()==='loading')
    h+='<div class="vload"><span class="spin"></span>Downloading the neural voice '+
       '(about 86 MB, once only)\u2026</div>';
  if(Kokoro.status()==='error')
    h+='<div class="nospeak">The neural voice couldn\u2019t load, so the device voice '+
       'is being used. '+esc(Kokoro.error())+'</div>';

  h+='<div class="sbar">';
  h+='<button class="play" data-a="'+(!on?'speak':(pz?'resume':'pause'))+'" title="'+
     (!on?'Read aloud':(pz?'Resume':'Pause'))+'">'+svg((!on||pz)?I.play:I.pause)+'</button>';
  h+='<div class="sinfo"><span class="st1">'+
     (on?(pz?'Paused':'Reading aloud'):'Read aloud')+'</span>'+
     '<span class="st2">'+(on?'Verse '+(S.speakAt+1):currentVoiceName())+'</span></div>';
  if(on) h+='<button class="sbtn" data-a="stopspeak" title="Stop">'+svg(I.close)+'</button>';
  h+='<button class="sbtn'+(neural?' on':'')+'" data-a="voicepicker" title="Voice">'+
     svg(I.voice)+'</button>';
  h+='<button class="sbtn" data-a="speakopts" title="Speed">'+svg(I.sort)+'</button>';
  h+='</div>';

  if(S.speakOpts){
    h+='<div class="sopts"><div class="lab">Speed</div><div class="rates">';
    [0.7,0.85,1,1.15,1.3,1.5].forEach(function(r){
      h+='<button data-rate="'+r+'" aria-selected="'+(Speech.getRate()===r)+'">'+r+'\u00d7</button>';
    });
    h+='</div><button class="fol" data-a="togglefollow" aria-selected="'+(!!S.follow)+'">'+
       (S.follow?'\u2713 ':'')+'Scroll to the verse being read</button></div>';
  }
  if(S.voicePicker) h+=voicePickerHTML();
  return h;
}

function currentVoiceName(){
  if(S.voiceMode==='kokoro'&&Kokoro.ready()){
    var v=KOKORO_VOICES.filter(function(x){return x.id===S.kokoroVoice;})[0];
    return 'Neural \u00b7 '+(v?v.name:S.kokoroVoice);
  }
  var sv=Speech.voices().filter(function(x){return x.voiceURI===S.sysVoiceURI;})[0];
  return sv?('Device \u00b7 '+sv.name):'Listen to this chapter';
}

function kokoroVoiceList(){
  var live=Kokoro.listVoices();
  if(!live) return KOKORO_VOICES;
  var known={}; KOKORO_VOICES.forEach(function(v){ known[v.id]=v; });
  return live.map(function(id){
    return known[id]||{id:id,name:id.replace(/^[abm]+_/,''),note:''};
  });
}

function voicePickerHTML(){
  var h='<div class="sopts vpick">';
  h+='<div class="lab">Neural voice \u2014 Kokoro</div>';
  if(!Kokoro.ready()&&Kokoro.status()!=='loading'){
    h+='<p class="vnote">Kokoro is an 82-million-parameter open-weight model that runs '+
       'entirely on this device. The weights download once (about 86 MB) and are cached '+
       'by the browser after that. It needs a connection the first time.</p>';
    h+='<button class="btn sec" data-a="loadkokoro">Use the neural voice</button>';
  } else {
    h+='<div class="vgrid">'+kokoroVoiceList().map(function(v){
      var sel=(S.voiceMode==='kokoro'&&S.kokoroVoice===v.id);
      return '<button class="vopt" data-kvoice="'+esc(v.id)+'" aria-selected="'+sel+'">'+
        '<span class="vn">'+esc(v.name)+'</span>'+
        (v.note?'<span class="vd">'+esc(v.note)+'</span>':'')+'</button>';
    }).join('')+'</div>';
  }
  var sv=Speech.voices();
  h+='<div class="lab" style="margin-top:14px">Device voices</div>';
  if(!sv.length){
    h+='<p class="vnote">This browser reports no built-in voices.</p>';
  } else {
    h+='<div class="vgrid">'+sv.slice(0,40).map(function(v){
      var sel=(S.voiceMode==='system'&&S.sysVoiceURI===v.voiceURI);
      return '<button class="vopt" data-svoice="'+esc(v.voiceURI)+'" aria-selected="'+sel+'">'+
        '<span class="vn">'+esc(v.name)+'</span>'+
        '<span class="vd">'+esc(v.lang||'')+'</span></button>';
    }).join('')+'</div>';
  }
  h+='</div>';
  return h;
}

function vRead(){
  var b=BOOKS[S.reading], n=S.ch;
  var vs=BIBLE[String(b.i)][String(n)]||[];
  var d=b.chapters[n], mv=moveFor(b,n);
  var h='<div class="rdbar">'+
    '<button data-step="-1"'+(n<=1?' disabled':'')+'>'+svg(I.back)+'</button>'+
    '<span class="pos">'+esc(b.name)+' '+n+' of '+b.nch+'</span>'+
    '<button data-step="1"'+(n>=b.nch?' disabled':'')+'>'+svg(I.next)+'</button></div>';
  h+='<div id="speakbar">'+speakBarHTML()+'</div>';
  if(d||mv) h+='<div class="chnote">'+esc(d||mv.n)+'</div>';
  h+='<div class="rd">'+vs.map(function(v,k){
      var key=vKey(b.i,n,k+1), col=S.hl[key];
      var hasNote=S.notes.some(function(x){return x.b===b.i&&x.c===n&&x.v===(k+1);});
      var jump='';
      if(S.jumpRef){
        var jr=parseKey(S.jumpRef.key);
        if(jr.b===b.i&&jr.c===n){
          var lo=jr.v,hi=S.jumpRef.end||jr.v;
          if((k+1)>=lo&&(k+1)<=hi) jump=' jump';
        }
      }
      return '<span class="v'+(col?' hl-'+col:'')+jump+'" data-vs="'+key+'"><sup>'+(k+1)+'</sup>'+esc(v)+
        (hasNote?'<span class="nb">'+svg(I.pen)+'</span>':'')+'</span>';
    }).join('')+'</div>';
  h+='<div style="height:8px"></div>';
  h+='<div class="row" style="gap:8px">'+
     (n>1?'<button class="btn sec" data-step="-1">Previous</button>':'')+
     (n<b.nch?'<button class="btn" data-step="1">Next chapter</button>':'')+'</div>';
  return h;
}

/* ================= TOPICS ================= */
function vTopics(){
  var h='<div class="sub" style="margin-top:0">Every fact below is drawn from Flavius Josephus, '+
        '<em>Antiquities of the Jews</em>, and cited to its book and chapter.</div>';
  var byEra={};
  FACTS.forEach(function(f){
    var b=BOOKS[f.book], k=eraOf(b).key;
    (byEra[k]=byEra[k]||[]).push(f);
  });
  META.eras.forEach(function(e){
    var fx=byEra[e.key]; if(!fx) return;
    h+='<div class="h2" style="display:flex;align-items:center;gap:8px">'+
       '<span style="width:9px;height:9px;border-radius:50%;background:'+e.color+'"></span>'+
       esc(e.name)+'</div>';
    h+=fx.map(factHTML).join('');
  });
  return h;
}

/* ================= PROFILE ================= */
function vProfile(){
  var nHl=Object.keys(S.hl).length;
  var nCh=BOOKS.reduce(function(a,b){return a+Object.keys(b.chapters).length;},0);
  var h='<div class="prof"><div class="av">SF</div>'+
        '<div class="nm">About Sword Forge</div>'+
        '<div class="em">1611 KJV with Apocrypha</div></div>';
  h+='<div class="stat"><div><b>80</b><span>Books</span></div>'+
     '<div><b>'+nHl+'</b><span>Highlights</span></div>'+
     '<div><b>'+S.notes.length+'</b><span>Notes</span></div></div>';
  if(nHl||S.notes.length){
    h+='<div class="cfilter" style="padding-bottom:14px">'+COLORS.map(function(c){
      var n=0; for(var k in S.hl){ if(S.hl[k]===c.k) n++; }
      return '<button class="cf" data-cf="'+c.k+'"><i style="background:'+c.dot+'"></i>'+
        c.n+' \u00b7 '+n+'</button>';}).join('')+'</div>';
  }
  h+='<div class="h2">What this is</div><div class="card about">'+
    '<p><b>The text.</b> The 66 books of the King James Bible, plus the 14 books of the Apocrypha. '+
    'The 1611 printing used the old orthography, where <em>u</em> and <em>v</em> were interchangeable '+
    'and a long <em>\u017f</em> stood for <em>s</em>; this edition carries modernised spelling, so '+
    '<em>haue</em> reads as <em>have</em>, with the wording untouched.</p>'+
    '<p><b>The Apocrypha.</b> Set from a 1800 Cambridge printing. It was read by optical character '+
    'recognition, so the wording is faithful but about one verse division in nine is merged with its '+
    'neighbour where the scan lost a numeral. No text is missing.</p>'+
    '<p><b>The facts.</b> Drawn from Flavius Josephus, <em>Antiquities of the Jews</em>, in William '+
    'Whiston\u2019s translation, each cited to book and chapter.</p>'+
    '<p><b>Chapter notes.</b> All 80 books have a scribe note, a historical setting and a chapter map. '+
    'Isaiah, Genesis and Daniel additionally have a written note on every single chapter.</p>'+
    '<p><b>Your highlights and notes</b> are stored on this device only. Nothing is uploaded. '+
    'If you open this file somewhere else, they will not follow you.</p>'+
    '<p><b>Sources.</b> King James Bible and Josephus\u2019s <em>Antiquities</em> from Project Gutenberg; '+
    'the Apocrypha from the Internet Archive. All in the public domain.</p></div>';
  return h;
}

/* ================= SEARCH ================= */
function vSearch(){
  return '<div class="search"><svg viewBox="0 0 24 24">'+I.search+
    '</svg><input id="q" placeholder="Search books, notes and text" value="'+esc(S.q)+'"></div>'+
    '<div id="results"></div>';
}
function runSearch(){
  var out=document.getElementById('results'); if(!out) return;
  var q=S.q.trim();
  if(q.length<2){out.innerHTML='<p class="empty">Type at least two characters to search '+
    '80 books and 36,000 verses.</p>';return;}
  var safe=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), rx=new RegExp(safe,'i'), res=[];
  BOOKS.forEach(function(b){
    if(rx.test(b.name)||rx.test(b.summary)||rx.test(b.scribe))
      res.push({r:b.name,t:b.summary,i:b.i,c:null});
    Object.keys(b.chapters).forEach(function(n){
      if(rx.test(b.chapters[n])) res.push({r:b.name+' '+n+' \u2014 note',t:b.chapters[n],i:b.i,c:+n});});
    b.prophecies.forEach(function(p){
      if(rx.test(p)) res.push({r:b.name+' \u2014 prophecy',t:p,i:b.i,c:null});});
  });
  FACTS.forEach(function(f){
    if(rx.test(f.title)||rx.test(f.text))
      res.push({r:'Josephus \u2014 '+f.cite,t:f.title,i:f.book,c:f.ch});});
  var hits=0;
  for(var bi=0;bi<BOOKS.length&&hits<50;bi++){
    var chs=BIBLE[String(bi)];
    for(var cn in chs){
      var vs=chs[cn];
      for(var v=0;v<vs.length;v++){
        if(rx.test(vs[v])){res.push({r:BOOKS[bi].name+' '+cn+':'+(v+1),t:vs[v],i:bi,c:+cn});
          if(++hits>=50) break;}
      }
      if(hits>=50) break;
    }
  }
  if(!res.length){out.innerHTML='<p class="empty">Nothing found for \u201c'+esc(q)+'\u201d.</p>';return;}
  out.innerHTML=res.slice(0,60).map(function(r){
    var t=esc(r.t);
    try{t=t.replace(new RegExp('('+safe+')','ig'),'<mark>$1</mark>');}catch(e){}
    return '<button class="res" data-book="'+r.i+'"'+(r.c?' data-goch="'+r.c+'"':'')+'>'+
      '<span class="r">'+esc(r.r)+'</span><span class="t">'+t+'</span></button>';
  }).join('');
}

/* ================= VERSE ACTION SHEET ================= */
function openSheet(key){
  S.sheet=key;
  var p=parseKey(key), cur=S.hl[key];
  var note=S.notes.filter(function(x){return x.b===p.b&&x.c===p.c&&x.v===p.v;})[0];
  var h='<div class="grab"></div>';
  h+='<div class="ref">'+esc(vRef(p.b,p.c,p.v))+'</div>';
  h+='<div class="vt">'+esc(vText(p.b,p.c,p.v))+'</div>';
  h+='<div class="sws">'+COLORS.map(function(c){
    return '<button class="sw" data-color="'+c.k+'" aria-selected="'+(cur===c.k)+'" '+
      'title="'+c.n+'" style="background:'+c.bg+'"><i style="background:'+c.dot+'"></i></button>';
  }).join('')+'</div>';
  h+='<div class="acts">';
  h+='<button class="btn sec" data-a="notefor">'+(note?'Edit note':'Add a note')+'</button>';
  if(cur) h+='<button class="btn gh" data-a="unhl">Remove highlight</button>';
  h+='<button class="btn gh" data-a="closesheet">Close</button></div>';
  sheet.innerHTML=h;
  sheet.classList.add('on'); scrim.classList.add('on');
}
function closeSheet(){ sheet.classList.remove('on'); scrim.classList.remove('on'); S.sheet=null; }

function setColor(key,col){
  if(S.hl[key]===col) delete S.hl[key]; else S.hl[key]=col;
  saveHl();
}

/* ================= NOTES ================= */
function noteFor(p){
  return S.notes.filter(function(x){return x.b===p.b&&x.c===p.c&&x.v===p.v;})[0];
}
function vNotes(){
  if(S.editing) return vNoteEdit();
  var h='<div class="search"><svg viewBox="0 0 24 24">'+I.search+
    '</svg><input id="nq" placeholder="Search your notes" value="'+esc(S.q)+'"></div>';
  var q=S.q.trim().toLowerCase();
  var list=S.notes.filter(function(n){
    return n.b==null || (BOOKS[n.b] && vText(n.b,n.c,n.v));
  }).sort(function(a,b){return b.ts-a.ts;});
  if(q) list=list.filter(function(n){
    var ref=n.b==null?'':vRef(n.b,n.c,n.v);
    var txt=n.b==null?'':vText(n.b,n.c,n.v);
    return (n.body||'').toLowerCase().indexOf(q)>-1 ||
           ref.toLowerCase().indexOf(q)>-1 ||
           txt.toLowerCase().indexOf(q)>-1;});
  if(!S.notes.length)
    return h+'<div class="empty">No notes yet.<br><br>Open any chapter, tap a verse, '+
      'and choose <b>Add a note</b>. Your notes are saved on this device.</div>'+fab();
  if(!list.length) return h+'<div class="empty">No notes match \u201c'+esc(S.q)+'\u201d.</div>'+fab();
  h+='<div class="sub" style="margin-top:0">'+list.length+' note'+(list.length>1?'s':'')+'</div>';
  h+=list.map(noteHTML).join('');
  return h+fab();
}
function fab(){ return '<button class="fab" data-a="newnote" title="New note">'+svg(I.plus)+'</button>'; }
function noteHTML(n){
  var d=new Date(n.ts), q=n.b==null?'':vText(n.b,n.c,n.v);
  return '<div class="note"><div class="nr">'+
    (n.b==null?'Unfiled note':esc(vRef(n.b,n.c,n.v)))+'</div>'+
    (q?'<p class="nq">'+esc(q.slice(0,150))+(q.length>150?'\u2026':'')+'</p>':'')+
    '<p class="nb">'+esc(n.body)+'</p>'+
    '<div class="nf"><span class="nd">'+d.toLocaleDateString()+'</span>'+
    (n.b==null?'':'<button data-open="'+n.id+'">Open</button>')+
    '<button data-editnote="'+n.id+'">Edit</button>'+
    '<button class="del" data-delnote="'+n.id+'">Delete</button></div></div>';
}
function vNoteEdit(){
  var e=S.editing;
  var h='<div class="lab">'+(e.id?'Edit note':'New note')+'</div>';
  if(e.b!=null){
    h+='<div class="card"><div class="nr" style="font-size:11.5px;font-weight:700;color:var(--blue);'+
       'letter-spacing:.04em;text-transform:uppercase">'+esc(vRef(e.b,e.c,e.v))+'</div>'+
       '<p style="margin:7px 0 0;font-size:13.5px;line-height:1.55;color:#475467">'+
       esc(vText(e.b,e.c,e.v))+'</p></div>';
  } else {
    h+='<div class="card"><p style="margin:0;font-size:13.5px;color:var(--ink2)">'+
       'Not linked to a verse. Open a chapter and tap a verse to attach one.</p></div>';
  }
  h+='<textarea class="ta" id="nbody" placeholder="Write your note\u2026">'+esc(e.body||'')+'</textarea>';
  h+='<div style="height:10px"></div>';
  h+='<button class="btn" data-a="savenote">Save note</button><div style="height:8px"></div>';
  h+='<button class="btn gh" data-a="cancelnote">Cancel</button>';
  return h;
}

/* ================= SAVES ================= */
function savedList(){
  var out=[];
  for(var k in S.hl){
    var p=parseKey(k);
    if(!BOOKS[p.b]||!CMAP[S.hl[k]]) continue;
    var t=vText(p.b,p.c,p.v);
    if(!t) continue;            // stale reference: skip rather than show a blank card
    out.push({key:k,b:p.b,c:p.c,v:p.v,color:S.hl[k],text:t});
  }
  return out;
}
function vSaves(){
  var all=savedList();
  var h='<div class="cfilter"><button class="cf" data-cf="all" aria-selected="'+
    (S.saveColor==='all')+'">All \u00b7 '+all.length+'</button>'+
    COLORS.map(function(c){
      var n=all.filter(function(x){return x.color===c.k;}).length;
      return '<button class="cf" data-cf="'+c.k+'" aria-selected="'+(S.saveColor===c.k)+'">'+
        '<i style="background:'+c.dot+'"></i>'+c.n+' \u00b7 '+n+'</button>';
    }).join('')+'</div>';
  h+='<div class="search"><svg viewBox="0 0 24 24">'+I.search+
     '</svg><input id="sq" placeholder="Search saved verses" value="'+esc(S.saveQ)+'"></div>';
  h+='<div class="seg"><button data-ss="book" aria-selected="'+(S.saveSort==='book')+
     '">By book</button><button data-ss="color" aria-selected="'+(S.saveSort==='color')+
     '">By colour</button><button data-ss="recent" aria-selected="'+(S.saveSort==='recent')+
     '">Recent</button></div>';

  if(!all.length)
    return h+'<div class="empty">Nothing saved yet.<br><br>Open any chapter, tap a verse, '+
      'and pick a colour. Highlights are saved on this device and collected here.</div>';

  var list=all;
  if(S.saveColor!=='all') list=list.filter(function(x){return x.color===S.saveColor;});
  var q=S.saveQ.trim().toLowerCase();
  if(q) list=list.filter(function(x){
    return x.text.toLowerCase().indexOf(q)>-1 || vRef(x.b,x.c,x.v).toLowerCase().indexOf(q)>-1;});
  if(!list.length) return h+'<div class="empty">No saved verses match that filter.</div>';

  var groups=[];
  if(S.saveSort==='color'){
    COLORS.forEach(function(c){
      var g=list.filter(function(x){return x.color===c.k;});
      if(g.length) groups.push([c.n+' \u00b7 '+g.length,g]);
    });
  } else if(S.saveSort==='recent'){
    groups=[['Most recent',list.slice().reverse()]];
  } else {
    var by={};
    list.forEach(function(x){(by[x.b]=by[x.b]||[]).push(x);});
    Object.keys(by).map(Number).sort(function(a,b){return a-b;}).forEach(function(bi){
      by[bi].sort(function(a,b){return a.c-b.c||a.v-b.v;});
      groups.push([BOOKS[bi].name+' \u00b7 '+by[bi].length,by[bi]]);
    });
  }
  groups.forEach(function(g){
    h+='<div class="grp">'+esc(g[0])+'</div>';
    h+=g[1].map(function(x){
      var t=esc(x.text);
      if(q){ try{ t=t.replace(new RegExp('('+S.saveQ.trim()
        .replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark>$1</mark>'); }catch(e){} }
      return '<button class="sv" data-goverse="'+x.key+'" style="background:'+CMAP[x.color].bg+'">'+
        '<span class="sr">'+esc(vRef(x.b,x.c,x.v))+'</span><span class="st">'+t+'</span></button>';
    }).join('');
  });
  return h;
}

/* ================= STUDY SHEETS ================= */
function findSheet(id){
  return S.sheets.filter(function(x){return x.id===id;})[0];
}
function vSheets(){
  if(S.sheetEdit) return vSheetEdit();
  if(S.sheet) return vSheetDetail();
  var h='<div class="sub" style="margin-top:0">Question-and-scripture study sheets. '+
        'Tap any reference to open it in the reader.</div>';
  if(!S.sheets.length)
    return h+'<div class="empty">No study sheets yet.</div>'+
      '<button class="btn" data-a="newsheet">New study sheet</button>';
  h+=S.sheets.map(function(sh){
    var n=sh.items.length;
    return '<button class="item" data-sheet="'+esc(sh.id)+'"><span class="ic">'+svg(I.grid)+
      '</span><span class="spacer"><span class="tt">'+esc(sh.name)+'</span>'+
      '<span class="dd">'+n+' entr'+(n===1?'y':'ies')+'</span></span>'+
      '<span class="go">'+svg(I.next)+'</span></button>';
  }).join('');
  h+='<div style="height:6px"></div><button class="btn sec" data-a="newsheet">New study sheet</button>';
  return h;
}
function vSheetDetail(){
  var sh=findSheet(S.sheet);
  if(!sh){ S.sheet=null; return vSheets(); }
  var h='<button class="back" data-a="closesheetv">&larr; Study</button>';
  h+='<div class="bhead"><h2>'+esc(sh.name)+'</h2>'+
     (sh.desc?'<div class="full">'+esc(sh.desc)+'</div>':'')+'</div>';
  h+='<div class="search"><svg viewBox="0 0 24 24">'+I.search+
     '</svg><input id="shq" placeholder="Search this sheet" value="'+esc(S.sheetQ)+'"></div>';
  var q=S.sheetQ.trim().toLowerCase();
  var items=sh.items;
  if(q) items=items.filter(function(it){
    return it.q.toLowerCase().indexOf(q)>-1 || (it.refs||'').toLowerCase().indexOf(q)>-1;});
  if(!items.length) return h+'<div class="empty">Nothing in this study sheet matches.</div>';
  h+=items.map(function(it){
    var refs=parseRefs(it.refs);
    return '<div class="sq"><div class="sqh"><span class="sqn">'+(it.n||'')+'</span>'+
      '<span class="sqq">'+esc(it.q)+'</span></div>'+
      (it.note?'<div class="snote">'+esc(it.note)+'</div>':'')+
      '<div class="reflist">'+refs.map(function(r){
        return r.ok
          ? '<button class="ref'+(r.approx?' approx':'')+'" data-ref="'+r.b+':'+r.c+':'+(r.v1||1)+
            '" data-refend="'+(r.v2||r.v1||0)+'" title="'+
            (r.approx?'This edition of the Apocrypha merges a few verse divisions, '+
             'so this opens the chapter':'')+'">'+esc(r.label)+(r.approx?' \u00b7 ch':'')+'</button>'
          : '<span class="ref off">'+esc(r.label)+'</span>';
      }).join('')+'</div>'+
      '<div class="sqf"><button data-edititem="'+esc(it.id)+'">Edit</button>'+
      '<button class="del" data-delitem="'+esc(it.id)+'">Delete</button></div></div>';
  }).join('');
  h+='<div style="height:8px"></div><button class="btn" data-a="newitem">Add an entry</button>';
  h+='<div style="height:8px"></div><button class="btn gh" data-a="delsheet">Delete this sheet</button>';
  return h;
}
function vSheetEdit(){
  var e=S.sheetEdit;
  if(e.kind==='sheet'){
    return '<div class="lab">'+(e.id?'Rename study sheet':'New study sheet')+'</div>'+
      '<input class="sbox2" id="shname" placeholder="Study sheet name" value="'+esc(e.name||'')+'">'+
      '<textarea class="ta" id="shdesc" style="min-height:80px" '+
      'placeholder="Description (optional)">'+esc(e.desc||'')+'</textarea>'+
      '<div style="height:10px"></div><button class="btn" data-a="savesheet">Save</button>'+
      '<div style="height:8px"></div><button class="btn gh" data-a="cancelsheet">Cancel</button>';
  }
  var preview=parseRefs(e.refs||'');
  var bad=preview.filter(function(r){return !r.ok;});
  var h='<div class="lab">'+(e.id?'Edit entry':'New entry')+'</div>';
  h+='<input class="sbox2" id="itq" placeholder="Question" value="'+esc(e.q||'')+'">';
  h+='<textarea class="ta" id="itr" style="min-height:90px" '+
     'placeholder="References, e.g. Matthew 19:16-17; Baruch 4:1">'+esc(e.refs||'')+'</textarea>';
  h+='<div class="card" style="margin-top:10px"><div class="lab">Resolves to</div>'+
     (preview.length?'<div class="reflist">'+preview.map(function(r){
        return '<span class="ref'+(r.ok?'':' off')+'">'+esc(r.label)+'</span>';}).join('')+'</div>'
      :'<p style="margin:0;font-size:13px;color:var(--ink2)">Nothing yet.</p>');
  if(bad.length) h+='<p style="margin:9px 0 0;font-size:12.5px;color:#B4405A">'+
     bad.length+' reference'+(bad.length>1?'s':'')+' could not be matched to a book and chapter. '+
     'They will still be shown, just not tappable.</p>';
  h+='</div>';
  h+='<div style="height:10px"></div><button class="btn" data-a="saveitem">Save entry</button>';
  h+='<div style="height:8px"></div><button class="btn gh" data-a="cancelitem">Cancel</button>';
  return h;
}

/* ================= BIBLE BROWSER ================= */
function vBible(){
  if(S.bibleBook!==null&&BOOKS[S.bibleBook]) return vBibleChapters();
  var h='<div class="search"><svg viewBox="0 0 24 24">'+I.search+
    '</svg><input id="bq" placeholder="Find a book" value="'+esc(S.bibleQ||'')+'"></div>';
  var q=(S.bibleQ||'').trim().toLowerCase();
  var any=false;
  META.sections.forEach(function(sec){
    var bks=BOOKS.filter(function(b){
      return b.section===sec.key &&
        (!q || b.name.toLowerCase().indexOf(q)>-1 || b.full.toLowerCase().indexOf(q)>-1);});
    if(!bks.length) return;
    any=true;
    h+='<div class="h2">'+esc(sec.name)+'</div>';
    h+='<div class="bgrid">'+bks.map(function(b){
      return '<button class="bk" data-biblebook="'+b.i+'" style="--bc:'+eraOf(b).color+'">'+
        '<span class="n">'+esc(b.name)+'</span>'+
        '<span class="m">'+b.nch+' chapter'+(b.nch>1?'s':'')+'</span></button>';
    }).join('')+'</div>';
  });
  if(!any) h+='<div class="empty">No book matches \u201c'+esc(S.bibleQ||'')+'\u201d.</div>';
  return h;
}
function vBibleChapters(){
  var b=BOOKS[S.bibleBook];
  var h='<button class="back" data-a="closebible">&larr; All books</button>';
  h+='<div class="bhead"><h2>'+esc(b.name)+'</h2>'+
     '<div class="full">'+esc(b.full)+'</div>'+
     '<div class="pills"><span>'+esc(SEC[b.section].name)+'</span>'+
     '<span>'+b.nch+' chapters</span></div></div>';
  h+='<div class="lab">Choose a chapter</div><div class="chg">';
  for(var i=1;i<=b.nch;i++)
    h+='<button class="chb'+(b.chapters[i]?' rich':'')+'" data-biblech="'+i+'">'+i+'</button>';
  h+='</div>';
  h+='<button class="btn sec" data-bookpage="'+b.i+'">Open study notes for '+esc(b.name)+'</button>';
  return h;
}

/* ================= TOC DRAWER ================= */
function buildTOC(){
  var h='';
  if(S.drawerBook!==null&&BOOKS[S.drawerBook]){
    var b=BOOKS[S.drawerBook];
    h+='<div class="sec"><button class="dback" data-a="drawerback">&larr; All books</button></div>';
    h+='<div class="dtitle">'+esc(b.name)+'<span>'+b.nch+' chapters</span></div>';
    h+='<div class="dchg">';
    for(var i=1;i<=b.nch;i++)
      h+='<button class="dch'+(b.chapters[i]?' rich':'')+'" data-drawerch="'+i+'">'+i+'</button>';
    h+='</div>';
  } else {
    META.sections.forEach(function(sec){
      var bks=BOOKS.filter(function(b){return b.section===sec.key;});
      if(!bks.length) return;
      h+='<div class="sec">'+esc(sec.name)+'</div>';
      h+=bks.map(function(b){
        return '<button data-drawerbook="'+b.i+'">'+esc(b.name)+
               '<span class="dn">'+b.nch+'</span></button>';}).join('');
    });
    h+='<div class="sec">More</div>';
    h+='<button data-a="showabout">About Sword Forge</button>';
  }
  toc.innerHTML=h;
}
function openDrawer(o){drawer.classList.toggle('on',o);scrim.classList.toggle('on',o);}

/* ================= RENDER ================= */
function render(){
  renderTop(); renderNav();
  var h;
  if(S.reading!==null) h=vRead();
  else if(S.book!==null) h=vBook();
  else h=({home:vHome,library:vLibrary,topics:vTopics,notes:vNotes,
           saves:vSaves,bible:vBible,about:vProfile,search:vSearch})[S.tab]();
  view.innerHTML=h;
  if(!S.keepScroll) view.scrollTop=0;
  S.keepScroll=false;
  if(S.tab==='search'&&S.book===null&&S.reading===null){
    var q=document.getElementById('q');
    if(q){q.addEventListener('input',function(){S.q=q.value;runSearch();});q.focus();}
    runSearch();
  }
  var nq=document.getElementById('nq');
  if(nq) nq.addEventListener('input',function(){S.q=nq.value;S.keepScroll=true;render();
    var e=document.getElementById('nq'); if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}});
  var sq=document.getElementById('sq');
  if(sq) sq.addEventListener('input',function(){S.saveQ=sq.value;S.keepScroll=true;render();
    var e=document.getElementById('sq'); if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}});
  var bq=document.getElementById('bq');
  if(bq) bq.addEventListener('input',function(){S.bibleQ=bq.value;S.keepScroll=true;render();
    var e=document.getElementById('bq'); if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}});
  var shq=document.getElementById('shq');
  if(shq) shq.addEventListener('input',function(){S.sheetQ=shq.value;S.keepScroll=true;render();
    var e=document.getElementById('shq'); if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}});
  if(S.reading!==null) paintSpeaking();
  var nb=document.getElementById('nbody');
  if(nb) nb.addEventListener('input',function(){S.editing.body=nb.value;});
}

document.addEventListener('click',function(ev){
  var t=ev.target.closest('[data-nav],[data-a],[data-mode],[data-era],[data-book],[data-sec],'+
    '[data-btab],[data-ch],[data-readch],[data-step],[data-vs],[data-color],[data-cf],'+
    '[data-ss],[data-goverse],[data-editnote],[data-delnote],[data-open],[data-rate],'+
    '[data-sheet],[data-ref],[data-edititem],[data-delitem],'+
    '[data-biblebook],[data-biblech],[data-bookpage],[data-drawerbook],[data-drawerch],'+
    '[data-kvoice],[data-svoice]');
  if(!t) return;
  var d=t.dataset;

  /* --- bible browser + drawer --- */
  if(d.biblebook){ S.bibleBook=+d.biblebook; render(); return; }
  if(d.a==='closebible'){ S.bibleBook=null; render(); return; }
  if(d.biblech){
    stopSpeaking(); S.jumpRef=null;
    S.book=S.bibleBook; S.reading=S.bibleBook; S.ch=+d.biblech; render(); return; }
  if(d.bookpage){
    S.book=+d.bookpage; S.reading=null; S.btab='overview'; S.ch=1; render(); return; }
  if(d.drawerbook){ S.drawerBook=+d.drawerbook; buildTOC(); return; }
  if(d.a==='drawerback'){ S.drawerBook=null; buildTOC(); return; }
  if(d.drawerch){
    stopSpeaking(); S.jumpRef=null;
    S.book=S.drawerBook; S.reading=S.drawerBook; S.ch=+d.drawerch;
    S.drawerBook=null; openDrawer(false); render(); return; }
  if(d.a==='showabout'){
    openDrawer(false); S.drawerBook=null;
    S.tab='about'; S.book=null; S.reading=null; render(); return; }

  /* --- study sheets --- */
  if(d.sheet){ S.sheet=d.sheet; S.sheetQ=''; render(); return; }
  if(d.a==='closesheetv'){ S.sheet=null; S.sheetQ=''; render(); return; }
  if(d.a==='newsheet'){
    S.sheetEdit={kind:'sheet',id:null,name:'',desc:''}; render(); return; }
  if(d.a==='savesheet'){
    var nm=(document.getElementById('shname')||{}).value||'';
    var ds=(document.getElementById('shdesc')||{}).value||'';
    if(!nm.trim()){ S.sheetEdit=null; render(); return; }
    var ed=S.sheetEdit;
    if(ed.id){ var t=findSheet(ed.id); if(t){ t.name=nm; t.desc=ds; } }
    else { S.sheets.push({id:'s'+Date.now(),name:nm,desc:ds,items:[]}); }
    saveSheets(); S.sheetEdit=null; render(); return; }
  if(d.a==='cancelsheet'||d.a==='cancelitem'){ S.sheetEdit=null; render(); return; }
  if(d.a==='delsheet'){
    S.sheets=S.sheets.filter(function(x){return x.id!==S.sheet;});
    saveSheets(); S.sheet=null; render(); return; }
  if(d.a==='newitem'){
    S.sheetEdit={kind:'item',id:null,q:'',refs:''}; render(); return; }
  if(d.edititem){
    var sh0=findSheet(S.sheet);
    var it0=sh0&&sh0.items.filter(function(x){return x.id===d.edititem;})[0];
    if(it0) S.sheetEdit={kind:'item',id:it0.id,q:it0.q,refs:it0.refs};
    render(); return; }
  if(d.delitem){
    var sh1=findSheet(S.sheet);
    if(sh1) sh1.items=sh1.items.filter(function(x){return x.id!==d.delitem;});
    saveSheets(); render(); return; }
  if(d.a==='saveitem'){
    var q0=(document.getElementById('itq')||{}).value||'';
    var r0=(document.getElementById('itr')||{}).value||'';
    var sh2=findSheet(S.sheet);
    if(!q0.trim()||!sh2){ S.sheetEdit=null; render(); return; }
    var ed2=S.sheetEdit;
    if(ed2.id){
      sh2.items.forEach(function(x){ if(x.id===ed2.id){ x.q=q0; x.refs=r0; } });
    } else {
      var maxn=0; sh2.items.forEach(function(x){ if(+x.n>maxn) maxn=+x.n; });
      sh2.items.push({id:'i'+Date.now(),n:maxn+1,q:q0,refs:r0});
    }
    saveSheets(); S.sheetEdit=null; render(); return; }
  if(d.ref){
    var r=parseKey(d.ref);
    stopSpeaking();
    S.book=r.b; S.reading=r.b; S.ch=r.c;
    S.jumpRef={key:d.ref, end:+(d.refend||0)};
    render();
    setTimeout(function(){
      var el=document.querySelector('[data-vs="'+d.ref+'"]');
      if(el) el.scrollIntoView({block:'center'});
    },40);
    return; }

  /* --- read aloud --- */
  if(d.a==='speak'){ speakChapter(0); return; }
  if(d.a==='pause'){ Speech.pause(); renderSpeakBar(); return; }
  if(d.a==='resume'){ Speech.resume(); renderSpeakBar(); return; }
  if(d.a==='stopspeak'){ stopSpeaking(); return; }
  if(d.a==='speakopts'){ S.speakOpts=!S.speakOpts; S.voicePicker=false; renderSpeakBar(); return; }
  if(d.a==='voicepicker'){ S.voicePicker=!S.voicePicker; S.speakOpts=false; renderSpeakBar(); return; }
  if(d.a==='loadkokoro'){ enableKokoro(S.speaking); renderSpeakBar(); return; }
  if(d.kvoice){
    S.kokoroVoice=d.kvoice; S.voiceMode='kokoro'; S.voiceNotice=''; saveVoice();
    if(!Kokoro.ready()){ enableKokoro(S.speaking); renderSpeakBar(); return; }
    if(S.speaking){ var at=Math.max(0,S.speakAt); stopSpeaking(); speakChapter(at); }
    renderSpeakBar(); return; }
  if(d.svoice){
    S.voiceMode='system'; applySysVoice(d.svoice); S.voiceNotice=''; saveVoice();
    if(S.speaking){ var at2=Math.max(0,S.speakAt); stopSpeaking(); speakChapter(at2); }
    renderSpeakBar(); return; }
  if(d.a==='togglefollow'){ S.follow=!S.follow; renderSpeakBar(); return; }
  if(d.rate){
    var wasOn=S.speaking, at=S.speakAt;
    Speech.setRate(parseFloat(d.rate)); saveVoice();
    if(wasOn){ Speech.stop(); speakChapter(Math.max(0,at)); }
    renderSpeakBar(); return; }

  /* --- highlighting --- */
  if(d.vs){openSheet(d.vs);return;}
  if(d.color){
    var k=S.sheet; if(!k) return;
    setColor(k,d.color); closeSheet(); render(); return;}
  if(d.a==='unhl'){ if(S.sheet){delete S.hl[S.sheet];saveHl();} closeSheet(); render(); return;}
  if(d.a==='closesheet'){closeSheet();return;}

  /* --- notes --- */
  if(d.a==='notefor'){
    var p=parseKey(S.sheet), ex=noteFor(p);
    S.editing=ex?{id:ex.id,b:ex.b,c:ex.c,v:ex.v,body:ex.body}
                :{id:null,b:p.b,c:p.c,v:p.v,body:''};
    closeSheet(); S.tab='notes'; S.book=null; S.reading=null; render(); return;}
  if(d.a==='newnote'){
    S.editing={id:null,b:null,c:null,v:null,body:''}; render(); return;}
  if(d.editnote){
    var n=S.notes.filter(function(x){return x.id===d.editnote;})[0];
    if(n){S.editing={id:n.id,b:n.b,c:n.c,v:n.v,body:n.body};render();} return;}
  if(d.delnote){
    S.notes=S.notes.filter(function(x){return x.id!==d.delnote;});
    saveNotes(); render(); return;}
  if(d.open){
    var o=S.notes.filter(function(x){return x.id===d.open;})[0];
    if(o&&o.b!=null){S.book=o.b;S.reading=o.b;S.ch=o.c;S.tab='notes';render();}
    return;}
  if(d.a==='savenote'){
    var e=S.editing; if(!e) return;
    var body=(document.getElementById('nbody')||{}).value;
    if(body!==undefined) e.body=body;
    if(!(e.body||'').trim()){S.editing=null;render();return;}
    if(e.id){
      S.notes.forEach(function(x){if(x.id===e.id){x.body=e.body;x.ts=Date.now();}});
    } else {
      S.notes.push({id:'n'+Date.now()+Math.floor(Math.random()*999),
        b:e.b,c:e.c,v:e.v,body:e.body,ts:Date.now()});
    }
    saveNotes(); S.editing=null; render(); return;}
  if(d.a==='cancelnote'){S.editing=null;render();return;}

  /* --- saves --- */
  if(d.cf){S.saveColor=d.cf;S.tab='saves';S.book=null;S.reading=null;render();return;}
  if(d.ss){S.saveSort=d.ss;render();return;}
  if(d.goverse){
    var g=parseKey(d.goverse);
    S.book=g.b;S.reading=g.b;S.ch=g.c;render();
    setTimeout(function(){
      var el=document.querySelector('[data-vs="'+d.goverse+'"]');
      if(el){el.scrollIntoView({block:'center'});el.classList.add('sel');
        setTimeout(function(){el.classList.remove('sel');},1600);}
    },40);
    return;}

  if(d.nav){stopSpeaking();S.tab=d.nav;S.book=null;S.reading=null;S.editing=null;
    S.bibleBook=null;S.bibleQ='';S.jumpRef=null;render();return;}
  if(d.a==='search'){S.tab='search';S.book=null;S.reading=null;render();return;}
  if(d.a==='toc'){S.drawerBook=null;buildTOC();openDrawer(true);return;}
  if(d.a==='closeread'){stopSpeaking();S.jumpRef=null;S.reading=null;render();return;}
  if(d.a==='closebook'){S.book=null;render();return;}
  if(d.mode){S.mode=d.mode;S.openEra=null;render();return;}
  if(d.era){S.openEra=(S.openEra===d.era?null:d.era);render();return;}
  if(d.sec){S.tab='library';S.mode='shelf';render();
    var el=[].slice.call(document.querySelectorAll('.h2')).filter(function(x){
      return x.textContent===SEC[d.sec].name;})[0];
    if(el) el.scrollIntoView({block:'start'});return;}
  if(d.book!==undefined&&d.book!==''){
    openDrawer(false);
    S.book=+d.book; S.ch=d.goch?+d.goch:1;
    if(d.goch){S.reading=S.book;} else {S.reading=null;S.btab='overview';}
    render();return;}
  if(d.btab){S.btab=d.btab;render();return;}
  if(d.ch){S.ch=+d.ch;render();return;}
  if(d.readch){stopSpeaking();S.reading=S.book;S.ch=+d.readch;render();return;}
  if(d.step){stopSpeaking();S.jumpRef=null;S.ch+=(+d.step);render();return;}
});
scrim.addEventListener('click',function(){openDrawer(false);S.drawerBook=null;closeSheet();});
function fail(msg){
  view.innerHTML='<div class="empty"><b>Could not load the scriptures.</b><br><br>'+
    esc(msg)+'<br><br>If you are opening this file directly from your computer, '+
    'the browser blocks reading the data files. Serve the folder over http instead '+
    '\u2014 for example <code>python3 -m http.server</code> \u2014 or host it.</div>';
}
function boot(){
  view.innerHTML='<div class="empty">Loading the scriptures\u2026</div>';
  Promise.all([
    fetch('assets/data/meta.json').then(function(r){
      if(!r.ok) throw new Error('meta.json: '+r.status); return r.json(); }),
    fetch('assets/data/bible.json').then(function(r){
      if(!r.ok) throw new Error('bible.json: '+r.status); return r.json(); })
  ]).then(function(res){
    META=res[0]; BIBLE=res[1];
    indexData();
    loadAll(render);
  }).catch(function(e){ fail((e&&e.message)||'unknown error'); });
}
boot();

if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  });
}