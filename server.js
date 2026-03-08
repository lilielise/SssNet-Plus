// server.js - SSSNET_APPLY_V2
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { exec } = require("child_process");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// DB helper
const DB_FILE = path.join(__dirname, "database.json");
function ensureDB(){
  if(!fs.existsSync(DB_FILE)){
    const init = {
      artists: [], events: [], songs: [], votes: [], news: [], videos: [],
      comments: [], likes: [], admin: { username: "admin", password: "changeme" }, metrics: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
  }
}
function readDB(){ ensureDB(); return JSON.parse(fs.readFileSync(DB_FILE)); }
function saveDB(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function nowISO(){ return new Date().toISOString(); }
function todayDate(){ return new Date().toISOString().slice(0,10); }

function updateEventStatuses(db){
  const now = new Date();
  db.events.forEach(ev=>{
    const s = new Date(ev.startAt), e = new Date(ev.endAt);
    if(now < s) ev.status = "upcoming";
    else if(now >= s && now < e) ev.status = "ongoing";
    else ev.status = "ended";
  });
}

// multer storage
const coverStorage = multer.diskStorage({
  destination: (req,file,cb) => {
    const dir = "./public/uploads/covers"; if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
    cb(null, dir);
  },
  filename: (req,file,cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const videoStorage = multer.diskStorage({
  destination: (req,file,cb) => {
    const dir = "./public/uploads/videos"; if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
    cb(null, dir);
  },
  filename: (req,file,cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadCover = multer({ storage: coverStorage });
const uploadVideo = multer({ storage: videoStorage });

// adminAuth placeholder (local dev)
function adminAuth(req,res,next){ next(); }

// SSE active users (basic)
let clients = [];
app.get("/sse/active", (req,res)=>{
  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.flushHeaders();
  clients.push(res);
  sendActive();
  req.on("close", ()=>{ clients = clients.filter(c=>c!==res); sendActive(); });
});
function sendActive(){
  const count = clients.length;
  clients.forEach(c => {
    try { c.write(`data: ${JSON.stringify({ active: count })}\n\n`); } catch(e){}
  });
}

// ---------- Public APIs ----------
app.get("/events", (req,res)=>{
  const db = readDB(); updateEventStatuses(db); saveDB(db);
  const status = req.query.status;
  if(status) return res.json(db.events.filter(e=>e.status===status));
  res.json(db.events);
});

app.get("/events/:id", (req,res)=>{
  const db = readDB(); updateEventStatuses(db);
  const id = Number(req.params.id);
  const ev = db.events.find(e=>e.id===id);
  if(!ev) return res.status(404).json({ error:"event not found" });
  const songs = (ev.songs||[]).map(sid => db.songs.find(s=>s.id===sid)).filter(Boolean);
  res.json({ ...ev, songs });
});

app.get("/songs", (req,res)=>{
  const db = readDB();
  const eventId = req.query.eventId ? Number(req.query.eventId) : null;
  const songs = eventId ? db.songs.filter(s=>s.eventId===eventId) : db.songs;
  res.json(songs);
});

app.get("/videos", (req,res)=>{
  const db = readDB();
  res.json(db.videos.sort((a,b)=>b.id - a.id));
});

app.get("/news", (req,res)=>{
  const db = readDB();
  const pinned = db.news.filter(n=>n.pinned).sort((a,b)=>b.id-a.id);
  const rest = db.news.filter(n=>!n.pinned).sort((a,b)=>b.id-a.id);
  res.json([...pinned, ...rest]);
});

app.get("/artists", (req,res)=>{
  const db = readDB();
  res.json(db.artists);
});

app.get("/artists/:id", (req,res)=>{
  const db = readDB();
  const id = Number(req.params.id);
  const a = db.artists.find(x=>x.id===id);
  if(!a) return res.status(404).json({ error:"artist not found" });
  const news = db.news.filter(n=>n.artistId===id);
  const videos = db.videos.filter(v=>v.artistId===id);
  res.json({ artist:a, news, videos });
});

// VOTE - limit 5 votes/day per IP; can spend on any songs (same song multiple times)
app.post("/vote", (req,res)=>{
  const db = readDB();
  const ip = req.ip || req.headers["x-forwarded-for"] || "anon";
  const { songId } = req.body;
  if(!songId) return res.status(400).json({ error:"songId required" });
  const today = todayDate();
  const userVotesToday = db.votes.filter(v=>v.user===ip && v.date===today);
  if(userVotesToday.length >= 5) return res.json({ error:"Vote limit reached (5 per day)" });
  const song = db.songs.find(s=>s.id==songId); if(!song) return res.json({ error:"Song not found" });
  const ev = db.events.find(e=>e.id==song.eventId); updateEventStatuses(db);
  if(!ev || ev.status !== "ongoing") return res.json({ error:"Event not ongoing" });
  song.votes = (song.votes||0) + 1;
  db.votes.push({ user: ip, songId: song.id, date: today, at: nowISO() });
  saveDB(db);
  res.json({ success:true });
});

// Upload cover
app.post("/upload/cover", uploadCover.single("cover"), (req,res)=>{
  if(!req.file) return res.status(400).json({ error:"no file" });
  return res.json({ success:true, url: `/uploads/covers/${req.file.filename}` });
});

// Upload video
app.post("/upload/video", uploadVideo.single("video"), (req,res)=>{
  if(!req.file) return res.status(400).json({ error:"no file" });
  const fileUrl = `/uploads/videos/${req.file.filename}`;
  const filepath = path.join(__dirname, "public/uploads/videos", req.file.filename);
  const thumbName = req.file.filename + ".jpg";
  const thumbPath = path.join(__dirname, "public/uploads/videos", thumbName);
  // try to generate thumbnail (if ffmpeg available)
  exec(`ffmpeg -y -i "${filepath}" -ss 00:00:01.000 -vframes 1 "${thumbPath}"`, (err)=>{
    const thumbUrl = fs.existsSync(thumbPath) ? `/uploads/videos/${thumbName}` : null;
    const db = readDB();
    const vid = { id: Date.now(), artistId: req.body.artistId ? Number(req.body.artistId) : null, file: fileUrl, thumb: thumbUrl, createdAt: nowISO() };
    db.videos.push(vid); saveDB(db);
    res.json({ success:true, file: fileUrl, thumb: thumbUrl, videoId: vid.id });
  });
});

// Likes
app.post("/like", (req,res)=>{
  const db = readDB();
  const { type, targetId } = req.body;
  const user = req.ip || "anon";
  if(!type || !targetId) return res.status(400).json({ error:"missing" });
  const exists = db.likes.find(l=>l.type===type && l.targetId==targetId && l.user===user);
  if(exists){
    db.likes = db.likes.filter(l=>!(l.type===type && l.targetId==targetId && l.user===user));
    saveDB(db);
    return res.json({ success:true, action:"unliked" });
  }
  db.likes.push({ type, targetId: Number(targetId), user, at: nowISO() });
  saveDB(db);
  res.json({ success:true, action:"liked" });
});
app.get("/likes", (req,res)=>{
  const db = readDB();
  const { type, targetId } = req.query;
  if(!type || !targetId) return res.json([]);
  const list = db.likes.filter(l=>l.type===type && l.targetId==Number(targetId));
  res.json(list);
});

// Comments
app.get("/comments", (req,res)=>{
  const db = readDB();
  const { type, targetId } = req.query;
  if(!type || !targetId) return res.json([]);
  const list = db.comments.filter(c=>c.type===type && c.targetId==Number(targetId));
  res.json(list.sort((a,b)=>b.id - a.id));
});
app.post("/comments", (req,res)=>{
  const db = readDB();
  const { type, targetId, userName, text, parentId } = req.body;
  if(!type || !targetId || !text) return res.status(400).json({ error:"missing" });
  const user = { id:null, name: userName || "Guest", avatar: null };
  if(parentId){
    const parent = db.comments.find(c=>c.id==parentId);
    if(!parent) return res.status(404).json({ error:"parent not found" });
    const reply = { id: Date.now(), user, text, createdAt: nowISO() };
    parent.replies = parent.replies || []; parent.replies.push(reply);
    saveDB(db); return res.json({ success:true, reply });
  }
  const comment = { id: Date.now(), type, targetId: Number(targetId), user, text, createdAt: nowISO(), replies: [] };
  db.comments.push(comment); saveDB(db); res.json({ success:true, comment });
});

// Artist register & news
app.post("/artist/register", (req,res)=>{
  const db = readDB();
  const { name, contact } = req.body;
  if(!name) return res.status(400).json({ error:"name required" });
  const exists = db.artists.find(a=>a.name.toLowerCase() === name.toLowerCase());
  if(exists) return res.json({ error:"artist already requested or exists" });
  const a = { id: Date.now(), name, contact: contact||"", status: "pending", avatar:null, banner:null, bio:"", links:[], createdAt: nowISO() };
  db.artists.push(a); saveDB(db);
  res.json({ success:true, message:"Your account is being checked, please wait a moment." });
});

app.post("/artist/:id/news", (req,res)=>{
  const db = readDB();
  const artistId = Number(req.params.id);
  const artist = db.artists.find(a=>a.id===artistId);
  if(!artist || artist.status!=="approved") return res.status(403).json({ error:"artist not approved" });
  const { title, body, image } = req.body;
  const news = { id: Date.now(), title, artistId, image: image||null, body: body||"", createdAt: nowISO(), pinned:false, admin:false };
  db.news.push(news); saveDB(db); res.json({ success:true, news });
});

app.post("/artist/:id/deleteNews", (req,res)=>{
  const db = readDB();
  const artistId = Number(req.params.id);
  const { newsId } = req.body;
  const nidx = db.news.findIndex(n=>n.id==newsId && n.artistId==artistId);
  if(nidx === -1) return res.status(404).json({ error:"news not found or not yours" });
  db.news.splice(nidx,1); saveDB(db); res.json({ success:true });
});

app.post("/artist/:id/deleteVideo", (req,res)=>{
  const db = readDB();
  const artistId = Number(req.params.id);
  const { videoId } = req.body;
  const idx = db.videos.findIndex(v=>v.id==videoId && v.artistId==artistId);
  if(idx === -1) return res.status(404).json({ error:"video not found or not yours" });
  // remove file if exists
  const filepath = path.join(__dirname, "public", db.videos[idx].file);
  try{ if(fs.existsSync(filepath)) fs.unlinkSync(filepath); }catch(e){}
  db.videos.splice(idx,1); saveDB(db); res.json({ success:true });
});

// ADMIN endpoints (create event, songs, pin/unpin, delete)
app.get("/admin/requests", adminAuth, (req,res)=>{
  const db = readDB(); res.json(db.artists.filter(a=>a.status==="pending"));
});
app.post("/admin/approveArtist", adminAuth, (req,res)=>{
  const db = readDB(); const { artistId, approve } = req.body;
  const a = db.artists.find(x=>x.id==artistId); if(!a) return res.status(404).json({ error:"not found" });
  a.status = approve ? "approved" : "rejected"; saveDB(db); res.json({ success:true, artist: a });
});
app.get("/admin/artists", adminAuth, (req,res)=>{
  const db = readDB(); res.json(db.artists.filter(a=>a.status==="approved"));
});
app.post("/admin/deleteArtist", adminAuth, (req,res)=>{
  const db = readDB(); const { artistId } = req.body;
  db.artists = db.artists.filter(a=>a.id != artistId);
  db.videos = db.videos.filter(v=>v.artistId != artistId);
  db.news = db.news.filter(n=>n.artistId != artistId);
  db.songs = db.songs.filter(s=>s.artistId != artistId);
  saveDB(db); res.json({ success:true });
});

app.post("/admin/createEvent", adminAuth, (req,res)=>{
  const db = readDB(); const { name, startAt, endAt } = req.body;
  if(!name || !startAt || !endAt) return res.status(400).json({ error:"name,startAt,endAt required" });
  const ev = { id: Date.now(), name, startAt, endAt, status: "upcoming", songs: [], createdAt: nowISO() };
  db.events.push(ev); saveDB(db); res.json({ success:true, event: ev });
});
app.post("/admin/addSong", adminAuth, (req,res)=>{
  const db = readDB();
  const { title, artistName, artistId, coverUrl, eventId } = req.body;
  if(!title || !eventId) return res.status(400).json({ error:"title and eventId required" });
  const song = { id: Date.now(), title, artistId: artistId?Number(artistId):null, artistName: artistName||"", cover: coverUrl||"", votes:0, eventId: Number(eventId) };
  db.songs.push(song);
  const ev = db.events.find(e=>e.id==eventId); if(ev) ev.songs = ev.songs || [], ev.songs.push(song.id);
  saveDB(db); res.json({ success:true, song });
});
app.post("/admin/deleteSong", adminAuth, (req,res)=>{
  const db = readDB(); const { songId } = req.body;
  db.songs = db.songs.filter(s=>s.id != songId); db.events.forEach(ev=>{ if(ev.songs) ev.songs = ev.songs.filter(id=>id != songId); });
  db.votes = db.votes.filter(v=>v.songId != songId); saveDB(db); res.json({ success:true });
});
app.post("/admin/resetVotes", adminAuth, (req,res)=>{
  const db = readDB(); const { eventId } = req.body;
  if(eventId){ db.songs.filter(s=>s.eventId==eventId).forEach(s=>s.votes=0); db.votes = db.votes.filter(v=>{ const s = db.songs.find(s2=>s2.id==v.songId); return s && s.eventId != eventId; }); }
  else { db.songs.forEach(s=>s.votes=0); db.votes = []; }
  saveDB(db); res.json({ success:true });
});
app.post("/admin/addVote", adminAuth, (req,res)=>{ const db = readDB(); const { songId, amount } = req.body; const song = db.songs.find(s=>s.id==songId); if(!song) return res.status(404).json({ error:"song not found" }); song.votes = (song.votes||0) + Number(amount||0); saveDB(db); res.json({ success:true, song }); });

app.post("/admin/cancelEvent", adminAuth, (req,res)=>{
  const db = readDB(); const { eventId } = req.body;
  const ev = db.events.find(e=>e.id==eventId); if(!ev) return res.status(404).json({ error:"not found" });
  if(ev.status !== "upcoming") return res.status(400).json({ error:"only upcoming can be canceled" });
  const songIds = ev.songs || [];
  db.songs = db.songs.filter(s=> !songIds.includes(s.id));
  db.events = db.events.filter(e=>e.id != eventId);
  saveDB(db); res.json({ success:true });
});
app.post("/admin/deleteEvent", adminAuth, (req,res)=>{
  const db = readDB(); const { eventId } = req.body;
  db.songs = db.songs.filter(s=> s.eventId != eventId);
  db.events = db.events.filter(e=> e.id != eventId);
  db.votes = db.votes.filter(v=> { const song = db.songs.find(s2=>s2.id==v.songId); return song && song.eventId != eventId; });
  saveDB(db); res.json({ success:true });
});

// pin/unpin and create/delete news
app.post("/admin/pinNews", adminAuth, (req,res)=>{
  const db = readDB(); const { newsId } = req.body;
  const n = db.news.find(x=>x.id==newsId); if(!n) return res.status(404).json({ error:"news not found" });
  n.pinned = !n.pinned; saveDB(db); res.json({ success:true, pinned: !!n.pinned });
});
app.post("/admin/createNews", adminAuth, (req,res)=>{
  const db = readDB(); const { title, body, image, pinned } = req.body;
  const news = { id: Date.now(), title, body: body||"", image: image||null, artistId: null, createdAt: nowISO(), pinned: !!pinned, admin: true };
  db.news.push(news); saveDB(db); res.json({ success:true, news });
});
app.post("/admin/deleteNews", adminAuth, (req,res)=>{
  const db = readDB(); const { newsId } = req.body;
  const idx = db.news.findIndex(n=>n.id == newsId);
  if(idx === -1) return res.status(404).json({ error:"news not found" });
  db.news.splice(idx,1); saveDB(db); res.json({ success:true });
});
app.post("/admin/deleteVideo", adminAuth, (req,res)=>{
  const db = readDB(); const { videoId } = req.body;
  const idx = db.videos.findIndex(v=>v.id == videoId);
  if(idx === -1) return res.status(404).json({ error:"video not found" });
  const filepath = path.join(__dirname, "public", db.videos[idx].file);
  try{ if(fs.existsSync(filepath)) fs.unlinkSync(filepath); }catch(e){}
  db.videos.splice(idx,1); saveDB(db); res.json({ success:true });
});

console.log("SSSNET PLUS running on port 3000");
// --- artist profile update (avatar/banner/name/bio) ---
app.post("/artist/:id/updateProfile", (req,res) => {
  try{
    const db = readDB();
    const artistId = Number(req.params.id);
    const a = db.artists.find(x => x.id === artistId);
    if(!a) return res.status(404).json({ error: "artist not found" });

    // menerima avatar, banner, name, bio (body JSON)
    const { avatar, banner, name, bio } = req.body;
    if(avatar !== undefined) a.avatar = avatar;
    if(banner !== undefined) a.banner = banner;
    if(name !== undefined) a.name = name;
    if(bio !== undefined) a.bio = bio;

    saveDB(db);
    return res.json({ success:true, artist: a });
  }catch(err){
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});
app.listen(3000);

/* --- added for hosting (Railway, etc.) --- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
/* ----------------------------------------- */
