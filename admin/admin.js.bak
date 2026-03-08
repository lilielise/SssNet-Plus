// admin.js (admin client)
let songRowCounter = 0;

async function initAdmin(){
  addSongRow();
  loadRequests();
  loadArtists();
  loadEventsAdmin();
  loadNewsAdmin();
  setupSSE();
}

function addSongRow(){
  const cont = document.getElementById("songs_container");
  const id = Date.now() + (songRowCounter++);
  const div = document.createElement("div");
  div.className = "song-row card";
  div.id = "songrow_"+id;
  div.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center">
      <input id="title_${id}" class="input" placeholder="Title">
      <input id="artist_${id}" class="input" placeholder="Artist name">
      <input id="coverurl_${id}" class="input" placeholder="Cover URL (upload first)">
      <button class="btn" onclick="removeSongRow('${id}')">X</button>
    </div>
  `;
  cont.appendChild(div);
}

function removeSongRow(id){ const el = document.getElementById("songrow_"+id); if(el) el.remove(); }

async function submitEvent(){
  const name = document.getElementById("ev_name").value;
  const startAt = document.getElementById("ev_start").value;
  const endAt = document.getElementById("ev_end").value;
  if(!name||!startAt||!endAt) return alert("Lengkapi nama/start/end");
  const evRes = await fetch("/admin/createEvent", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, startAt, endAt })});
  const evJson = await evRes.json();
  if(!evJson.success) return alert(evJson.error || "gagal");
  const eventId = evJson.event.id;
  const rows = document.querySelectorAll("[id^='songrow_']");
  for(const r of rows){
    const rid = r.id.split("_")[1];
    const title = document.getElementById("title_"+rid).value;
    const artistName = document.getElementById("artist_"+rid).value;
    const coverUrl = document.getElementById("coverurl_"+rid).value;
    if(!title) continue;
    await fetch("/admin/addSong", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ title, artistName, coverUrl, eventId })});
  }
  alert("Event created!");
  document.getElementById("songs_container").innerHTML = "";
  addSongRow();
  loadEventsAdmin();
}

async function loadRequests(){
  const list = await fetch("/admin/requests").then(r=>r.json());
  const el = document.getElementById("requests");
  if(!list.length) el.innerHTML = "<p>Tidak ada request</p>";
  else el.innerHTML = list.map(a=>`<div style="padding:8px;border-bottom:1px solid #eee"><b>${a.name}</b><div class="small">${a.contact||''}</div><div style="margin-top:8px"><button class="btn" onclick="approve(${a.id},true)">Approve</button><button class="btn" style="background:#999" onclick="approve(${a.id},false)">Reject</button></div></div>`).join("");
}
async function approve(id, allow){ await fetch("/admin/approveArtist", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ artistId:id, approve: allow })}); loadRequests(); loadArtists(); }

async function loadArtists(){
  const list = await fetch("/admin/artists").then(r=>r.json());
  const el = document.getElementById("artist_list");
  if(!list.length) el.innerHTML = "<p>Tidak ada approved artists</p>";
  else el.innerHTML = list.map(a=>`<div style="padding:8px;border-bottom:1px solid #eee"><b>${a.name}</b> <button class="btn" style="background:#ff6b6b" onclick="deleteArtist(${a.id})">Delete</button></div>`).join("");
}
async function deleteArtist(id){ if(!confirm("Hapus artist? (artis harus daftar ulang)")) return; await fetch("/admin/deleteArtist", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ artistId:id })}); loadArtists(); loadEventsAdmin(); loadNewsAdmin(); }

async function loadEventsAdmin(){
  const list = await fetch("/events").then(r=>r.json());
  const el = document.getElementById("events_admin");
  if(!list.length) el.innerHTML = "<p>Tidak ada event</p>";
  else el.innerHTML = list.map(ev=>`
    <div style="padding:8px;border-bottom:1px solid #eee">
      <b>${ev.name}</b> <div class="small">${ev.status} • ${new Date(ev.startAt).toLocaleString()} → ${new Date(ev.endAt).toLocaleString()}</div>
      <div style="margin-top:8px">
        ${ev.status === 'upcoming' ? `<button class="btn" onclick="cancelEvent(${ev.id})">CANCEL</button>` : `<button class="btn" onclick="deleteEvent(${ev.id})">DELETE</button>`}
        <button class="btn" onclick="openEvent(${ev.id})">Open</button>
      </div>
    </div>
  `).join("");
}
function openEvent(id){ location.href = "/event.html?id="+id; }
async function cancelEvent(id){ if(!confirm("Cancel this upcoming event?")) return; await fetch("/admin/cancelEvent", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ eventId: id })}); loadEventsAdmin(); }
async function deleteEvent(id){ if(!confirm("Delete this event?")) return; await fetch("/admin/deleteEvent", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ eventId: id })}); loadEventsAdmin(); }

// News admin (pin/unpin/delete)
async function loadNewsAdmin(){
  const list = await fetch("/news").then(r=>r.json());
  const el = document.getElementById("news_admin");
  if(!list.length) { el.innerHTML = "<p>Belum ada news</p>"; return; }
  el.innerHTML = list.map(n=>{
    const pinLabel = n.pinned ? "Unpin" : "Pin";
    const adminBadge = n.admin ? " (admin)" : "";
    return `<div class="admin-row">
      <div style="flex:1">
        <b>${n.title}</b>${adminBadge} <div class="small-muted">${new Date(n.createdAt).toLocaleString()}</div>
        <div style="margin-top:6px">${n.body.substring(0,220)}${n.body.length>220? "..." : ""}</div>
      </div>
      <div class="news-actions">
        <button class="btn" onclick="togglePin(${n.id})">${pinLabel}</button>
        <button class="btn" style="background:#ff6b6b" onclick="deleteNews(${n.id})">Delete</button>
      </div>
    </div>`;
  }).join("");
}

async function togglePin(newsId){
  const res = await fetch("/admin/pinNews", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ newsId })});
  const j = await res.json();
  if(j.success) { loadNewsAdmin(); alert("Toggled pin: " + (j.pinned ? "pinned" : "unpinned")); }
  else alert(j.error || "gagal pin");
}

async function deleteNews(newsId){
  if(!confirm("Hapus berita ini?")) return;
  const res = await fetch("/admin/deleteNews", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ newsId })});
  const j = await res.json();
  if(j.success) { alert("News deleted"); loadNewsAdmin(); } else alert(j.error || "gagal hapus");
}

async function createAdminNews(){
  const title = document.getElementById("anews_title").value.trim();
  const body = document.getElementById("anews_body").value.trim();
  const image = document.getElementById("anews_image").value.trim();
  const pinned = document.getElementById("anews_pin").checked;
  if(!title || !body) return alert("Judul & isi wajib");
  await fetch("/admin/createNews", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ title, body, image, pinned })});
  alert("Admin news created");
  document.getElementById("anews_title").value = "";
  document.getElementById("anews_body").value = "";
  document.getElementById("anews_image").value = "";
  document.getElementById("anews_pin").checked = false;
  loadNewsAdmin();
}

// SSE active
function setupSSE(){
  const evt = new EventSource("/sse/active");
  evt.onmessage = e => {
    const data = JSON.parse(e.data);
    document.getElementById("activeCount").innerText = data.active;
  };
}

initAdmin();
