import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { connectSocket, disconnectSocket } from '../socket/socket';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(
    () => JSON.parse(localStorage.getItem('user')) || null
  );

  const login = async (username) => {
    try {
      const res = await axios.post('http://localhost:4000/auth/login', { username });
      const userData = { username: res.data.username, token: res.data.token, id: res.data.id };
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      connectSocket(userData.token);
    } catch (error) {
      alert('Login failed');
    }
  };

  const logout = () => {
    disconnectSocket();
    localStorage.removeItem('user');
    setUser(null);
  };

  useEffect(() => {
    if (user) {
      connectSocket(user.token);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, token: user?.token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);