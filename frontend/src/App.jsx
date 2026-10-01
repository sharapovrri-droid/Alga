import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';
import ServerBar from './components/ServerBar';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import Chat from './pages/Chat';
import Login from './pages/Login';
import { socket } from './socket';

export default function App() {
  const [username, setUsername] = useState(localStorage.getItem('chatUsername') || '');
  const [userAvatar, setUserAvatar] = useState(localStorage.getItem('chatAvatar') || '');
  const [activeRoom, setActiveRoom] = useState('общий');
  const [activeVoiceRoom, setActiveVoiceRoom] = useState(null); 
  const [chatList, setChatList] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [activeWorkspace, setActiveWorkspace] = useState('alga');
  const [stories, setStories] = useState([]);
  const [watchedStories, setWatchedStories] = useState(new Set());
  const [onlineUsers, setOnlineUsers] = useState([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [activeStoryUser, setActiveStoryUser] = useState(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);

  const activeRoomRef = useRef(activeRoom);
  const avatarInputRef = useRef(null);
  
  useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);
  useEffect(() => { if (isSettingsOpen) { setEditName(username); setEditAvatar(userAvatar); } }, [isSettingsOpen, username, userAvatar]);

  useEffect(() => {
    if (!username) return;

    // Синхронизация присутствия при загрузке и переподключении сокета
    const syncUser = () => {
      socket.emit('user joined', { name: username, avatar: userAvatar });
    };

    if (socket.connected) {
      syncUser();
    }
    socket.on('connect', syncUser);

    socket.on('online users', (users) => setOnlineUsers(users));
    socket.on('load custom chats', (chats) => {
      const formatted = (chats || []).map(c => ({ ...c, updatedAt: Date.now() - 100000 }));
      setChatList([{ id: 'общий', name: 'общий', type: 'channel|alga', updatedAt: Date.now() }, ...formatted]);
    });
    socket.on('chat created', (newChat) => {
      if (!newChat) return;
      setChatList(prev => prev.some(c => c.id === newChat.id) ? prev : [...prev, { ...newChat, updatedAt: Date.now(), lastMessage: '' }]);
    });
    socket.on('chat message', (msg) => {
      if (!msg) return;
      setChatList(prev => prev.map(chat => (chat.id === msg.room || chat.name === msg.room) ? { ...chat, lastMessage: msg.text, updatedAt: Date.now(), lastMessageUser: msg.user } : chat));
      if (msg.room !== activeRoomRef.current) setUnreadCounts(prev => ({ ...prev, [msg.room]: (prev[msg.room] || 0) + 1 }));
    });
    socket.on('update stories', (data) => setStories(data));
    
    return () => {
      socket.off('connect', syncUser);
      socket.off('online users'); 
      socket.off('load custom chats'); 
      socket.off('chat created'); 
      socket.off('chat message'); 
      socket.off('update stories');
    };
  }, [username, userAvatar]);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) { const reader = new FileReader(); reader.onload = (event) => setEditAvatar(event.target.result); reader.readAsDataURL(file); }
  };

  const saveSettings = () => {
    if (editName.trim()) {
      setUsername(editName.trim()); setUserAvatar(editAvatar);
      localStorage.setItem('chatUsername', editName.trim()); localStorage.setItem('chatAvatar', editAvatar);
      setIsSettingsOpen(false);
    }
  };

  const groupedStories = stories.reduce((acc, story) => {
    if (!acc[story.user]) acc[story.user] = [];
    acc[story.user].push(story);
    return acc;
  }, {});
  
  const sortedUsers = Object.keys(groupedStories).sort((a, b) => {
    const aHasUnwatched = groupedStories[a].some(s => !watchedStories.has(s.id));
    const bHasUnwatched = groupedStories[b].some(s => !watchedStories.has(s.id));
    if (aHasUnwatched === bHasUnwatched) return 0;
    return aHasUnwatched ? -1 : 1;
  });

  const handleNextStory = (e) => {
    if (e) e.stopPropagation();
    const userStories = groupedStories[activeStoryUser];
    const currentStory = userStories[activeStoryIndex];
    setWatchedStories(prev => new Set(prev).add(currentStory.id));

    if (activeStoryIndex < userStories.length - 1) setActiveStoryIndex(prev => prev + 1);
    else {
      const currentUserIdx = sortedUsers.indexOf(activeStoryUser);
      const nextUser = sortedUsers.slice(currentUserIdx + 1).find(u => groupedStories[u].some(s => !watchedStories.has(s.id) && s.id !== currentStory.id));
      if (nextUser) { setActiveStoryUser(nextUser); setActiveStoryIndex(0); } else { setActiveStoryUser(null); }
    }
  };
  const handlePrevStory = (e) => { if (e) e.stopPropagation(); if (activeStoryIndex > 0) setActiveStoryIndex(prev => prev - 1); };

  if (!username) return <Login onLogin={(name) => { setUsername(name); setUserAvatar(localStorage.getItem('chatAvatar') || ''); }} />;

  // Вычисление названия диалога (для каналов — их имя, для DM — имя собеседника)
let displayChatName = activeRoom;
if (activeRoom.startsWith('dm:')) {
  const parts = activeRoom.replace('dm:', '').split('--');
  displayChatName = parts.find(p => p !== username) || 'Личный чат';
} else {
  const found = chatList.find(c => c.id === activeRoom || c.name === activeRoom);
  if (found) displayChatName = found.name;
}

const activeChatData = chatList.find(c => c.id === activeRoom) || { name: displayChatName, type: activeRoom.startsWith('dm:') ? 'dm' : 'channel' };
  const voiceRoomData = chatList.find(c => c.id === activeVoiceRoom);

  return (
    <Router>
      <div className="app-layout">
        <div className="col-server"><ServerBar activeWorkspace={activeWorkspace} setActiveWorkspace={setActiveWorkspace} /></div>
        <div className="col-sidebar">
          <Sidebar 
            currentUser={username} currentAvatar={userAvatar} onOpenSettings={() => setIsSettingsOpen(true)} onViewStory={(user) => { setActiveStoryUser(user); setActiveStoryIndex(0); }}
            activeRoom={activeRoom} setActiveRoom={setActiveRoom} activeVoiceRoom={activeVoiceRoom} setActiveVoiceRoom={setActiveVoiceRoom}
            chatList={chatList} unreadCounts={unreadCounts} clearUnread={(id) => setUnreadCounts(prev => ({ ...prev, [id]: 0 }))}
            groupedStories={groupedStories} watchedStories={watchedStories} sortedUsers={sortedUsers} onlineUsers={onlineUsers}
          />
        </div>
        <div className="col-chat">
          <Routes>
            <Route path="/" element={<Chat currentUser={username} currentUserAvatar={userAvatar} activeRoom={activeRoom} activeRoomName={activeChatData.name} onlineUsers={onlineUsers} />} />
          </Routes>
        </div>
        <div className={`col-right ${activeVoiceRoom ? 'visible' : 'hidden'}`}>
           {activeVoiceRoom && <RightPanel currentUser={username} currentAvatar={userAvatar} activeChatData={voiceRoomData} onDisconnect={() => setActiveVoiceRoom(null)} />}
        </div>
      </div>

      {isSettingsOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999, backdropFilter: 'blur(8px)' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '30px 24px', borderRadius: '20px', width: '320px', backdropFilter: 'blur(30px)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-main)', fontSize: '18px', textAlign: 'center' }}>Настройки профиля</h3>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 'bold', marginBottom: '12px', overflow: 'hidden', color: 'var(--accent)', border: '2px solid var(--border)' }}>
                {editAvatar ? <img src={editAvatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : editName.charAt(0).toUpperCase()}
              </div>
              <label style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: '13px', background: 'var(--accent-transparent)', padding: '6px 12px', borderRadius: '20px' }}>Изменить фото<input type="file" accept="image/*" style={{ display: 'none' }} ref={avatarInputRef} onChange={handleAvatarChange} /></label>
            </div>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-main)', marginBottom: '24px', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '10px' }}><button onClick={() => setIsSettingsOpen(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '10px', cursor: 'pointer' }}>Отмена</button><button onClick={saveSettings} disabled={!editName.trim()} style={{ flex: 1, padding: '10px', background: 'var(--accent)', color: '#000', borderRadius: '10px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>Сохранить</button></div>
          </div>
        </div>
      )}

      {activeStoryUser && groupedStories[activeStoryUser] && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999 }}>
          <div style={{ position: 'absolute', top: '20px', right: '30px', color: 'white', fontSize: '32px', cursor: 'pointer', opacity: 0.7, padding: '10px' }} onClick={() => setActiveStoryUser(null)}>✕</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'absolute', top: '30px', left: '30px' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#000' }}>{activeStoryUser.charAt(0).toUpperCase()}</div>
            <div style={{ color: 'white', fontWeight: 600, fontSize: '16px' }}>{activeStoryUser}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginLeft: '10px' }}>{activeStoryIndex + 1} / {groupedStories[activeStoryUser].length}</div>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
             {activeStoryIndex > 0 && <div onClick={handlePrevStory} style={{ position: 'absolute', left: '-60px', width: '40px', height: '40px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', zIndex: 10 }}>❮</div>}
             <img src={groupedStories[activeStoryUser][activeStoryIndex].image} alt="Story" style={{ maxHeight: '85vh', maxWidth: '90vw', borderRadius: '16px', objectFit: 'contain' }} />
             <div onClick={handleNextStory} style={{ position: 'absolute', right: '-60px', width: '40px', height: '40px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', zIndex: 10 }}>❯</div>
          </div>
        </div>
      )}
    </Router>
  );
}