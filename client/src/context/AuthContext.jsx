import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { connectSocket, disconnectSocket } from '../socket/socket';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(
    () => JSON.parse(localStorage.getItem('user')) || null
  );

  const register = async (phone, name) => {
    try {
      const res = await axios.post('http://localhost:4000/auth/register', { phone, name });
      const userData = { ...res.data.user, token: res.data.token };
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      connectSocket(userData.token);
    } catch (error) {
      alert('Registration failed: ' + error.response?.data?.error);
    }
  };

  const login = async (phone) => {
    try {
      const res = await axios.post('http://localhost:4000/auth/login', { phone });
      const userData = { ...res.data.user, token: res.data.token };
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      connectSocket(userData.token);
    } catch (error) {
      alert('Login failed: ' + error.response?.data?.error);
    }
  };

  const logout = () => {
    disconnectSocket();
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (updates) => {
    const updatedUser = { ...user, ...updates };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  useEffect(() => {
    if (user) {
      connectSocket(user.token);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, register, login, logout, updateUser, token: user?.token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);