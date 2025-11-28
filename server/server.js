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
const connectDB = require('./config/database');
const User = require('./models/User');
const Contact = require('./models/Contact');
const Chat = require('./models/Chat');
const Message = require('./models/Message');
const UserSetting = require('./models/UserSetting');
const crypto = require('crypto-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to database
connectDB();

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

// Phone number registration
app.post('/auth/register', async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone || !name) return res.status(400).json({ error: 'Phone and name required' });

    const existingUser = await User.findOne({ phone });
    if (existingUser) return res.status(400).json({ error: 'Phone number already registered' });

    const user = new User({ phone, name });
    await user.save();

    const token = jwt.sign({ id: user._id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, phone: user.phone, name: user.name, avatar: user.avatar, status: user.status } });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Phone number login
app.post('/auth/login', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'Phone number not registered' });

    const token = jwt.sign({ id: user._id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, phone: user.phone, name: user.name, avatar: user.avatar, status: user.status } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

// Update user profile
app.put('/user/profile', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const { name, status, avatar } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (avatar !== undefined) updateData.avatar = avatar;

    const user = await User.findByIdAndUpdate(payload.id, updateData, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ user: { id: user._id, phone: user.phone, name: user.name, avatar: user.avatar, status: user.status } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
app.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name avatar status lastSeen');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add contact by phone
app.post('/contacts', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const contactUser = await User.findOne({ phone });
    if (!contactUser) return res.status(404).json({ error: 'User not found' });
    if (contactUser._id.toString() === payload.id) return res.status(400).json({ error: 'Cannot add yourself' });

    const existingContact = await Contact.findOne({ userId: payload.id, contactUserId: contactUser._id });
    if (existingContact) return res.status(400).json({ error: 'Contact already exists' });

    const contact = new Contact({ userId: payload.id, contactUserId: contactUser._id });
    await contact.save();

    res.json({ contact: { id: contact._id, contactUser: { id: contactUser._id, name: contactUser.name, phone: contactUser.phone, avatar: contactUser.avatar } } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get contacts
app.get('/contacts', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const contacts = await Contact.find({ userId: payload.id }).populate('contactUserId', 'name phone avatar status lastSeen');
    res.json({ contacts: contacts.map(c => ({ id: c._id, contactUser: c.contactUserId, customName: c.customName })) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update contact custom name
app.put('/contacts/:id', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const { customName } = req.body;
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, userId: payload.id },
      { customName },
      { new: true }
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ contact });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete contact
app.delete('/contacts/:id', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const contact = await Contact.findOneAndDelete({ _id: req.params.id, userId: payload.id });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create or get individual chat
app.post('/chats/individual', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const { contactId } = req.body;
    if (!contactId) return res.status(400).json({ error: 'Contact ID required' });

    // Check if chat already exists
    let chat = await Chat.findOne({
      type: 'individual',
      participants: { $all: [payload.id, contactId], $size: 2 }
    });

    if (!chat) {
      chat = new Chat({
        type: 'individual',
        participants: [payload.id, contactId],
        createdBy: payload.id
      });
      await chat.save();
    }

    res.json({ chat });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's chats
app.get('/chats', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const chats = await Chat.find({ participants: payload.id })
      .populate('participants', 'name avatar status')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.json({ chats });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user settings
app.get('/settings', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const settings = await UserSetting.find({ userId: payload.id });
    const settingsObj = {};
    settings.forEach(s => settingsObj[s.key] = s.value);
    res.json({ settings: settingsObj });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user setting
app.put('/settings', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const { key, value } = req.body;
    await UserSetting.findOneAndUpdate(
      { userId: payload.id, key },
      { value },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update chat settings
app.put('/chats/:chatId/settings', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const { wallpaper, theme } = req.body;
    const update = {};
    if (wallpaper !== undefined) update['settings.wallpaper'] = wallpaper;
    if (theme !== undefined) update['settings.theme'] = theme;

    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.chatId, participants: payload.id },
      update,
      { new: true }
    );
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json({ settings: chat.settings });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
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

async function getPresence() {
  const onlineUsers = [...users.entries()].map(([id, u]) => u.id);
  const usersData = await User.find({ _id: { $in: onlineUsers } }).select('name avatar status');
  return usersData.map(u => ({
    id: u._id.toString(),
    name: u.name,
    avatar: u.avatar,
    status: u.status,
    online: true
  }));
}

function getRoomMembers(roomId) {
  const set = io.sockets.adapter.rooms.get(roomId) || new Set();
  const members = [];
  for (const sid of set) {
    const sock = io.sockets.sockets.get(sid);
    if (sock && sock.user) members.push({ id: sock.user.id, name: sock.user.name });
  }
  return members;
}

// Socket.io auth middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization || '';
  const payload = verifyToken(token);
  if (!payload) return next(new Error('unauthorized'));
  try {
    const user = await User.findById(payload.id);
    if (!user) return next(new Error('unauthorized'));
    socket.user = { id: user._id.toString(), phone: user.phone, name: user.name };
    next();
  } catch (error) {
    next(new Error('unauthorized'));
  }
});

// Socket.io connection
io.on('connection', async (socket) => {
  const { id: userId, name } = socket.user;
  users.set(userId, { id: userId, name, socketId: socket.id, online: true, rooms: new Set() });
  socket.join(userId); // personal notifications

  // Update user online status
  await User.findByIdAndUpdate(userId, { online: true, lastSeen: new Date() });

  // Broadcast presence
  io.emit('presence:update', await getPresence());

  // User is ready, but don't join default room for now

  // Send message: { chatId, text, type }
  socket.on('message:send', async (payload, ack) => {
    try {
      const { chatId, text, type = 'text' } = payload;
      if (!chatId || !text) return ack && ack({ error: 'Chat ID and text required' });

      const chat = await Chat.findById(chatId);
      if (!chat || !chat.participants.includes(userId)) return ack && ack({ error: 'Invalid chat' });

      const message = new Message({
        chatId,
        senderId: userId,
        content: text,
        type
      });
      await message.save();

      // Update chat lastMessage
      await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });

      const msgData = {
        id: message._id.toString(),
        from: userId,
        fromName: name,
        chatId,
        text,
        ts: message.timestamp,
        readBy: [],
        reactions: {},
        type
      };

      io.to(chatId).emit('message:new', msgData);

      // Notify offline participants
      for (const participant of chat.participants) {
        if (participant.toString() !== userId && (!users.get(participant.toString()) || !users.get(participant.toString()).online)) {
          io.to(participant.toString()).emit('notification', { type: 'message', from: userId, text, ts: message.timestamp });
        }
      }

      if (ack) ack({ ok: true, messageId: message._id.toString() });
    } catch (error) {
      console.error(error);
      if (ack) ack({ error: 'Server error' });
    }
  });

  // Typing
  socket.on('typing', ({ roomId, typing }) => socket.to(roomId).emit('typing', { userId, name, typing }));

  // Read receipt
  socket.on('message:read', async ({ chatId, messageId }) => {
    try {
      const message = await Message.findById(messageId);
      if (message && message.chatId.toString() === chatId && !message.status.read.includes(userId)) {
        message.status.read.push(userId);
        await message.save();
        io.to(chatId).emit('message:read', { messageId, by: userId });
      }
    } catch (error) {
      console.error(error);
    }
  });

  // Reactions
  socket.on('message:react', async ({ chatId, messageId, emoji }) => {
    try {
      const message = await Message.findById(messageId);
      if (message && message.chatId.toString() === chatId) {
        if (!message.reactions.has(emoji)) message.reactions.set(emoji, []);
        if (!message.reactions.get(emoji).includes(userId)) {
          message.reactions.get(emoji).push(userId);
          await message.save();
          io.to(chatId).emit('message:react', { messageId, emoji, by: userId, reactions: message.reactions.get(emoji) });
        }
      }
    } catch (error) {
      console.error(error);
    }
  });

  // Get message history
  socket.on('history:get', async ({ chatId, beforeTs, limit = 50 }, ack) => {
    try {
      const query = { chatId };
      if (beforeTs) query.timestamp = { $lt: new Date(beforeTs) };

      const messages = await Message.find(query)
        .populate('senderId', 'name avatar')
        .sort({ timestamp: -1 })
        .limit(limit);

      const formattedMessages = messages.reverse().map(m => ({
        id: m._id.toString(),
        from: m.senderId._id.toString(),
        fromName: m.senderId.name,
        chatId: m.chatId.toString(),
        text: m.content,
        ts: m.timestamp,
        readBy: m.status.read.map(id => id.toString()),
        reactions: Object.fromEntries(m.reactions),
        type: m.type
      }));

      ack({ messages: formattedMessages });
    } catch (error) {
      console.error(error);
      ack({ error: 'Server error' });
    }
  });

  // Join/Leave chat
  socket.on('chat:join', ({ chatId }) => {
    socket.join(chatId);
    users.get(userId).rooms.add(chatId);
    io.to(chatId).emit('chat:members', { chatId, members: getRoomMembers(chatId) });
  });

  socket.on('chat:leave', ({ chatId }) => {
    socket.leave(chatId);
    users.get(userId).rooms.delete(chatId);
    io.to(chatId).emit('chat:members', { chatId, members: getRoomMembers(chatId) });
  });

  // Disconnect
  socket.on('disconnect', async () => {
    const u = users.get(userId);
    if (u) { u.online = false; u.socketId = null; }
    await User.findByIdAndUpdate(userId, { online: false, lastSeen: new Date() });
    io.emit('presence:update', await getPresence());
  });
});

// Start server
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
