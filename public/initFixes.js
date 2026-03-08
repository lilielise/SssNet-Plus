// initFixes.js — runtime fixes untuk tombol/overlay/events/artist access
(function(){
  // safety: run after DOM loaded
  document.addEventListener('DOMContentLoaded', ()=>{

    // 1) pastikan fullOverlay default hidden (jika ada)
    const fo = document.getElementById('fullOverlay') || document.querySelector('.full-overlay');
    if(fo){
      // if it's visible by mistake, hide, and ensure pointer-events controlled
      fo.style.display = 'none';
      fo.style.pointerEvents = 'none';
      // add helper functions
      window._sssnetShowFull = function(){ fo.style.display = 'flex'; fo.style.pointerEvents = 'auto'; };
      window._sssnetHideFull = function(){ fo.style.display = 'none'; fo.style.pointerEvents = 'none'; pauseAllFull && pauseAllFull(); };
    }

    // 2) enable all buttons (in case some were disabled)
    document.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach(b=>{
      b.disabled = false;
    });

    // 3) Re-attach important global handlers via delegation so dynamic elements work
    document.body.addEventListener('click', async (ev)=>{
      const t = ev.target;

      // LOGIN handler: works even if button created late, look for id or class
      if(t.closest && t.closest('#btnLogin') || t.id === 'btnLogin' || t.matches('.login-btn')){
        ev.preventDefault();
        try{ await handleLogin(); } catch(e){ console.error(e); alert("Login gagal - cek console"); }
      }

      // REGISTER handler
      if(t.closest && t.closest('#btnRegister') || t.id === 'btnRegister' || t.matches('.register-btn')){
        ev.preventDefault();
        try{ await handleRegister(); } catch(e){ console.error(e); alert("Register gagal - cek console"); }
      }

      // Generic vote buttons (class .vote-btn or data-song)
      const voteBtn = t.closest && t.closest('.vote-btn') ? t.closest('.vote-btn') : (t.dataset && t.dataset.songId ? t : null);
      if(voteBtn && voteBtn.dataset && voteBtn.dataset.songId){
        ev.stopPropagation();
        const songId = voteBtn.dataset.songId;
        try{
          await fetch('/vote', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({songId: Number(songId)})})
            .then(r=>r.json()).then(j=>{
              if(j.success) alert('Vote diterima ✔'); else alert(j.error || 'Vote gagal');
            });
          // refresh UI if function exists
          if(typeof loadEvents === 'function') loadEvents(currentEventTab||'ongoing');
          if(typeof loadSongs === 'function') loadSongs && loadSongs();
        }catch(e){ console.error(e); alert('Vote gagal (network)');}
      }

      // Ensure upload buttons that use input[type=file] will trigger properly
      if(t.matches && t.matches('.trigger-upload')){
        const target = document.querySelector(t.dataset.target);
        if(target) target.click();
      }

      // admin quick approve from admin UI if button has data-approve
      if(t.dataset && t.dataset.approveArtist){
        const artistId = Number(t.dataset.approveArtist);
        const approve = t.dataset.approveValue === 'true';
        fetch('/admin/approveArtist', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({artistId, approve})})
          .then(r=>r.json()).then(j=>{ if(j.success){ alert('Updated'); location.reload(); } else alert('Gagal'); });
      }
    });

    // 4) ensure login/register handlers exist (robust)
    async function handleLogin(){
      // look for possible inputs
      const username = (document.getElementById('u') && document.getElementById('u').value) ||
                       (document.querySelector('input[name="username"]') && document.querySelector('input[name="username"]').value) || '';
      const password = (document.getElementById('p') && document.getElementById('p').value) ||
                       (document.querySelector('input[name="password"]') && document.querySelector('input[name="password"]').value) || '';
      if(!username || !password){ alert('Isi username & password'); return; }
      try{
        const res = await fetch('/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, password})});
        const j = await res.json();
        if(j.token){ localStorage.setItem('sssnet_token', j.token); localStorage.setItem('sssnet_user', JSON.stringify(j.user)); alert('Login sukses'); location.href = '/'; }
        else alert(j.error || 'Login gagal');
      }catch(e){ console.error(e); alert('Login error'); }
    }

    async function handleRegister(){
      const username = (document.getElementById('ru') && document.getElementById('ru').value) ||
                       (document.querySelector('input[name="reg_username"]') && document.querySelector('input[name="reg_username"]').value) || '';
      const password = (document.getElementById('rp') && document.getElementById('rp').value) ||
                       (document.querySelector('input[name="reg_password"]') && document.querySelector('input[name="reg_password"]').value) || '';
      // role selection (artist/fan) try several ways
      let role = 'fan';
      const roleEl = document.getElementById('role') || document.querySelector('select[name="role"]');
      if(roleEl) role = roleEl.value || role;
      // fallback buttons
      try{
        const res = await fetch('/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, password, role})});
        const j = await res.json();
        if(j.success) { alert('Terdaftar, silakan login'); location.href = '/login.html'; }
        else alert(j.error || 'Daftar gagal');
      }catch(e){ console.error(e); alert('Register error');}
    }

    // 5) Events tabs loader (restore upcoming/ongoing/ended tabs)
    window.currentEventTab = window.currentEventTab || 'ongoing';
    window.loadEvents = async function(status){
      window.currentEventTab = status;
      const wrap = document.getElementById('events-list') || document.getElementById('eventsList') || document.getElementById('events-list-container');
      if(!wrap) return;
      wrap.innerHTML = 'Memuat...';
      try{
        const url = status ? `/events?status=${encodeURIComponent(status)}` : '/events';
        const res = await fetch(url); const list = await res.json();
        if(!Array.isArray(list) || list.length===0){ wrap.innerHTML = '<div>Tidak ada event</div>'; return; }
        wrap.innerHTML = list.map(ev => {
          const s = `<div class="card" style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:700">${ev.name}</div>
                <div class="small">${ev.status} • ${ev.startAt} → ${ev.endAt}</div>
              </div>
              <div style="display:flex;gap:8px">
                ${ev.status==='upcoming' ? `<button class="btn" onclick="cancelEvent(${ev.id})">Cancel</button>` : `<button class="btn" onclick="deleteEvent(${ev.id})">Delete</button>`}
              </div>
            </div>
            <div style="margin-top:8px" id="event-songs-${ev.id}">Loading songs...</div>
          </div>`;
          return s;
        }).join('');
        // load songs per event
        list.forEach(async ev=>{
          const songsWrap = document.getElementById(`event-songs-${ev.id}`);
          if(!songsWrap) return;
          const songs = ev.songs || [];
          if(!songs.length) { songsWrap.innerHTML = '<div class="small">No songs</div>'; return; }
          const dbRes = await fetch('/songs?eventId=' + ev.id);
          const songList = await dbRes.json();
          songsWrap.innerHTML = songList.map(s=>`<div class="song"><img class="cover-img" src="${s.cover||'/uploads/covers/placeholder.jpg'}"><div class="song-info"><div style="font-weight:700">${s.title}</div><div class="small">${s.artistName||s.artist}</div><div class="bar"><div class="fill" style="width:${(s.votes||0)}%"></div></div></div><div style="margin-left:8px"><button class="vote-btn btn" data-song-id="${s.id}" data-song="${s.title}">Vote</button></div></div>`).join('');
        });
      }catch(e){ console.error(e); wrap.innerHTML = '<div>Gagal memuat events</div>'; }
    };

    // admin helpers
    window.cancelEvent = async function(id){ if(!confirm('Batal event?')) return; await fetch('/admin/deleteEvent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:id})}); loadEvents(window.currentEventTab); };
    window.deleteEvent = async function(id){ if(!confirm('Hapus event?')) return; await fetch('/admin/deleteEvent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:id})}); loadEvents(window.currentEventTab); };

    // 6) ensure artist link visibility is guarded properly
    function updateArtistLinkVisibility(){
      try{
        const artist = JSON.parse(localStorage.getItem('sssnet_artist')||'null');
        const links = document.querySelectorAll('#artist-link,#artist-link-header');
        links.forEach(a=>{
          if(!a) return;
          if(artist && artist.status === 'approved'){ a.style.display='inline'; }
          else { a.style.display='none'; }
        });
      }catch(e){}
    }
    updateArtistLinkVisibility();
    setInterval(updateArtistLinkVisibility, 5000);

    // 7) ensure login buttons not blocked by overlay or other element
    // remove any full-overlay that overlaps header clickable area
    setTimeout(()=>{ const hdr = document.querySelector('.site-header'); if(hdr){ hdr.style.zIndex = 1001; } }, 50);

    // 8) if events-list element present but empty, load default tab
    setTimeout(()=>{ if(document.getElementById('events-list') || document.getElementById('eventsList')) loadEvents(window.currentEventTab); }, 200);

    // 9) small helper pauseAllFull used earlier by full overlay code (if defined separately)
    window.pauseAllFull = window.pauseAllFull || function(){ const vids = document.querySelectorAll('.full-card video'); vids.forEach(v=>{ try{ v.pause(); v.currentTime = 0; }catch(e){} }); };

    // done
    console.log('SSSNET initFixes loaded — runtime patches applied');
  });
})();
