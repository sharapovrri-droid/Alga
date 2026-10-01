import { useState } from 'react';

export default function Login({ onLogin }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      localStorage.setItem('chatUsername', name.trim());
      onLogin(name.trim());
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: 'var(--bg-main)' }}>
      <div style={{ background: 'var(--bg-panel)', padding: 30, borderRadius: 12, width: 320, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
        <h2 style={{ marginBottom: 20, fontWeight: 500, textAlign: 'center' }}>Вход в Alga</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input 
            type="text" 
            placeholder="Ваше имя..." 
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'white', outline: 'none', fontSize: '15px' }}
            autoFocus
          />
          <button type="submit" style={{ padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 500, cursor: 'pointer', fontSize: '15px' }}>
            Продолжить
          </button>
        </form>
      </div>
    </div>
  );
}