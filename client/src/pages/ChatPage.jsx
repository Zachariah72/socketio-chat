// client/src/pages/ChatPage.jsx
import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { getSocket } from '../socket/socket';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import Cropper from 'react-easy-crop';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

function useSocketEvent(socket, event, handler) {
  useEffect(() => {
    if (!socket) return;
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket, event, handler]);
}

// Simple audio for notifications
const ping = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');

export default function ChatPage(){
  const { user, logout, updateUser, token } = useContext(AuthContext);
  const [presence, setPresence] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [chats, setChats] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState({});
  const [members, setMembers] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [encryptionEnabled, setEncryptionEnabled] = useState(() => localStorage.getItem('smiley-encryption') === 'true');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [socket, setSocket] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [statusText, setStatusText] = useState('');
  const [statusMedia, setStatusMedia] = useState(null);
  const [statusMediaType, setStatusMediaType] = useState(''); // 'image', 'video', 'audio'
  const [activeStatuses, setActiveStatuses] = useState([]);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');

  useEffect(() => {
    setSocket(getSocket());
  }, []);
  const lastLoadTs = useRef(Date.now());
  const scrollRef = useRef();

  const emojis = ['😀', '😂', '😊', '😍', '🥰', '😘', '😉', '😎', '🤔', '😢', '😭', '😤', '😡', '🥺', '😴', '🤤', '🤗', '🤭', '🤫', '🤥'];

  // Connect events
  useSocketEvent(socket, 'presence:update', (list) => setPresence(list));
  useSocketEvent(socket, 'message:new', (m) => {
    if (m.chatId === currentChat?._id) {
      setMessages(prev => [...prev, m]);
      // sound & browser notification
      if (document.hidden) {
        try { new Notification(`Message from ${m.fromName}`, { body: m.text }); } catch(e) {}
      }
      try { ping.play(); } catch(e) {}
    } else {
      setUnreadCount(c => c + 1);
      // sound for other chats
      try { ping.play(); } catch(e) {}
    }
  });
  useSocketEvent(socket, 'typing', ({ userId, name, typing }) => {
    setTypingUsers(prev => {
      const copy = {...prev};
      if (typing) copy[userId] = name;
      else delete copy[userId];
      return copy;
    });
  });
  useSocketEvent(socket, 'message:read', ({ messageId, by }) => {
    setMessages(prev => prev.map(m => m.id === messageId ? {...m, readBy: Array.from(new Set([...(m.readBy||[]), by])) } : m));
  });
  useSocketEvent(socket, 'chat:members', ({ chatId, members }) => {
    if (chatId === currentChat?._id) setMembers(members);
  });
  useSocketEvent(socket, 'notification', (n) => {
    // show a small in-app notification or console
    console.log('notification', n);
  });
  useSocketEvent(socket, 'message:react', ({ messageId, emoji, by, reactions }) => {
    setMessages(prev => prev.map(m => m.id === messageId ? {...m, reactions: {...m.reactions, [emoji]: reactions} } : m));
  });


  // Load and clean up status updates
  useEffect(() => {
    const loadStatuses = () => {
      const stored = localStorage.getItem('smiley-statuses');
      if (stored) {
        try {
          const statuses = JSON.parse(stored);
          const now = Date.now();
          // Filter out expired statuses (older than 24 hours)
          const activeStatuses = statuses.filter(status => status.expiresAt > now);
          setActiveStatuses(activeStatuses);
          // Update localStorage with cleaned statuses
          localStorage.setItem('smiley-statuses', JSON.stringify(activeStatuses));
        } catch (error) {
          console.error('Failed to load statuses:', error);
        }
      }
    };

    loadStatuses();
    // Check for expired statuses every minute
    const interval = setInterval(loadStatuses, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch contacts and chats
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contactsRes, chatsRes] = await Promise.all([
          axios.get(SERVER + '/contacts', { headers: { Authorization: token } }),
          axios.get(SERVER + '/chats', { headers: { Authorization: token } })
        ]);
        setContacts(contactsRes.data.contacts);
        setChats(chatsRes.data.chats);
      } catch (error) {
        console.error('Failed to fetch data', error);
      }
    };
    if (token) fetchData();
  }, [token]);

  // Initial history load
  useEffect(() => {
    if (!currentChat) return;

    // Skip server operations for test chats and local groups
    if (currentChat._id.startsWith('test-chat-') || currentChat._id.startsWith('group-')) {
      return;
    }

    if (!socket) return;
    loadHistory();
    socket.emit('chat:join', { chatId: currentChat._id });
    return () => { socket && socket.emit('chat:leave', { chatId: currentChat._id }); };
  }, [currentChat, socket]);

  // scroll to bottom on new messages
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  async function loadHistory(beforeTs = Date.now()) {
    setLoadingMore(true);
    if (!socket || !currentChat) return;

    // Skip server history loading for test chats and local groups
    if (currentChat._id.startsWith('test-chat-') || currentChat._id.startsWith('group-')) {
      setLoadingMore(false);
      return;
    }

    socket.emit('history:get', { chatId: currentChat._id, beforeTs, limit: 30 }, (res) => {
      if (res && res.messages) {
        setMessages(prev => [...res.messages, ...prev]);
        lastLoadTs.current = res.messages.length ? res.messages[0].ts : lastLoadTs.current;
      }
      setLoadingMore(false);
    });
  }

  function sendMessage() {
    console.log('sendMessage called with input:', input, 'currentChat:', currentChat);

    if (!input.trim()) {
      console.log('Validation failed - input is empty');
      return;
    }

    if (!currentChat) {
      console.log('Validation failed - no chat selected');
      alert('Please select a chat first');
      return;
    }

    const encryptedText = encryptMessage(input);
    const isTestChat = currentChat._id.startsWith('test-chat-');

    if (isTestChat) {
      // For test chats, add message locally
      const newMessage = {
        id: 'msg-' + Date.now(),
        from: user.id,
        fromName: user.name,
        chatId: currentChat._id,
        text: encryptedText,
        ts: Date.now(),
        readBy: [],
        reactions: {},
        type: 'text'
      };

      setMessages(prev => [...prev, newMessage]);
      setInput('');
      console.log('Test message added locally');
      return;
    }

    // Ensure socket is connected for real chats
    console.log('Socket status:', socket, 'connected:', socket?.connected);
    if (!socket || !socket.connected) {
      alert('Connection lost. Please refresh the page.');
      console.error('Socket not connected');
      return;
    }

    const payload = { chatId: currentChat._id, text: encryptedText, type: 'text' };

    console.log('Sending payload:', payload);

    try {
      socket.emit('message:send', payload, (ack) => {
        console.log('Server acknowledgment:', ack);
        if (ack && ack.error) {
          console.error('Failed to send message:', ack.error);
          alert('Failed to send message: ' + ack.error);
        } else {
          console.log('Message sent successfully');
        }
      });

      // Clear input and stop typing immediately for better UX
      setInput('');
      socket.emit('typing', { chatId: currentChat._id, typing: false });

    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    }
  }

  let typingTimer;
  function onTyping(e) {
    setInput(e.target.value);
    if (currentChat && socket) socket.emit('typing', { chatId: currentChat._id, typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      if (currentChat && socket) socket.emit('typing', { chatId: currentChat._id, typing: false });
    }, 800);
  }

  function markRead(messageId) {
    if (currentChat && socket) socket.emit('message:read', { chatId: currentChat._id, messageId });
  }

  function react(messageId, emoji) {
    if (currentChat && socket) socket.emit('message:react', { chatId: currentChat._id, messageId, emoji });
  }

  // File upload
  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file || !currentChat || !socket) return;
    const form = new FormData();
    form.append('file', file);
    const res = await axios.post(SERVER + '/upload', form);
    const payload = { chatId: currentChat._id, text: res.data.url, type: 'image' };
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

  async function startChat(contactId) {
    try {
      const res = await axios.post(SERVER + '/chats/individual', { contactId }, { headers: { Authorization: token } });
      const chat = res.data.chat;
      setChats(prev => [chat, ...prev.filter(c => c._id !== chat._id)]);
      setCurrentChat(chat);
    } catch (error) {
      alert('Failed to start chat');
    }
  }

  async function createTestChat() {
    try {
      // Create a test chat with sample messages
      const testChat = {
        _id: 'test-chat-' + Date.now(),
        type: 'individual',
        participants: [
          { _id: user.id, name: user.name },
          { _id: 'test-user', name: 'Test User' }
        ],
        name: 'Test Chat',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Add test chat to chats list
      setChats(prev => [testChat, ...prev]);
      setCurrentChat(testChat);

      // Add some sample messages
      const sampleMessages = [
        {
          id: 'msg-1',
          from: 'test-user',
          fromName: 'Test User',
          chatId: testChat._id,
          text: 'Hello! This is a test message.',
          ts: Date.now() - 300000, // 5 minutes ago
          readBy: [],
          reactions: {},
          type: 'text'
        },
        {
          id: 'msg-2',
          from: 'test-user',
          fromName: 'Test User',
          chatId: testChat._id,
          text: 'You can reply to this message!',
          ts: Date.now() - 120000, // 2 minutes ago
          readBy: [],
          reactions: {},
          type: 'text'
        },
        {
          id: 'msg-3',
          from: 'test-user',
          fromName: 'Test User',
          chatId: testChat._id,
          text: 'Try sending a message back. The send button should work now! 🚀',
          ts: Date.now() - 60000, // 1 minute ago
          readBy: [],
          reactions: {},
          type: 'text'
        }
      ];

      setMessages(sampleMessages);

      alert('Test chat created! You can now reply to the messages.');
    } catch (error) {
      console.error('Failed to create test chat:', error);
      alert('Failed to create test chat');
    }
  }

  async function addContact(phone) {
    try {
      const res = await axios.post(SERVER + '/contacts', { phone }, { headers: { Authorization: token } });
      setContacts(prev => [...prev, res.data.contact]);
    } catch (error) {
      alert('Failed to add contact: ' + error.response?.data?.error);
    }
  }

  const createCroppedImage = useCallback(async (imageSrc, croppedAreaPixels) => {
    const image = new Image();
    image.src = imageSrc;

    return new Promise((resolve) => {
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = croppedAreaPixels.width;
        canvas.height = croppedAreaPixels.height;

        ctx.drawImage(
          image,
          croppedAreaPixels.x,
          croppedAreaPixels.y,
          croppedAreaPixels.width,
          croppedAreaPixels.height,
          0,
          0,
          croppedAreaPixels.width,
          croppedAreaPixels.height
        );

        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.95);
      };
    });
  }, []);

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    // Convert file to data URL for cropping
    const reader = new FileReader();
    reader.onload = () => {
      setCropImage(reader.result);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropSave = async () => {
    if (!cropImage || !croppedAreaPixels) return;

    try {
      const croppedBlob = await createCroppedImage(cropImage, croppedAreaPixels);

      const formData = new FormData();
      formData.append('file', croppedBlob, 'profile-picture.jpg');

      const uploadRes = await axios.post(SERVER + '/upload', formData);
      const avatarUrl = uploadRes.data.url;

      // Update user profile with new avatar
      await axios.put(SERVER + '/user/profile', { avatar: avatarUrl }, { headers: { Authorization: token } });

      // Update local user state
      updateUser({ avatar: avatarUrl });

      // Close modal
      setShowCropModal(false);
      setCropImage(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);

    } catch (error) {
      console.error('Failed to upload profile picture:', error);
      alert('Failed to upload profile picture');
    }
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    setCropImage(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  async function removeProfilePicture() {
    try {
      // Update user profile to remove avatar
      await axios.put(SERVER + '/user/profile', { avatar: '' }, { headers: { Authorization: token } });

      // Update local user state
      updateUser({ avatar: '' });

    } catch (error) {
      console.error('Failed to remove profile picture:', error);
      alert('Failed to remove profile picture');
    }
  }

  const handleStatusMediaUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    // Validate video duration (2 minutes max)
    if (type === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        if (video.duration > 120) { // 2 minutes
          alert('Video duration must be less than 2 minutes');
          return;
        }
      };
      video.src = URL.createObjectURL(file);
    }

    // Convert to data URL for preview
    const reader = new FileReader();
    reader.onload = () => {
      setStatusMedia(reader.result);
      setStatusMediaType(type);
    };
    reader.readAsDataURL(file);
  };

  const handleStatusPost = async () => {
    if (!statusText.trim() && !statusMedia) return;

    try {
      let mediaUrl = null;

      // Upload media if present
      if (statusMedia) {
        const response = await fetch(statusMedia);
        const blob = await response.blob();
        const formData = new FormData();
        formData.append('file', blob, `status-${Date.now()}.${statusMediaType === 'image' ? 'jpg' : statusMediaType === 'video' ? 'mp4' : 'mp3'}`);

        const uploadRes = await axios.post(SERVER + '/upload', formData);
        mediaUrl = uploadRes.data.url;
      }

      const newStatus = {
        id: Date.now(),
        text: statusText,
        media: mediaUrl,
        mediaType: statusMediaType,
        timestamp: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      };

      setActiveStatuses(prev => [newStatus, ...prev]);
      setStatusText('');
      setStatusMedia(null);
      setStatusMediaType('');

      // Store in localStorage for persistence
      localStorage.setItem('smiley-statuses', JSON.stringify([newStatus, ...activeStatuses]));

    } catch (error) {
      console.error('Failed to post status:', error);
      alert('Failed to post status');
    }
  };


  const encryptMessage = (text) => {
    if (!encryptionEnabled) return text;
    const key = 'demoencryptionkey';
    const encrypted = CryptoJS.AES.encrypt(text, key).toString();
    return encrypted + '|' + key;
  };

  const decryptMessage = (text) => {
    if (!encryptionEnabled || !text.includes('|')) return text;
    const [encrypted, key] = text.split('|');
    try {
      const decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);
      return decrypted;
    } catch {
      return text;
    }
  };

  // Smiley UI
  return (
    <div className="chat-container">
      <div className="sidebar">
        <div style={{padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundImage: user?.avatar ? `url(${SERVER}${user.avatar})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '18px',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
            }}>
              {!user?.avatar && user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <strong style={{color: 'white', fontSize: '16px'}}>{user?.name}</strong>
              <div style={{color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px'}}>{user?.status || 'Hey there! I am using Smiley 😊'}</div>
            </div>
          </div>
          <div style={{display: 'flex', gap: '8px'}}>
            <button onClick={() => setShowSettings(!showSettings)} style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.3s ease'
            }}>⚙️ Settings</button>
            <button onClick={logout} style={{
              background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}>Logout</button>
          </div>
        </div>

        <div style={{flex: 1, overflowY: 'auto'}}>
          {/* New Chat Section */}
          <div style={{padding: '16px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)'}}>
            <button
              onClick={() => setShowNewChat(!showNewChat)}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                padding: '12px 20px',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
              }}
            >
              ➕ New Chat
            </button>

            {showNewChat && (
              <div style={{
                marginTop: '16px',
                padding: '20px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <h4 style={{margin: '0 0 16px 0', color: 'white', fontSize: '16px'}}>Start a New Chat</h4>

                <div style={{marginBottom: '16px'}}>
                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    value={newChatPhone}
                    onChange={(e) => setNewChatPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      fontSize: '16px',
                      marginBottom: '12px',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={async () => {
                      if (!newChatPhone.trim()) return;
                      try {
                        const res = await axios.post(SERVER + '/contacts', { phone: newChatPhone }, { headers: { Authorization: token } });
                        setContacts(prev => [...prev, res.data.contact]);
                        setNewChatPhone('');
                        alert('Contact added! You can now start a chat.');
                      } catch (error) {
                        alert('Failed to add contact: ' + error.response?.data?.error);
                      }
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                      color: 'white',
                      border: 'none',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      width: '100%',
                      marginBottom: '8px'
                    }}
                  >
                    Add Contact
                  </button>
                </div>

                <div style={{borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px'}}>
                  <h5 style={{margin: '0 0 12px 0', color: 'white', fontSize: '14px'}}>Create</h5>
                  <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                    <button
                      onClick={() => setShowCreateGroup(!showCreateGroup)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        textAlign: 'left'
                      }}
                    >
                      👥 Create Group/Community
                    </button>
                    <button
                      onClick={createTestChat}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        textAlign: 'left'
                      }}
                    >
                      🧪 Test Chat
                    </button>
                    <button
                      onClick={() => setShowNewChat(false)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        textAlign: 'left'
                      }}
                    >
                      📋 View Contacts
                    </button>
                  </div>
                </div>

                {/* Group Creation Form */}
                {showCreateGroup && (
                  <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <h5 style={{margin: '0 0 12px 0', color: 'white', fontSize: '14px'}}>Create New Group</h5>
                    <input
                      type="text"
                      placeholder="Group name"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        fontSize: '14px',
                        marginBottom: '8px',
                        outline: 'none'
                      }}
                    />
                    <textarea
                      placeholder="Group description (optional)"
                      value={groupDescription}
                      onChange={(e) => setGroupDescription(e.target.value)}
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        fontSize: '14px',
                        marginBottom: '12px',
                        outline: 'none',
                        resize: 'vertical'
                      }}
                    />
                    <div style={{display: 'flex', gap: '8px'}}>
                      <button
                        onClick={async () => {
                          if (!groupName.trim()) return;

                          try {
                            // Create group chat (for now, just add to local chats)
                            const newGroup = {
                              _id: 'group-' + Date.now(),
                              type: 'group',
                              name: groupName,
                              description: groupDescription,
                              participants: [user.id],
                              createdBy: user.id,
                              createdAt: new Date(),
                              updatedAt: new Date()
                            };

                            setChats(prev => [newGroup, ...prev]);
                            setCurrentChat(newGroup);
                            setGroupName('');
                            setGroupDescription('');
                            setShowCreateGroup(false);

                            alert('Group created! You can now invite members and start chatting.');
                          } catch (error) {
                            console.error('Failed to create group:', error);
                            alert('Failed to create group');
                          }
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          flex: 1
                        }}
                      >
                        Create Group
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateGroup(false);
                          setGroupName('');
                          setGroupDescription('');
                        }}
                        style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          color: 'white',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {showSettings && (
            <div style={{padding: '24px', borderBottom: '1px solid rgba(255, 255, 255, 0.2)', background: 'rgba(255, 255, 255, 0.05)'}}>
              <h4 style={{margin: '0 0 20px 0', color: 'white', fontSize: '18px'}}>Profile Settings</h4>

              {/* Profile Picture Section */}
              <div style={{marginBottom: '24px', textAlign: 'center'}}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundImage: user?.avatar ? `url(${SERVER}${user.avatar})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '24px',
                    margin: '0 auto 16px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                    border: '3px solid rgba(255, 255, 255, 0.3)',
                    cursor: user?.avatar ? 'pointer' : 'default',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={() => user?.avatar && setCropImage(`${SERVER}${user.avatar}`) && setShowCropModal(true)}
                  title={user?.avatar ? 'Click to view full size' : ''}
                >
                  {!user?.avatar && user?.name?.charAt(0).toUpperCase()}
                </div>
                <div style={{display: 'flex', gap: '8px', justifyContent: 'center'}}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePictureUpload}
                    style={{display: 'none'}}
                    id="profile-pic-input"
                  />
                  <label
                    htmlFor="profile-pic-input"
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    📷 Upload
                  </label>
                  {user?.avatar && (
                    <button
                      onClick={removeProfilePicture}
                      style={{
                        background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      🗑️ Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Other Settings */}
              <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <label style={{color: 'white', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <input type="checkbox" style={{accentColor: '#667eea'}} />
                  Enable notifications
                </label>
                <label style={{color: 'white', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <input
                    type="checkbox"
                    checked={encryptionEnabled}
                    onChange={(e) => {
                      setEncryptionEnabled(e.target.checked);
                      localStorage.setItem('smiley-encryption', e.target.checked);
                    }}
                    style={{accentColor: '#667eea'}}
                  />
                  Enable E2E Encryption
                </label>
                <label style={{color: 'white', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <input type="checkbox" style={{accentColor: '#667eea'}} />
                  Dark mode (coming soon)
                </label>
                <label style={{color: 'white', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <input type="checkbox" style={{accentColor: '#667eea'}} />
                  Sound effects
                </label>
              </div>

              {/* Status Update Section */}
              <div style={{marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)'}}>
                <h4 style={{margin: '0 0 16px 0', color: 'white', fontSize: '16px'}}>📱 Status Update</h4>

                {/* Media Preview */}
                {statusMedia && (
                  <div style={{marginBottom: '16px', textAlign: 'center'}}>
                    <div style={{
                      position: 'relative',
                      display: 'inline-block',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '2px solid rgba(255, 255, 255, 0.3)'
                    }}>
                      {statusMediaType === 'image' && (
                        <img
                          src={statusMedia}
                          alt="Status preview"
                          style={{maxWidth: '200px', maxHeight: '200px', display: 'block'}}
                        />
                      )}
                      {statusMediaType === 'video' && (
                        <video
                          src={statusMedia}
                          controls
                          style={{maxWidth: '200px', maxHeight: '200px'}}
                        />
                      )}
                      {statusMediaType === 'audio' && (
                        <div style={{
                          padding: '20px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          <span style={{fontSize: '24px'}}>🎵</span>
                          <audio src={statusMedia} controls style={{flex: 1}} />
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setStatusMedia(null);
                          setStatusMediaType('');
                        }}
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

                {/* Media Upload Buttons */}
                <div style={{display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap'}}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleStatusMediaUpload(e, 'image')}
                    style={{display: 'none'}}
                    id="status-image"
                  />
                  <label
                    htmlFor="status-image"
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    📷 Photo
                  </label>

                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => handleStatusMediaUpload(e, 'video')}
                    style={{display: 'none'}}
                    id="status-video"
                  />
                  <label
                    htmlFor="status-video"
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🎥 Video
                  </label>

                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => handleStatusMediaUpload(e, 'audio')}
                    style={{display: 'none'}}
                    id="status-audio"
                  />
                  <label
                    htmlFor="status-audio"
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🎵 Audio
                  </label>
                </div>

                {/* Text Input */}
                <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
                  <input
                    type="text"
                    placeholder="What's on your mind? (optional with media)"
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    maxLength={100}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      border: '2px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={handleStatusPost}
                    disabled={!statusText.trim() && !statusMedia}
                    style={{
                      background: (!statusText.trim() && !statusMedia)
                        ? 'rgba(255, 255, 255, 0.2)'
                        : 'linear-gradient(135deg, #FF6B6B 0%, #EE5A52 100%)',
                      color: 'white',
                      border: 'none',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      cursor: (!statusText.trim() && !statusMedia) ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Post Status
                  </button>
                </div>
                <p style={{margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)'}}>
                  Status updates disappear after 24 hours • Max file size: 5MB • Max video duration: 2 minutes
                </p>
              </div>
            </div>
          )}
          <div style={{padding: '16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)'}}>
            <h4 style={{margin: 0, color: 'white'}}>Chats</h4>
            <ul className="room-list">
              {chats.map(c => {
                const otherParticipant = c.participants.find(p => p._id !== user.id);
                const displayName = c.type === 'individual' ? (otherParticipant?.name || 'Unknown') : c.name;
                const isGroup = c.type === 'group';
                const isTest = c._id.startsWith('test-chat-');

                return (
                  <li key={c._id} className={`room-item ${c._id === currentChat?._id ? 'active' : ''}`} onClick={() => setCurrentChat(c)}>
                    <div className="room-avatar" style={{
                      background: isGroup ? 'linear-gradient(135deg, #FF6B6B 0%, #EE5A52 100%)' :
                                 isTest ? 'linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%)' :
                                 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    }}>
                      {isGroup ? '👥' : isTest ? '🧪' : displayName.charAt(0).toUpperCase()}
                    </div>
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: '500'}}>{displayName}</div>
                      {isGroup && c.description && (
                        <div style={{fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '2px'}}>
                          {c.description.length > 30 ? c.description.substring(0, 30) + '...' : c.description}
                        </div>
                      )}
                      {isTest && (
                        <div style={{fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '2px'}}>
                          Test conversation
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Status Updates Section */}
          {activeStatuses.length > 0 && (
            <div style={{padding: '16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)'}}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px'}}>
                <h4 style={{margin: 0, color: 'white', fontSize: '14px'}}>📱 My Status</h4>
                <button
                  onClick={() => setShowStatusModal(true)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  View All ({activeStatuses.length})
                </button>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                {activeStatuses.slice(0, 2).map(status => {
                  const timeLeft = Math.max(0, Math.floor((status.expiresAt - Date.now()) / (1000 * 60 * 60)));
                  return (
                    <div
                      key={status.id}
                      onClick={() => {
                        setCurrentStatusIndex(activeStatuses.findIndex(s => s.id === status.id));
                        setShowStatusModal(true);
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      {status.media && (
                        <div style={{marginBottom: '8px'}}>
                          {status.mediaType === 'image' && (
                            <img
                              src={`${SERVER}${status.media}`}
                              alt="Status"
                              style={{
                                width: '100%',
                                height: '60px',
                                objectFit: 'cover',
                                borderRadius: '4px'
                              }}
                            />
                          )}
                          {status.mediaType === 'video' && (
                            <video
                              src={`${SERVER}${status.media}`}
                              style={{
                                width: '100%',
                                height: '60px',
                                objectFit: 'cover',
                                borderRadius: '4px'
                              }}
                            />
                          )}
                          {status.mediaType === 'audio' && (
                            <div style={{
                              width: '100%',
                              height: '40px',
                              background: 'rgba(255, 255, 255, 0.1)',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '16px'
                            }}>
                              🎵
                            </div>
                          )}
                        </div>
                      )}
                      {status.text && (
                        <div style={{color: 'white', fontSize: '13px', marginBottom: '4px'}}>
                          {status.text.length > 50 ? status.text.substring(0, 50) + '...' : status.text}
                        </div>
                      )}
                      <div style={{color: 'rgba(255, 255, 255, 0.6)', fontSize: '11px'}}>
                        {timeLeft > 0 ? `${timeLeft}h left` : 'Expires soon'}
                      </div>
                      <div
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: `conic-gradient(#667eea ${((status.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)) * 360}deg, rgba(255, 255, 255, 0.2) 0deg)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '9px',
                          color: 'white',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const updatedStatuses = activeStatuses.filter(s => s.id !== status.id);
                          setActiveStatuses(updatedStatuses);
                          localStorage.setItem('smiley-statuses', JSON.stringify(updatedStatuses));
                        }}
                        title="Delete status"
                      >
                        ×
                      </div>
                    </div>
                  );
                })}
                {activeStatuses.length > 2 && (
                  <div style={{textAlign: 'center', color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px'}}>
                    +{activeStatuses.length - 2} more status{activeStatuses.length - 2 > 1 ? 'es' : ''}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="user-list">
            <h4 style={{margin: '0 0 16px 0', color: '#1976d2'}}>Contacts</h4>
            <div style={{padding: '8px 0'}}>
              <input
                placeholder="Add contact by phone"
                onKeyDown={e => e.key === 'Enter' && addContact(e.target.value)}
                style={{width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px'}}
              />
            </div>
            {contacts.map(c => (
              <div key={c.id} className="user-item">
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <div className="room-avatar" style={{width: '32px', height: '32px', fontSize: '14px'}}>{c.contactUser.name.charAt(0).toUpperCase()}</div>
                  <span>{c.customName || c.contactUser.name}</span>
                </div>
                <button
                  onClick={() => startChat(c.contactUser._id)}
                  style={{background: '#25d366', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'}}
                >
                  Chat
                </button>
              </div>
            ))}

            {/* Test Chat Section */}
            <div style={{marginTop: '20px', padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)'}}>
              <h4 style={{margin: '0 0 12px 0', color: 'white', fontSize: '14px'}}>🧪 Test Features</h4>
              <button
                onClick={createTestChat}
                style={{
                  background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  width: '100%',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => e.target.style.transform = 'scale(1.02)'}
                onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
              >
                Create Test Chat
              </button>
              <p style={{margin: '8px 0 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center'}}>
                Test the send button with sample messages
              </p>
            </div>
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
            <div className="room-avatar">{currentChat ? (currentChat.type === 'individual' ? currentChat.participants.find(p => p._id !== user.id)?.name.charAt(0).toUpperCase() : currentChat.name.charAt(0).toUpperCase()) : '?'}</div>
            <div>
              <strong style={{color: currentChat ? 'white' : 'rgba(255, 255, 255, 0.6)'}}>
                {currentChat ? (currentChat.type === 'individual' ? currentChat.participants.find(p => p._id !== user.id)?.name : currentChat.name) : 'Select a chat from the sidebar'}
              </strong>
              {!currentChat && (
                <div style={{color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', fontWeight: 'normal'}}>
                  Choose a conversation to start messaging
                </div>
              )}
            </div>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
            {currentChat && currentChat.type === 'individual' && (
              <>
                <button
                  onClick={() => alert('Video calling coming soon! 🚀')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    transition: 'all 0.3s ease'
                  }}
                  title="Video Call"
                >
                  📹
                </button>
                <button
                  onClick={() => alert('Audio calling coming soon! 📞')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    transition: 'all 0.3s ease'
                  }}
                  title="Audio Call"
                >
                  📞
                </button>
              </>
            )}
            <div style={{fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)'}}>
              {Object.values(typingUsers).length > 0 && `${Object.values(typingUsers).join(', ')} typing...`}
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="chat-messages">
          {!currentChat ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'rgba(255, 255, 255, 0.6)',
              textAlign: 'center',
              padding: '40px'
            }}>
              <div style={{fontSize: '48px', marginBottom: '20px'}}>💬</div>
              <h3 style={{margin: '0 0 10px 0', color: 'rgba(255, 255, 255, 0.8)'}}>Welcome to Smiley Chat!</h3>
              <p style={{margin: '0', fontSize: '16px'}}>
                Select a chat from the sidebar to start messaging
              </p>
            </div>
          ) : (
            <>
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
                      <div>{decryptMessage(m.text)}</div>
                    )}
                    <div className="message-time">{new Date(m.ts).toLocaleTimeString()}</div>
                    {m.from === user.id && (
                      <div style={{fontSize: '12px', color: '#666'}}>
                        {m.readBy.length > 1 ? '✓✓' : m.readBy.length > 0 ? '✓' : '○'}
                      </div>
                    )}
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
            </>
          )}
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
           <button
             onClick={() => setShowEmojis(!showEmojis)}
             style={{background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666'}}
           >
             😀
           </button>
           <input
             value={input}
             onChange={onTyping}
             onKeyDown={e => {
               if (e.key === 'Enter' && !e.shiftKey) {
                 e.preventDefault();
                 sendMessage();
               }
             }}
             className="message-input"
             placeholder="Type a message..."
           />
           <button
             onClick={sendMessage}
             className="send-button"
             disabled={!input.trim() || !currentChat}
             title={!input.trim() ? 'Type a message to send' : !currentChat ? 'Select a chat to send messages' : 'Send message'}
           >
             ➤
           </button>
           {showEmojis && (
             <div style={{position: 'absolute', bottom: '60px', left: '10px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', maxWidth: '200px'}}>
               {emojis.map(emoji => (
                 <button
                   key={emoji}
                   onClick={() => {
                     setInput(prev => prev + emoji);
                     setShowEmojis(false);
                   }}
                   style={{background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer'}}
                 >
                   {emoji}
                 </button>
               ))}
             </div>
           )}
         </div>
      </div>
      {/* Profile Picture Crop Modal */}
      {showCropModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{color: 'white', margin: '0 0 20px 0', textAlign: 'center'}}>
              {cropImage?.startsWith('data:') ? 'Crop Your Profile Picture' : 'Profile Picture'}
            </h3>

            <div style={{position: 'relative', height: '300px', marginBottom: '20px'}}>
              {cropImage?.startsWith('data:') ? (
                <Cropper
                  image={cropImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={handleCropComplete}
                  cropShape="round"
                  showGrid={false}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  background: `url(${cropImage})`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  borderRadius: '10px'
                }} />
              )}
            </div>

            {cropImage?.startsWith('data:') && (
              <div style={{marginBottom: '20px'}}>
                <label style={{color: 'white', display: 'block', marginBottom: '8px'}}>
                  Zoom: {zoom.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: '#667eea'
                  }}
                />
              </div>
            )}

            <div style={{display: 'flex', gap: '12px', justifyContent: 'center'}}>
              <button
                onClick={handleCropCancel}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                Cancel
              </button>
              {cropImage?.startsWith('data:') && (
                <button
                  onClick={handleCropSave}
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  Save & Upload
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {showStatusModal && activeStatuses.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '400px',
            height: '100%',
            maxHeight: '600px',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            {/* Close Button */}
            <button
              onClick={() => setShowStatusModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(0, 0, 0, 0.5)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                zIndex: 10,
                fontSize: '16px'
              }}
            >
              ×
            </button>

            {/* Navigation Arrows */}
            {activeStatuses.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentStatusIndex(prev => prev > 0 ? prev - 1 : activeStatuses.length - 1)}
                  style={{
                    position: 'absolute',
                    left: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0, 0, 0, 0.5)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    zIndex: 10
                  }}
                >
                  ‹
                </button>
                <button
                  onClick={() => setCurrentStatusIndex(prev => prev < activeStatuses.length - 1 ? prev + 1 : 0)}
                  style={{
                    position: 'absolute',
                    right: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0, 0, 0, 0.5)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    zIndex: 10
                  }}
                >
                  ›
                </button>
              </>
            )}

            {/* Status Indicators */}
            <div style={{
              position: 'absolute',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '4px',
              zIndex: 10
            }}>
              {activeStatuses.map((_, index) => (
                <div
                  key={index}
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: index === currentStatusIndex ? 'white' : 'rgba(255, 255, 255, 0.3)',
                    transition: 'all 0.3s ease'
                  }}
                />
              ))}
            </div>

            {/* Status Content */}
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px 20px'
            }}>
              {(() => {
                const currentStatus = activeStatuses[currentStatusIndex];
                const timeLeft = Math.max(0, Math.floor((currentStatus.expiresAt - Date.now()) / (1000 * 60 * 60)));

                return (
                  <>
                    {/* Media Content */}
                    {currentStatus.media && (
                      <div style={{marginBottom: '20px', maxWidth: '100%'}}>
                        {currentStatus.mediaType === 'image' && (
                          <img
                            src={`${SERVER}${currentStatus.media}`}
                            alt="Status"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '300px',
                              borderRadius: '12px',
                              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                            }}
                          />
                        )}
                        {currentStatus.mediaType === 'video' && (
                          <video
                            src={`${SERVER}${currentStatus.media}`}
                            controls
                            autoPlay
                            style={{
                              maxWidth: '100%',
                              maxHeight: '300px',
                              borderRadius: '12px',
                              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                            }}
                          />
                        )}
                        {currentStatus.mediaType === 'audio' && (
                          <div style={{
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            padding: '40px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '16px',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                          }}>
                            <div style={{fontSize: '48px'}}>🎵</div>
                            <audio
                              src={`${SERVER}${currentStatus.media}`}
                              controls
                              style={{width: '100%', maxWidth: '250px'}}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Text Content */}
                    {currentStatus.text && (
                      <div style={{
                        color: 'white',
                        fontSize: '18px',
                        textAlign: 'center',
                        marginBottom: '20px',
                        padding: '0 20px',
                        lineHeight: '1.4'
                      }}>
                        {currentStatus.text}
                      </div>
                    )}

                    {/* Time Left */}
                    <div style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontSize: '14px',
                      textAlign: 'center'
                    }}>
                      {timeLeft > 0 ? `${timeLeft} hour${timeLeft > 1 ? 's' : ''} left` : 'Expires soon'}
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={() => {
                        const updatedStatuses = activeStatuses.filter(s => s.id !== currentStatus.id);
                        setActiveStatuses(updatedStatuses);
                        localStorage.setItem('smiley-statuses', JSON.stringify(updatedStatuses));
                        if (updatedStatuses.length === 0) {
                          setShowStatusModal(false);
                        } else if (currentStatusIndex >= updatedStatuses.length) {
                          setCurrentStatusIndex(updatedStatuses.length - 1);
                        }
                      }}
                      style={{
                        position: 'absolute',
                        bottom: '20px',
                        right: '20px',
                        background: 'rgba(255, 0, 0, 0.8)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Delete
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // helper to load older messages
  function loadMore() {
    if (!messages.length) loadHistoryNow(Date.now());
    else loadHistoryNow(messages[0].ts);
  }
  function loadHistoryNow(beforeTs) {
    setLoadingMore(true);
    if (currentChat && socket && !currentChat._id.startsWith('test-chat-') && !currentChat._id.startsWith('group-')) {
      socket.emit('history:get', { chatId: currentChat._id, beforeTs, limit: 30 }, (res) => {
        if (res && res.messages) {
          setMessages(prev => [...res.messages, ...prev]);
        }
        setLoadingMore(false);
      });
    } else {
      setLoadingMore(false);
    }
  }
}