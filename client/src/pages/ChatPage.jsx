// client/src/pages/ChatPage.jsx
import React, { useContext, useEffect, useState, useRef } from 'react';
import { getSocket } from '../socket/socket';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

function useSocketEvent(event, handler) {
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    s.on(event, handler);
    return () => s.off(event, handler);
  }, [event, handler]);
}

// Simple audio for notifications
const ping = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');

export default function ChatPage(){
  const { user, logout, token } = useContext(AuthContext);
  const [presence, setPresence] = useState([]);
  const [rooms, setRooms] = useState(['general']);
  const [currentRoom, setCurrentRoom] = useState('general');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState({});
  const [members, setMembers] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const socket = getSocket();
  const lastLoadTs = useRef(Date.now());
  const scrollRef = useRef();

  // Connect events
  useSocketEvent('presence:update', (list) => setPresence(list));
  useSocketEvent('message:new', (m) => {
    if (m.roomId === currentRoom) {
      setMessages(prev => [...prev, m]);
      // sound & browser notification
      if (document.hidden) {
        try { new Notification(`Message from ${m.fromName}`, { body: m.text }); } catch(e) {}
      }
      try { ping.play(); } catch(e) {}
    } else {
      setUnreadCount(c => c + 1);
      // sound for other rooms
      try { ping.play(); } catch(e) {}
    }
  });
  useSocketEvent('typing', ({ userId, username, typing }) => {
    setTypingUsers(prev => {
      const copy = {...prev};
      if (typing) copy[userId] = username;
      else delete copy[userId];
      return copy;
    });
  });
  useSocketEvent('message:read', ({ messageId, by }) => {
    setMessages(prev => prev.map(m => m.id === messageId ? {...m, readBy: Array.from(new Set([...(m.readBy||[]), by])) } : m));
  });
  useSocketEvent('room:members', ({ roomId, members }) => {
    if (roomId === currentRoom) setMembers(members);
  });
  useSocketEvent('notification', (n) => {
    // show a small in-app notification or console
    console.log('notification', n);
  });
  useSocketEvent('message:react', ({ messageId, emoji, by, reactions }) => {
    setMessages(prev => prev.map(m => m.id === messageId ? {...m, reactions: {...m.reactions, [emoji]: reactions} } : m));
  });

  // Initial history load
  useEffect(() => {
    if (!socket) return;
    loadHistory();
    socket.emit('room:join', { roomId: currentRoom });
    return () => { socket && socket.emit('room:leave', { roomId: currentRoom }); };
    // eslint-disable-next-line
  }, [currentRoom, socket]);

  // scroll to bottom on new messages
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  async function loadHistory(beforeTs = Date.now()) {
    setLoadingMore(true);
    const s = getSocket();
    if (!s) return;
    s.emit('history:get', { roomId: currentRoom, beforeTs, limit: 30 }, (res) => {
      if (res && res.messages) {
        setMessages(prev => [...res.messages, ...prev]);
        lastLoadTs.current = res.messages.length ? res.messages[0].ts : lastLoadTs.current;
      }
      setLoadingMore(false);
    });
  }

  function sendMessage() {
    if (!input.trim()) return;
    const payload = { roomId: currentRoom, text: input, type: 'text' };
    socket.emit('message:send', payload, (ack) => { /* handle ack if needed */ });
    setInput('');
    socket.emit('typing', { roomId: currentRoom, typing: false });
  }

  let typingTimer;
  function onTyping(e) {
    setInput(e.target.value);
    socket.emit('typing', { roomId: currentRoom, typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => socket.emit('typing', { roomId: currentRoom, typing: false }), 800);
  }

  function markRead(messageId) {
    socket.emit('message:read', { roomId: currentRoom, messageId });
  }

  function react(messageId, emoji) {
    socket.emit('message:react', { roomId: currentRoom, messageId, emoji });
  }

  // File upload
  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await axios.post(SERVER + '/upload', form);
    const payload = { roomId: currentRoom, text: res.data.url, type: 'image' };
    socket.emit('message:send', payload);
  }

  // Search messages (server endpoint)
  async function search(q) {
    if (!q) { setSearchResults([]); return; }
    const res = await axios.get(SERVER + '/search?q=' + encodeURIComponent(q));
    setSearchResults(res.data.results || []);
  }

  // Request permission for browser notifications
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission().then(() => {});
    }
  }, []);

  function startDM(otherId, otherUsername) {
    const dmRoom = [user.id, otherId].sort().join('#');
    if (!rooms.includes(dmRoom)) {
      setRooms(prev => [...prev, dmRoom]);
    }
    setCurrentRoom(dmRoom);
  }

  // WhatsApp-like UI
  return (
    <div className="chat-container">
      <div className="sidebar">
        <div style={{padding: '16px 20px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <strong style={{color: '#075e54'}}>{user?.username}</strong>
          <button onClick={logout} style={{background: '#dc3545', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer'}}>Logout</button>
        </div>

        <div style={{flex: 1, overflowY: 'auto'}}>
          <div style={{padding: '16px 20px', borderBottom: '1px solid #e0e0e0'}}>
            <h4 style={{margin: 0, color: '#075e54'}}>Rooms</h4>
            <ul className="room-list">
              {rooms.map(r => {
                const isDM = r.includes('#');
                const displayName = isDM ? presence.find(p => r.split('#').includes(p.id) && p.id !== user.id)?.username || r : r;
                return (
                  <li key={r} className={`room-item ${r === currentRoom ? 'active' : ''}`} onClick={() => setCurrentRoom(r)}>
                    <div className="room-avatar">{displayName.charAt(0).toUpperCase()}</div>
                    <div>{displayName}</div>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={() => { const rn = prompt('New room name'); if (rn) setRooms(prev => [...prev, rn]); }}
              style={{width: '100%', padding: '8px', background: '#25d366', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '8px'}}
            >
              + New Room
            </button>
          </div>

          <div className="user-list">
            <h4 style={{margin: '0 0 16px 0', color: '#075e54'}}>People</h4>
            {presence.filter(p => p.id !== user.id).map(p => (
              <div key={p.id} className="user-item">
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <div className="room-avatar" style={{width: '32px', height: '32px', fontSize: '14px'}}>{p.username.charAt(0).toUpperCase()}</div>
                  <span>{p.username}</span>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <div className={`user-status ${p.online ? 'online' : ''}`}></div>
                  <button
                    onClick={() => startDM(p.id, p.username)}
                    style={{background: '#25d366', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'}}
                  >
                    DM
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{padding: '16px 20px', borderTop: '1px solid #e0e0e0'}}>
            <input
              placeholder="Search messages"
              onChange={e => search(e.target.value)}
              className="login-input"
              style={{marginBottom: '8px'}}
            />
            <div style={{maxHeight: '120px', overflowY: 'auto'}}>
              {searchResults.map((r, i) => (
                <div key={i} style={{padding: '6px', borderBottom: '1px solid #eee', fontSize: '12px'}}>
                  <strong>{r.message.fromName}:</strong> {r.message.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="chat-area">
        <div className="chat-header">
          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
            <div className="room-avatar">{currentRoom.charAt(0).toUpperCase()}</div>
            <strong>{currentRoom}</strong>
          </div>
          <div style={{fontSize: '14px'}}>
            {Object.values(typingUsers).length > 0 && `${Object.values(typingUsers).join(', ')} typing...`}
          </div>
        </div>

        <div ref={scrollRef} className="chat-messages">
          <button
            onClick={() => loadMore()}
            style={{width: '100%', padding: '8px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', marginBottom: '16px'}}
          >
            Load Older Messages
          </button>
          {loadingMore && <div style={{textAlign: 'center', padding: '16px'}}>Loading...</div>}
          {messages.map(m => (
            <div key={m.id} style={{display: 'flex', flexDirection: 'column', alignItems: m.from === user.id ? 'flex-end' : 'flex-start'}}>
              <div className={`message-bubble ${m.from === user.id ? 'message-own' : 'message-other'}`}>
                <div style={{fontSize: '12px', color: '#666', marginBottom: '4px'}}>{m.fromName}</div>
                {m.type === 'image' ? (
                  <img src={`${SERVER}${m.text}`} alt="" style={{maxWidth: '200px', borderRadius: '4px'}} />
                ) : (
                  <div>{m.text}</div>
                )}
                <div className="message-time">{new Date(m.ts).toLocaleTimeString()}</div>
                {m.reactions && Object.keys(m.reactions).length > 0 && (
                  <div style={{fontSize: '12px', marginTop: '4px'}}>
                    {Object.keys(m.reactions).map(e => `${e} ${m.reactions[e].length}`).join(' ')}
                  </div>
                )}
              </div>
              <div style={{display: 'flex', gap: '4px', marginTop: '4px'}}>
                <button
                  onClick={() => markRead(m.id)}
                  style={{fontSize: '10px', padding: '2px 4px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '2px', cursor: 'pointer'}}
                >
                  ✓ Read
                </button>
                <button
                  onClick={() => react(m.id, '👍')}
                  style={{fontSize: '10px', padding: '2px 4px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '2px', cursor: 'pointer'}}
                >
                  👍
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="message-input-area">
          <input
            type="file"
            onChange={handleFile}
            style={{display: 'none'}}
            id="file-input"
          />
          <label
            htmlFor="file-input"
            style={{cursor: 'pointer', fontSize: '20px', color: '#666'}}
          >
            📎
          </label>
          <input
            value={input}
            onChange={onTyping}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            className="message-input"
            placeholder="Type a message..."
          />
          <button onClick={sendMessage} className="send-button">➤</button>
        </div>
      </div>
    </div>
  );

  // helper to load older messages
  function loadMore() {
    if (!messages.length) loadHistoryNow(Date.now());
    else loadHistoryNow(messages[0].ts);
  }
  function loadHistoryNow(beforeTs) {
    setLoadingMore(true);
    socket.emit('history:get', { roomId: currentRoom, beforeTs, limit: 30 }, (res) => {
      if (res && res.messages) {
        setMessages(prev => [...res.messages, ...prev]);
      }
      setLoadingMore(false);
    });
  }
}