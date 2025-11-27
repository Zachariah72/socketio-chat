// client/src/pages/LoginPage.jsx
import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage(){
  const [name, setName] = useState('');
  const { login } = useContext(AuthContext);
  const nav = useNavigate();

  async function submit(e){
    e.preventDefault();
    if (!name) return alert('enter username');
    await login(name);
    nav('/chat');
  }

  return (
    <div className="login-container">
      <form onSubmit={submit} className="login-form">
        <h3 style={{color: '#075e54', marginBottom: '24px'}}>WhatsApp Web</h3>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Enter your name"
          className="login-input"
        />
        <button type="submit" className="login-button">
          Start Chatting
        </button>
      </form>
    </div>
  );
}