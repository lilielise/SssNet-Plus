// public/script.js - SSSNET_APPLY_V2
function getSession(){
  try{ return JSON.parse(localStorage.getItem("sssnet_session")); }catch(e){ return null; }
}
function setSession(obj){ localStorage.setItem("sssnet_session", JSON.stringify(obj)); updateProfileUI(); }
function clearSession(){ localStorage.removeItem("sssnet_session"); updateProfileUI(); }

function updateProfileUI(){
  const s = getSession();
  const profileLink = document.getElementById("profileLink");
  const navProfile = document.getElementById("navProfile");
  const dashPlaceholder = document.getElementById("dashNavPlaceholder");
  if(!profileLink) return;
  if(!s){
    profileLink.innerText = "Login / Daftar";
    navProfile.innerText = "Profile";
    dashPlaceholder.innerHTML = "";
  } else {
    profileLink.innerText = s.name || "Profil";
    navProfile.innerText = s.name || "Profile";
    if(s.role === "artist" && s.approved){
      dashPlaceholder.innerHTML = `<a href="/artist_dashboard.html?id=${s.artistId}" style="font-weight:700;color:#d01871">DASHBOARD</a>`;
    } else dashPlaceholder.innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", ()=>{ updateProfileUI(); });

// Search suggestions
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
function goToArtist(id){ hideSuggestions(); location.href = "/artist.html?id="+id; }
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

// Events tab persistence
let currentEventTab = 'ongoing';
function setEventsTab(tab){
  currentEventTab = tab;
  loadEvents(tab);
}
async function loadEvents(status){
  const res = await fetch("/events?status="+(status||""));
  const list = await res.json();
  const el = document.getElementById("events-list");
  if(!list || !list.length){ el.innerHTML = "<p>Tidak ada event.</p>"; return; }
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
setInterval(()=> loadEvents(currentEventTab), 7000);

// Reels preview small
async function loadReels(){
  const list = await fetch("/videos").then(r=>r.json());
  const c = document.getElementById("reel-list");
  if(!list.length){ c.innerHTML = "<p>Belum ada reels.</p>"; return; }
  c.innerHTML = list.map(v=>`
    <div class="card" style="display:flex;gap:12px;align-items:center;padding:8px;cursor:pointer" onclick="openFullReel('${v.id}','${v.file}')">
      <div style="width:150px;flex-shrink:0">
        <video src="${v.file}" playsinline muted loop preload="metadata" style="width:150px;height:84px;object-fit:cover;border-radius:8px"></video>
      </div>
      <div>
        <div style="font-weight:700">${v.artistId ? 'Artist '+v.artistId : 'Unknown'}</div>
        <div class="small-muted">${new Date(v.createdAt).toLocaleDateString()}</div>
      </div>
      <div style="margin-left:auto">
        <button class="btn" onclick="toggleLike('video',${v.id}); event.stopPropagation()">♥</button>
      </div>
    </div>
  `).join("");
  document.querySelectorAll("#reel-list video").forEach(vid => { vid.play().catch(()=>{}); });
}

function openFullReel(id, src){
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.left = 0; overlay.style.top = 0; overlay.style.right = 0; overlay.style.bottom = 0;
  overlay.style.background = "rgba(0,0,0,0.95)";
  overlay.style.zIndex = 9999;
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.innerHTML = `
    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column">
      <video id="fullReelVid" src="${src}" controls style="max-width:100%;max-height:90vh;object-fit:contain"></video>
      <div style="margin-top:10px">
        <button class="btn" id="closeReelBtn">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const v = document.getElementById("fullReelVid");
  v.currentTime = 0;
  v.muted = false;
  v.play().catch(()=>{});
  document.getElementById("closeReelBtn").addEventListener("click", ()=> { v.pause(); overlay.remove(); });
}

async function toggleLike(type, targetId){
  await fetch("/like", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ type, targetId })});
}

async function openComments(type, targetId){
  const list = await fetch(`/comments?type=${type}&targetId=${targetId}`).then(r=>r.json());
  let out = "Comments:\\n";
  list.forEach(c=> { out += `${c.user.name}: ${c.text} (${new Date(c.createdAt).toLocaleString()})\\n`; if(c.replies) c.replies.forEach(r=> out += `  ↳ ${r.user.name}: ${r.text}\\n`); });
  out += "\\nTulis komentar baru:";
  const text = prompt(out);
  if(text) {
    await fetch("/comments", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ type, targetId, userName: getSession()?.name || "Guest", text })});
    alert("Komentar terkirim");
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  setEventsTab('ongoing');
  loadReels();
  updateProfileUI();
});
