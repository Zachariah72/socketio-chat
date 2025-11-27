// server/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Config
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'verysecretkey';

// Ensure uploads dir exists
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });

// Simple username-based login (returns JWT)
app.post('/auth/login', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const id = username.toLowerCase().replace(/\s+/g,'-') + '-' + Math.floor(Math.random()*9000+1000);
  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, id, username });
});

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

// Search messages
app.get('/search', (req, res) => {
  const q = req.query.q?.toLowerCase();
  if (!q) return res.json({ results: [] });
  const results = [];
  for (const [roomId, msgs] of messages.entries()) {
    msgs.forEach(msg => {
      if (msg.text.toLowerCase().includes(q)) {
        results.push({ roomId, message: msg });
      }
    });
  }
  res.json({ results });
});

// HTTP + Socket.io server
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// In-memory storage (replace with DB for production)
const users = new Map(); // userId -> { username, socketId, online, rooms: Set }
const messages = new Map(); // roomId -> [message]

// Helpers
const makeId = () => Math.random().toString(36).slice(2,9);
const dmRoomId = (a,b) => [a,b].sort().join('#');

function verifyToken(token) {
  try {
    return jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
  } catch {
    return null;
  }
}

function getPresence() {
  return [...users.entries()].map(([id, u]) => ({ id, username: u.username, online: u.online }));
}

function getRoomMembers(roomId) {
  const set = io.sockets.adapter.rooms.get(roomId) || new Set();
  const members = [];
  for (const sid of set) {
    const sock = io.sockets.sockets.get(sid);
    if (sock && sock.user) members.push({ id: sock.user.id, username: sock.user.username });
  }
  return members;
}

// Socket.io auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization || '';
  const payload = verifyToken(token);
  if (!payload) return next(new Error('unauthorized'));
  socket.user = { id: payload.id, username: payload.username };
  next();
});

// Socket.io connection
io.on('connection', (socket) => {
  const { id: userId, username } = socket.user;
  users.set(userId, { username, socketId: socket.id, online: true, rooms: new Set() });
  socket.join(userId); // personal notifications

  // Broadcast presence
  io.emit('presence:update', getPresence());

  // Join default "general" room
  const defaultRoom = 'general';
  socket.join(defaultRoom);
  users.get(userId).rooms.add(defaultRoom);
  io.to(defaultRoom).emit('room:members', { roomId: defaultRoom, members: getRoomMembers(defaultRoom) });

  // Send message: { roomId, text, to, type }
  socket.on('message:send', (payload, ack) => {
    const ts = Date.now();
    const { roomId: r, text, to, type = 'text' } = payload;
    const roomId = r || (to ? dmRoomId(userId, to) : defaultRoom);
    const msg = { id: makeId(), from: userId, fromName: username, to: to || null, roomId, text: text || '', ts, readBy: [], reactions: {}, type };
    if (!messages.has(roomId)) messages.set(roomId, []);
    messages.get(roomId).push(msg);
    io.to(roomId).emit('message:new', msg);

    // Notify offline DM
    if (to && (!users.get(to) || !users.get(to).online)) io.to(to).emit('notification', { type: 'message', from: userId, text: msg.text, ts });

    if (ack) ack({ ok: true, messageId: msg.id });
  });

  // Typing
  socket.on('typing', ({ roomId, typing }) => socket.to(roomId).emit('typing', { userId, username, typing }));

  // Read receipt
  socket.on('message:read', ({ roomId, messageId }) => {
    const arr = messages.get(roomId) || [];
    const m = arr.find(x => x.id === messageId);
    if (m && !m.readBy.includes(userId)) {
      m.readBy.push(userId);
      io.to(roomId).emit('message:read', { messageId, by: userId });
    }
  });

  // Reactions
  socket.on('message:react', ({ roomId, messageId, emoji }) => {
    const arr = messages.get(roomId) || [];
    const m = arr.find(x => x.id === messageId);
    if (m) {
      m.reactions[emoji] = m.reactions[emoji] || [];
      if (!m.reactions[emoji].includes(userId)) m.reactions[emoji].push(userId);
      io.to(roomId).emit('message:react', { messageId, emoji, by: userId, reactions: m.reactions[emoji] });
    }
  });

  // Get message history
  socket.on('history:get', ({ roomId, beforeTs, limit = 50 }, ack) => {
    const arr = messages.get(roomId) || [];
    const filtered = arr.filter(m => m.ts < beforeTs).sort((a,b) => b.ts - a.ts).slice(0, limit);
    ack({ messages: filtered.reverse() });
  });

  // Join/Leave room
  socket.on('room:join', ({ roomId }) => {
    socket.join(roomId);
    users.get(userId).rooms.add(roomId);
    io.to(roomId).emit('room:members', { roomId, members: getRoomMembers(roomId) });
    io.emit('notification', { type: 'join', userId, username, roomId, ts: Date.now() });
  });

  socket.on('room:leave', ({ roomId }) => {
    socket.leave(roomId);
    users.get(userId).rooms.delete(roomId);
    io.to(roomId).emit('room:members', { roomId, members: getRoomMembers(roomId) });
    io.emit('notification', { type: 'leave', userId, username, roomId, ts: Date.now() });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const u = users.get(userId);
    if (u) { u.online = false; u.socketId = null; }
    io.emit('presence:update', getPresence());
  });
});

// Start server
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
