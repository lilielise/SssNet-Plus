// public/script.js - frontend interactions (reels, search suggestions, events, likes/comments)

// ---------- SEARCH suggestions ----------
let searchTimer = null;
document.addEventListener("DOMContentLoaded", ()=>{
  const input = document.getElementById("search");
  if(input){
    input.addEventListener("input", (e)=>{
      const q = e.target.value.trim();
      if(searchTimer) clearTimeout(searchTimer);
      if(!q) return hideSuggestions();
      searchTimer = setTimeout(()=> showSuggestions(q), 300);
    });
    input.addEventListener("keydown", (e)=>{
      if(e.key === "Enter"){
        const q = e.target.value.trim();
        if(q) redirectToArtistByName(q);
      }
    });
  }
  loadReels();
  loadEvents('ongoing');
  setInterval(()=>loadEvents('ongoing'), 8000);
});

async function showSuggestions(q){
  try{
    const res = await fetch("/artists");
    const list = await res.json();
    const matches = list.filter(a => a.name.toLowerCase().includes(q.toLowerCase())).slice(0,6);
    const box = document.getElementById("search-suggestions");
    if(matches.length === 0){ box.style.display='none'; return; }
    box.innerHTML = matches.map(m => `<div class="suggest-item" onclick="goToArtist(${m.id})">${escapeHtml(m.name)}</div>`).join("");
    box.style.display = 'block';
  }catch(err){ console.error(err); }
}
function hideSuggestions(){ const box = document.getElementById("search-suggestions"); if(box) box.style.display='none'; }
function goToArtist(id){ location.href = "/artist.html?id="+id; }
function redirectToArtistByName(name){
  fetch("/artists").then(r=>r.json()).then(list=>{
    const exact = list.find(a=>a.name.toLowerCase()===name.toLowerCase());
    if(exact) goToArtist(exact.id);
    else {
      const first = list.find(a=>a.name.toLowerCase().includes(name.toLowerCase()));
      if(first) goToArtist(first.id);
      else alert("Artis tidak ditemukan");
    }
  });
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

// ---------- REELS rendering + behavior ----------
async function loadReels(){
  const list = await fetch("/videos").then(r=>r.json());
  const c = document.getElementById("reel-list");
  if(!list.length){ c.innerHTML = "<p>Belum ada reels.</p>"; return; }
  c.innerHTML = list.map(v=>`
    <div class="reel-item card" data-id="${v.id}">
      <video src="${v.file}" playsinline preload="metadata" loop muted></video>
      <div class="reel-meta">
        <div style="font-weight:700">${v.artistId ? 'Artist '+v.artistId : 'Unknown'}</div>
        <div style="margin-top:6px">
          <button onclick="toggleLike('video',${v.id}); event.stopPropagation()" class="btn">♥</button>
          <button onclick="openComments('video',${v.id}); event.stopPropagation()" class="btn" style="background:#666">💬</button>
        </div>
      </div>
    </div>
  `).join("");
  setupReels();
}

function setupReels(){
  const reelList = document.getElementById("reel-list");
  if(!reelList) return;
  const items = Array.from(reelList.querySelectorAll(".reel-item"));
  const options = { root:null, rootMargin:'0px', threshold: 0.55 };
  const observer = new IntersectionObserver((entries)=>{
    entries.forEach(entry => {
      const vid = entry.target.querySelector("video");
      if(!vid) return;
      if(entry.isIntersecting){
        // autoplay muted (mobile usually requires user gesture for sound)
        vid.play().catch(()=>{});
      } else {
        vid.pause();
        vid.currentTime = 0;
      }
    });
  }, options);

  items.forEach(item => {
    observer.observe(item);
    // click to fullscreen
    item.addEventListener("click", (e)=>{
      // open fullscreen mode for this item
      openFullscreenForItem(item);
    });
  });
}

function openFullscreenForItem(item){
  // add fullscreen class and request fullscreen
  item.requestFullscreen?.();
  // manage swipe navigation
  const reelList = document.getElementById("reel-list");
  const items = Array.from(reelList.querySelectorAll(".reel-item"));
  let currentIndex = items.indexOf(item);
  // play the clicked video (unmute after user interaction)
  const vid = items[currentIndex].querySelector("video");
  vid.muted = false;
  vid.play().catch(()=>{});

  let startY = 0;
  const onTouchStart = (e) => startY = e.touches ? e.touches[0].clientY : e.clientY;
  const onTouchEnd = (e) => {
    const endY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const dy = endY - startY;
    if(dy < -60){ navigate(1); } else if(dy > 60){ navigate(-1); }
  };
  function navigate(dir){
    const nextIndex = (currentIndex + dir + items.length) % items.length;
    const cur = items[currentIndex]; const next = items[nextIndex];
    const curVid = cur.querySelector("video"); const nextVid = next.querySelector("video");
    if(curVid){ curVid.pause(); curVid.currentTime = 0; curVid.muted = true; }
    next.scrollIntoView({ behavior:"smooth", block:"center" });
    nextVid.muted = false; nextVid.play().catch(()=>{});
    currentIndex = nextIndex;
  }
  document.addEventListener("touchstart", onTouchStart, { passive:true });
  document.addEventListener("touchend", onTouchEnd);
  document.addEventListener("fullscreenchange", ()=> {
    if(!document.fullscreenElement){
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    }
  });
}

// ---------- Events ----------
async function loadEvents(status){
  const res = await fetch("/events?status="+(status||""));
  const list = await res.json();
  const el = document.getElementById("events-list");
  if(!list.length){ el.innerHTML = "<p>Tidak ada event.</p>"; return; }
  el.innerHTML = list.map(ev=>`
    <div class="song card">
      <div class="song-info">
        <h3>${ev.name}</h3>
        <div class="small">${ev.status} • ${new Date(ev.startAt).toLocaleString()} → ${new Date(ev.endAt).toLocaleString()}</div>
        <div style="margin-top:8px">
          <a href="/event.html?id=${ev.id}"><button class="btn">Open Event</button></a>
        </div>
      </div>
    </div>
  `).join("");
}

// ---------- Likes & Comments client helpers ----------
async function toggleLike(type, targetId){
  await fetch("/like", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ type, targetId })});
  alert("Toggled like");
}
async function openComments(type, targetId){
  // simple modal-like prompt for quick testing
  const list = await fetch(`/comments?type=${type}&targetId=${targetId}`).then(r=>r.json());
  let out = "Comments:\\n";
  list.forEach(c=> { out += `${c.user.name}: ${c.text} (${new Date(c.createdAt).toLocaleString()})\\n`; if(c.replies) c.replies.forEach(r=> out += `  ↳ ${r.user.name}: ${r.text}\\n`); });
  out += "\\nTulis komentar baru:";
  const text = prompt(out);
  if(text) {
    await fetch("/comments", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ type, targetId, userName: "Anon", text })});
    alert("Komentar terkirim");
  }
}
