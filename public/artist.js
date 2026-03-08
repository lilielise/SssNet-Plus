// KUNCI: public/artist.js
document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("tabReel").onclick = ()=>{ showTab('reel'); };
  document.getElementById("tabNews").onclick = ()=>{ showTab('news'); };
  loadMyReels(); loadMyNews();
});

function showTab(t){
  document.getElementById("tabReelPane").style.display = t==='reel' ? 'block' : 'none';
  document.getElementById("tabNewsPane").style.display = t==='news' ? 'block' : 'none';
  document.getElementById("tabReel").classList.toggle('active', t==='reel');
  document.getElementById("tabNews").classList.toggle('active', t==='news');
}

async function artistUpload(){
  const f = document.getElementById("artistVideoFile").files[0];
  if(!f) return alert("Pilih video");
  const form = new FormData();
  form.append("video", f);
  form.append("trimStart", document.getElementById("artistTrimStart").value);
  form.append("trimEnd", document.getElementById("artistTrimEnd").value);
  form.append("effect", document.getElementById("artistEffect").value);
  form.append("overlayText", document.getElementById("artistOverlay").value);
  form.append("audioUrl", document.getElementById("artistAudioUrl").value);
  form.append("description", document.getElementById("artistDesc").value);
  form.append("hashtags", document.getElementById("artistTags").value);
  form.append("visibility", document.getElementById("artistVisibility").value);
  // include artistId if user stored locally
  const art = JSON.parse(localStorage.getItem("sssnet_artist")||"null");
  if(art) form.append("artistId", art.id);

  const token = localStorage.getItem("sssnet_token");
  const res = await fetch("/upload/video-edit", { method:"POST", headers: { "Authorization": "Bearer "+token }, body: form });
  const j = await res.json();
  if(j.success){ alert("Uploaded"); loadMyReels(); } else alert("Error upload");
}

async function loadMyReels(){
  const art = JSON.parse(localStorage.getItem("sssnet_artist")||"null");
  const listWrap = document.getElementById("myReelsList");
  if(!art){ listWrap.innerHTML="Belum terdaftar sebagai artist atau belum disetujui."; return; }
  const res = await fetch("/videos");
  const list = await res.json();
  const mine = list.filter(v=>v.artistId === art.id);
  if(!mine.length) { listWrap.innerHTML="<div>Tidak ada reels</div>"; return; }
  listWrap.innerHTML = mine.map(m => `
    <div class="card">
      <video src="${m.file}" width="240" controls></video>
      <div>${escapeHtml(m.description)}</div>
      <div>${fmtDate(m.createdAt)}</div>
      <button onclick="deleteMyReel(${m.id})">Hapus</button>
    </div>
  `).join("");
}

async function deleteMyReel(id){
  if(!confirm("Hapus postingan ini?")) return;
  // simple: remove from DB via admin API endpoint not implemented: we'll call a new endpoint
  const token = localStorage.getItem("sssnet_token");
  const res = await fetch("/admin/deleteVideo", { method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+token}, body: JSON.stringify({ videoId: id })});
  const j = await res.json();
  if(j.success) { alert("Dihapus"); loadMyReels(); } else alert("Gagal");
}

// NEWS
async function postNews(){
  const f = document.getElementById("newsImage").files[0];
  const form = new FormData();
  form.append("title", document.getElementById("newsTitle").value);
  form.append("description", document.getElementById("newsDesc").value);
  form.append("hashtags", document.getElementById("newsHashtags").value);
  if(f) form.append("image", f);
  const token = localStorage.getItem("sssnet_token");
  const res = await fetch("/news/upload", { method:"POST", headers:{"Authorization":"Bearer "+token}, body: form });
  const j = await res.json();
  if(j.success){ alert("News posted"); loadMyNews(); } else alert("Error");
}

async function loadMyNews(){
  const art = JSON.parse(localStorage.getItem("sssnet_artist")||"null");
  const wrap = document.getElementById("myNewsList");
  if(!art) { wrap.innerHTML="Belum;";
    return; }
  const res = await fetch("/news"); const list = await res.json();
  const mine = list.filter(n=>n.author===art.name);
  if(!mine.length) { wrap.innerHTML="<div>Tidak ada news</div>"; return; }
  wrap.innerHTML = mine.map(n=>`<div class="card"><h4>${escapeHtml(n.title)}</h4><img src="${n.image||''}" style="max-width:180px"/><div>${escapeHtml(n.description)}</div><div>${fmtDate(n.createdAt||n.id)}</div><button onclick="deleteNews(${n.id})">Hapus</button></div>`).join("");
}
async function deleteNews(id){ if(!confirm("Hapus news?")) return; const token=localStorage.getItem("sssnet_token"); const res=await fetch("/admin/deleteNews",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({ newsId:id })}); const j=await res.json(); if(j.success) loadMyNews(); else alert("Gagal"); }
