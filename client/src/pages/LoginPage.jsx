// client/src/pages/LoginPage.jsx
import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage(){
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const { register, login } = useContext(AuthContext);
  const nav = useNavigate();

  async function submit(e){
    e.preventDefault();
    if (isRegister) {
      if (!phone || !name) return alert('Enter phone and name');
      await register(phone, name);
    } else {
      if (!phone) return alert('Enter phone number');
      await login(phone);
    }
    nav('/chat');
  }

  return (
    <div className="login-container">
      <form onSubmit={submit} className="login-form">
        <h3 style={{color: '#075e54', marginBottom: '24px'}}>WhatsApp Web</h3>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Enter your phone number"
          className="login-input"
          type="tel"
        />
        {isRegister && (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name"
            className="login-input"
          />
        )}
        <button type="submit" className="login-button">
          {isRegister ? 'Register' : 'Login'}
        </button>
        <button type="button" onClick={() => setIsRegister(!isRegister)} style={{background: 'none', color: '#075e54', border: 'none', cursor: 'pointer', marginTop: '8px'}}>
          {isRegister ? 'Already have an account? Login' : 'New user? Register'}
        </button>
      </form>
    </div>
  );
}