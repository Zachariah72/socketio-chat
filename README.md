# Real-Time Chat Application with Socket.io

A fully functional real-time chat application built with Socket.io, featuring bidirectional communication, private messaging, file sharing, and more.

## 🚀 Features

### Core Functionality
- **User Authentication**: Simple username-based login with JWT tokens
- **Real-Time Messaging**: Instant message delivery using Socket.io
- **Global Chat Room**: Default "general" room for all users
- **Online Status**: See who is online/offline
- **Typing Indicators**: Shows when users are typing
- **Message Timestamps**: All messages include timestamps

### Advanced Features
- **Private Messaging**: Direct messages between users
- **Multiple Rooms**: Create and join different chat rooms
- **File/Image Sharing**: Upload and share files and images
- **Message Reactions**: React to messages with emojis (👍 ❤️ 😂)
- **Read Receipts**: Mark messages as read
- **Message Search**: Search through chat history
- **Message History**: Load older messages with pagination
- **Sound Notifications**: Audio alerts for new messages
- **Browser Notifications**: Desktop notifications when app is not focused
- **Responsive Design**: Works on desktop and mobile devices

### Technical Features
- **Reconnection Logic**: Automatic reconnection on disconnection
- **Message Acknowledgment**: Delivery confirmation
- **Presence Updates**: Real-time online status updates
- **Room Management**: Join/leave rooms dynamically

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js, Socket.io
- **Frontend**: React, Vite, React Router
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer
- **Styling**: Inline CSS with responsive design

## 📁 Project Structure

```
socketio-chat/
├── client/                 # React frontend
│   ├── public/
│   │   ├── notification.mp3
│   │   └── src/
│   │       ├── components/
│   │       ├── context/
│   │       │   └── AuthContext.jsx
│   │       ├── pages/
│   │       │   ├── LoginPage.jsx
│   │       │   └── ChatPage.jsx
│   │       ├── socket/
│   │       │   └── socket.js
│   │       ├── App.jsx
│   │       ├── main.jsx
│   │       └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/                 # Node.js backend
│   ├── controllers/
│   ├── models/
│   ├── socket/
│   ├── config/
│   ├── server.js
│   ├── package.json
│   └── README.md
└── README.md
```

## 🚀 Setup Instructions

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd socketio-chat
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install client dependencies**
   ```bash
   cd ../client
   npm install
   ```

4. **Start the development servers**

   **Terminal 1 - Server:**
   ```bash
   cd server
   npm run dev
   ```

   **Terminal 2 - Client:**
   ```bash
   cd client
   npm run dev
   ```

5. **Open your browser**
   - Client: http://localhost:5173
   - Server: http://localhost:4000

## 🎯 Usage

1. **Login**: Enter a username to join the chat
2. **Chat**: Start messaging in the general room
3. **Private Messages**: Click "DM" next to any online user
4. **Rooms**: Create new rooms or switch between existing ones
5. **File Sharing**: Use the file input to upload images or files
6. **Search**: Use the search bar to find messages
7. **Reactions**: Click emoji buttons to react to messages

## 🔧 API Endpoints

### Authentication
- `POST /auth/login` - Login with username

### File Upload
- `POST /upload` - Upload files (images, documents)

### Search
- `GET /search?q=<query>` - Search messages

## 📡 Socket Events

### Client to Server
- `message:send` - Send a message
- `typing` - Indicate typing status
- `message:read` - Mark message as read
- `message:react` - React to a message
- `room:join` - Join a room
- `room:leave` - Leave a room
- `history:get` - Request message history

### Server to Client
- `message:new` - New message received
- `typing` - User typing status
- `presence:update` - Online users update
- `message:read` - Message read status
- `message:react` - Message reaction update
- `room:members` - Room members update
- `notification` - General notifications

## 🌐 Deployment

### Server Deployment
Deploy to services like Render, Railway, or Heroku:

1. Set environment variables:
   - `PORT` - Server port
   - `JWT_SECRET` - Secret key for JWT

2. Build and deploy the server

### Client Deployment
Deploy to Vercel, Netlify, or GitHub Pages:

1. Build the client:
   ```bash
   cd client
   npm run build
   ```

2. Deploy the `dist` folder

3. Update `VITE_SERVER_URL` environment variable to point to deployed server

## 📱 Responsive Design

The application is fully responsive and works on:
- Desktop computers
- Tablets
- Mobile phones

## 🔒 Security Features

- JWT-based authentication
- Input validation
- CORS configuration
- Secure file upload handling

## 🚀 Performance Optimizations

- Message pagination for large chat histories
- Efficient Socket.io room management
- Automatic reconnection handling
- Lazy loading of older messages

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 📞 Support

For questions or issues, please open an issue on GitHub.

---

Built with ❤️ using Socket.io, React, and Node.js