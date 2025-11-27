// client/src/socket/socket.js
import { io } from "socket.io-client";

let socket = null;
export function connectSocket(token) {
  if (socket && socket.connected) return socket;
  socket = io(import.meta.env.VITE_SERVER_URL || "http://localhost:4000", {
    autoConnect: true,
    auth: { token: `Bearer ${token}` },
    reconnectionAttempts: 5
  });
  return socket;
}
export function getSocket() { return socket; }
export function disconnectSocket() { if (socket) socket.disconnect(); socket = null; }