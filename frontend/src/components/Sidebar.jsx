import { useState } from 'react';
import { createPortal } from 'react-dom';
import { socket } from '../socket';

export default function Sidebar({ 
  currentUser, 
  currentAvatar, 
  onOpenSettings, 
  onViewStory, 
  activeRoom, 
  setActiveRoom, 
  activeVoiceRoom, 
  setActiveVoiceRoom, 
  chatList = [], 
  unreadCounts = {}, 
  clearUnread, 
  groupedStories = {}, 
  watchedStories = new Set(), 
  sortedUsers = [], 
  onlineUsers = [] 
}) {
  const [showCreateChat, setShowCreateChat] = useState(false);
  const [newChatName, setNewChatName] = useState('');

  // Генератор детерминированного ID личного диалога
  const getDmRoomId = (targetName) => {
    return `dm:${[currentUser, targetName].sort().join('--')}`;
  };

  const handleCreateChat = (e) => {
    if (e) e.preventDefault();
    const trimmed = newChatName.trim();
    if (trimmed) {
      socket.emit('create chat', { 
        name: trimmed, 
        type: 'channel|alga', 
        owner: currentUser 
      });
      setShowCreateChat(false);
      setNewChatName('');
    }
  };

  // Список собеседников (исключая самого себя)
  const otherUsers = (onlineUsers || []).filter(u => {
    const uname = typeof u === 'string' ? u : u.name;
    return uname && uname !== currentUser;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      
      {/* Профиль */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div onClick={onOpenSettings} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', overflow: 'hidden' }}>
            {currentAvatar ? <img src={currentAvatar} alt="ava" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (currentUser ? currentUser.charAt(0).toUpperCase() : 'U')}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{currentUser}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Мой профиль</div>
          </div>
        </div>
        <div onClick={() => setShowCreateChat(true)} style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'var(--bg-hover)', width: 32, height: 32, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Создать канал">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
      </div>

      {/* Список каналов и диалогов */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Истории */}
        {sortedUsers && sortedUsers.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', paddingLeft: '4px' }}>Истории</div>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
              {sortedUsers.map(user => {
                const hasUnwatched = groupedStories[user]?.some(s => !watchedStories?.has(s.id));
                return (
                  <div key={user} onClick={() => onViewStory(user)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px', border: hasUnwatched ? '2px solid var(--accent)' : '2px solid transparent' }}>
                      {user.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', maxWidth: '48px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Голосовые комнаты */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '4px' }}>Голосовые комнаты</div>
          <div onClick={() => setActiveVoiceRoom(activeVoiceRoom === 'общий' ? null : 'общий')} style={{ padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: activeVoiceRoom === 'общий' ? 'rgba(46, 189, 133, 0.1)' : 'transparent', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(46, 189, 133, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            </div>
            <div style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: activeVoiceRoom === 'общий' ? 'var(--success)' : 'var(--text-main)' }}>Лобби (Голос)</div>
          </div>
        </div>

        {/* Текстовые каналы */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '4px' }}>Текстовые каналы</div>
          <div onClick={() => { setActiveRoom('общий'); if (clearUnread) clearUnread('общий'); }} style={{ padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: activeRoom === 'общий' ? 'var(--bg-hover)' : 'transparent', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🌍</div>
            <div style={{ flex: 1, fontSize: '14px', fontWeight: 500 }}>общий</div>
            {unreadCounts['общий'] > 0 && <div style={{ background: 'var(--accent)', color: '#000', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' }}>{unreadCounts['общий']}</div>}
          </div>
          
          {chatList && chatList.filter(c => c.id !== 'общий' && !c.id.startsWith('dm:')).map(ch => {
            const unread = unreadCounts[ch.id];
            const isActive = activeRoom === ch.id;
            return (
              <div key={ch.id} onClick={() => { setActiveRoom(ch.id); if (clearUnread) clearUnread(ch.id); }} style={{ padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: isActive ? 'var(--bg-hover)' : 'transparent', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>#</div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.name}</div>
                  {ch.lastMessage && <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.lastMessage}</div>}
                </div>
                {unread > 0 && !isActive && <div style={{ background: 'var(--accent)', color: '#000', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' }}>{unread}</div>}
              </div>
            );
          })}
        </div>

        {/* Личные сообщения (DM) */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '4px' }}>
            Личные сообщения ({otherUsers.length})
          </div>

          {otherUsers.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 10px', fontStyle: 'italic' }}>
              Нет пользователей онлайн
            </div>
          ) : (
            otherUsers.map(u => {
              const targetName = typeof u === 'string' ? u : u.name;
              const targetAvatar = typeof u === 'object' ? u.avatar : null;
              const dmRoomId = getDmRoomId(targetName);
              const isActive = activeRoom === dmRoomId;
              const unread = unreadCounts[dmRoomId] || 0;

              return (
                <div 
                  key={targetName} 
                  onClick={() => { setActiveRoom(dmRoomId); if (clearUnread) clearUnread(dmRoomId); }} 
                  style={{ 
                    padding: '8px 10px', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    background: isActive ? 'var(--bg-hover)' : 'transparent', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    marginBottom: '4px' 
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px', overflow: 'hidden' }}>
                      {targetAvatar ? <img src={targetAvatar} alt="ava" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : targetName.charAt(0).toUpperCase()}
                    </div>
                    {/* Зеленая точка "В сети" */}
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: 'var(--success)', border: '2px solid var(--bg-sidebar)' }} />
                  </div>

                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{targetName}</div>
                  </div>

                  {unread > 0 && !isActive && (
                    <div style={{ background: 'var(--accent)', color: '#000', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' }}>
                      {unread}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Окно создания канала через Portal */}
      {showCreateChat && createPortal(
        <div 
          onClick={() => setShowCreateChat(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999999, backdropFilter: 'blur(6px)' }} 
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: '16px', width: '320px', border: '1px solid var(--border)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text-main)', textAlign: 'center' }}>Создать новую комнату</h3>
            <form onSubmit={handleCreateChat}>
              <input type="text" autoFocus placeholder="Название комнаты" value={newChatName} onChange={(e) => setNewChatName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: '#fff', marginBottom: '16px', outline: 'none', fontSize: '14px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setShowCreateChat(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer' }}>Отмена</button>
                <button type="submit" disabled={!newChatName.trim()} style={{ flex: 1, padding: '10px', background: 'var(--accent)', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '8px', cursor: newChatName.trim() ? 'pointer' : 'not-allowed', opacity: newChatName.trim() ? 1 : 0.6 }}>Создать</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}