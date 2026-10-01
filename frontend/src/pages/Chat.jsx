import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';

const EMOJIS = ['😀', '😂', '😍', '😎', '😢', '😡', '👍', '🔥', '❤', '🎉', '✨', '👀'];

const CustomAudioPlayer = ({ src, initialDuration, isSelf, timeStr }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(initialDuration || 0);

  const togglePlay = () => { if (isPlaying) audioRef.current.pause(); else audioRef.current.play(); setIsPlaying(!isPlaying); };
  const handleTimeUpdate = () => { if (audioRef.current.duration) setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100); };
  const handleEnded = () => { setIsPlaying(false); setProgress(0); };
  const formatTime = (secs) => `${Math.floor(secs/60)}:${Math.floor(secs%60).toString().padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: isSelf ? '#0d3b42' : '#161e27', padding: '6px 14px', borderRadius: '24px', width: '240px', border: isSelf ? '1px solid #145660' : '1px solid #1f2a36', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
      <div onClick={togglePlay} style={{ cursor: 'pointer', color: '#000', background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0 }}>
        {isPlaying ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>}
      </div>
      <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', position: 'relative' }}><div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: '2px', transition: 'width 0.1s linear' }} /></div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '35px', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}><span>{formatTime(dur)}</span><span style={{ fontSize: '9px', color: isSelf ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)' }}>{timeStr}</span></div>
      <audio ref={audioRef} src={src} onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onLoadedMetadata={(e) => { if (!dur && e.target.duration && e.target.duration !== Infinity) setDur(e.target.duration); }} style={{ display: 'none' }} />
    </div>
  );
};

export default function Chat({ currentUser, currentUserAvatar, activeRoom, activeRoomName, onlineUsers }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editMsg, setEditMsg] = useState(null);
  const [fullscreenMedia, setFullscreenMedia] = useState(null);
  
  const [activePinOffset, setActivePinOffset] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteForAll, setDeleteForAll] = useState(true);
  const [deletedLocal, setDeletedLocal] = useState(new Set());
  
  const [fileKey, setFileKey] = useState(Date.now());
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typingUsers]);
  useEffect(() => { const handleClick = () => { setContextMenu(null); setShowEmoji(false); }; window.addEventListener('click', handleClick); return () => window.removeEventListener('click', handleClick); }, []);

  useEffect(() => {
    setMessages([]); setReplyTo(null); setEditMsg(null); setActivePinOffset(0); setInputValue(''); setDeletedLocal(new Set()); setTypingUsers(new Set());
    socket.emit('get history', activeRoom); 

    const handleLoadHistory = (history) => setMessages(history || []);
    const handleChatMessage = (msg) => { if (msg && msg.room === activeRoom) setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]); };
    const handleDeleted = (id) => setMessages(prev => prev.filter(m => m.id !== id));
    const handleEdited = (data) => setMessages(prev => prev.map(m => m.id === data.id ? { ...m, text: data.text, isEdited: true } : m));
    const handleTyping = (data) => {
      if (data.room !== activeRoom || data.user === currentUser) return;
      setTypingUsers(prev => { const newSet = new Set(prev); if (data.isTyping) newSet.add(data.user); else newSet.delete(data.user); return newSet; });
    };
    const handlePinned = (id) => setMessages(prev => prev.map(m => m.id === id ? { ...m, isPinned: 1 } : m));
    const handleUnpinned = (id) => { setMessages(prev => prev.map(m => m.id === id ? { ...m, isPinned: 0 } : m)); setActivePinOffset(0); };

    socket.on('load history', handleLoadHistory);
    socket.on('chat message', handleChatMessage);
    socket.on('message deleted', handleDeleted);
    socket.on('message edited', handleEdited);
    socket.on('typing', handleTyping);
    socket.on('message pinned', handlePinned);
    socket.on('message unpinned', handleUnpinned);
    
    return () => { 
      socket.off('load history', handleLoadHistory); socket.off('chat message', handleChatMessage);
      socket.off('message deleted', handleDeleted); socket.off('message edited', handleEdited);
      socket.off('typing', handleTyping); socket.off('message pinned', handlePinned); socket.off('message unpinned', handleUnpinned);
    };
  }, [activeRoom, currentUser]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    socket.emit('typing', { room: activeRoom, user: currentUser, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { socket.emit('typing', { room: activeRoom, user: currentUser, isTyping: false }); }, 2000);
  };

  const sendMessage = (fileData = null, fileName = null, duration = null) => {
    if (!inputValue.trim() && !fileData) return;
    socket.emit('typing', { room: activeRoom, user: currentUser, isTyping: false });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (editMsg) {
      socket.emit('edit message', { id: editMsg.id, newText: inputValue.trim() });
      setEditMsg(null);
    } else {
      socket.emit('chat message', { 
        id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 9), room: activeRoom, user: currentUser, userAvatar: currentUserAvatar, 
        text: inputValue.trim() || (fileData && !fileName?.endsWith('.webm') ? 'Файл' : ''), fileData, fileName, duration,
        replyToId: replyTo ? replyTo.id : null, replyToUser: replyTo ? replyTo.user : null, replyToText: replyTo ? replyTo.text : null, timestamp: Date.now() 
      });
      setReplyTo(null);
    }
    setInputValue('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        const finalDuration = recordTime; 
        reader.onloadend = () => sendMessage(reader.result, 'Голосовое_сообщение.webm', finalDuration);
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordTime(0);
      recordTimerRef.current = setInterval(() => setRecordTime(prev => prev + 1), 1000);
    } catch (err) { alert('Нет доступа к микрофону.'); }
  };

  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); clearInterval(recordTimerRef.current); } };
  const executeDelete = () => { if (deleteModal.user === currentUser && deleteForAll) socket.emit('delete message', deleteModal.id); else setDeletedLocal(prev => new Set(prev).add(deleteModal.id)); setDeleteModal(null); };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) { const reader = new FileReader(); reader.onload = (event) => sendMessage(event.target.result, file.name); reader.readAsDataURL(file); }
    setFileKey(Date.now());
  };

  const addEmoji = (emoji, e) => { e.stopPropagation(); setInputValue(prev => prev + emoji); setShowEmoji(false); inputRef.current?.focus(); socket.emit('typing', { room: activeRoom, user: currentUser, isTyping: true }); };

  const handleContextMenu = (e, msg) => { 
    e.preventDefault(); const selection = window.getSelection().toString(); 
    const menuWidth = 260; const menuHeight = 360; let x = e.clientX; let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 20;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 20;
    setContextMenu({ x, y, msg, selection }); 
  };

  const scrollToMessage = (msgId) => { const el = document.getElementById(`msg-${msgId}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlightedMsgId(msgId); setTimeout(() => setHighlightedMsgId(null), 2500); } };
  const handlePinClick = () => { if (!currentPin) return; scrollToMessage(currentPin.id); if (allPinned.length > 1) { setActivePinOffset(prev => (prev + 1) % allPinned.length); } };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatRecordTime = (secs) => `${Math.floor(secs/60)}:${(secs%60).toString().padStart(2, '0')}`;

  const I_Reply = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>;
  const I_Edit = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
  const I_Pin = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.87l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>;
  const I_Unpin = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.87l-1.78.9A2 2 0 0 0 5 15.24Z"/><line x1="2" y1="2" x2="22" y2="22" stroke="var(--danger)"/></svg>;
  const I_Trash = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
  const I_CopyText = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;

  const MenuItem = ({ icon, text, danger, onClick }) => (
    <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 14px', cursor: 'pointer', borderRadius: '6px', color: danger ? 'var(--danger)' : 'var(--text-main)', fontSize: '13.5px', fontWeight: 500, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(255, 75, 75, 0.1)' : 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{icon} <span>{text}</span></div>
  );

  let lastDateStr = null;
  const allPinned = messages.filter(m => m.isPinned && !deletedLocal.has(m.id));
  const currentPin = allPinned.length > 0 ? allPinned[allPinned.length - 1 - activePinOffset] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ height: '64px', padding: '0 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
          <div>
            <div style={{ fontSize: '14.5px', fontWeight: 600 }}>{activeRoomName}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>В сети: {(onlineUsers || []).length}</div>
          </div>
        </div>
      </div>

      {currentPin && (
        <div style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'background 0.2s' }} onClick={handlePinClick} onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background='var(--bg-input)'}>
          <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I_Pin /></div>
          <div style={{ flex: 1, borderLeft: '2px solid var(--accent)', paddingLeft: '8px' }}>
             <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>Закреплено {allPinned.length > 1 && <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '10px', color: 'var(--text-main)' }}>{allPinned.length - activePinOffset} из {allPinned.length}</span>}</div>
             <div style={{ fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>{currentPin.text || currentPin.fileName}</div>
          </div>
          <div onClick={(e) => { e.stopPropagation(); socket.emit('unpin message', currentPin.id); }} style={{ color: 'var(--text-muted)', padding: '4px', cursor: 'pointer' }}>✕</div>
        </div>
      )}

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.filter(m => !deletedLocal.has(m.id)).length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '13.5px' }}>Нет сообщений. Напишите первыми!</div>}
        
        {messages.filter(m => !deletedLocal.has(m.id)).map((msg, index) => {
          const isSelf = msg.user === currentUser;
          const safeTimestamp = msg.timestamp ? Number(msg.timestamp) : Date.now();
          const msgDate = new Date(safeTimestamp).toLocaleDateString([], { day: 'numeric', month: 'long' });
          const showDate = msgDate !== lastDateStr;
          lastDateStr = msgDate;

          const isAudio = msg.fileData?.startsWith('data:audio');
          const isImage = msg.fileData?.startsWith('data:image');
          const isVoiceOnly = isAudio && (!msg.text || msg.text === 'Файл');

          return (
            <div key={msg.id || index} style={{ display: 'flex', flexDirection: 'column' }}>
              {showDate && <div style={{ alignSelf: 'center', background: 'rgba(0,0,0,0.4)', padding: '4px 12px', borderRadius: '12px', fontSize: '11px', color: 'var(--text-muted)', margin: '16px 0' }}>{msgDate}</div>}
              
              <div id={`msg-${msg.id}`} className={highlightedMsgId === msg.id ? 'highlighted-message' : ''} onContextMenu={(e) => handleContextMenu(e, msg)} style={{ display: 'flex', gap: '12px', alignSelf: isSelf ? 'flex-end' : 'flex-start', flexDirection: isSelf ? 'row-reverse' : 'row', maxWidth: '75%' }}>
                
                {!isSelf && (
                  <div style={{ position: 'relative', alignSelf: 'flex-end', flexShrink: 0, width: 36, height: 36 }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--bg-hover)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--accent)' }}>
                       {msg.userAvatar ? <img src={msg.userAvatar} alt="ava" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : msg.user.charAt(0).toUpperCase()}
                    </div>
                    {(onlineUsers || []).includes(msg.user) && <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, background: 'var(--success)', borderRadius: '50%', border: '2px solid var(--bg-app)', zIndex: 2 }} />}
                  </div>
                )}

                <div style={isVoiceOnly ? { display: 'flex', flexDirection: 'column', gap: '4px' } : { background: isSelf ? '#0d3b42' : '#161e27', border: isSelf ? '1px solid #145660' : '1px solid #1f2a36', borderRadius: '14px', borderBottomRightRadius: isSelf ? '4px' : '14px', borderBottomLeftRadius: isSelf ? '14px' : '4px', padding: '6px 12px', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transition: 'background-color 0.3s' }}>
                  
                  {!isSelf && !isVoiceOnly && <div style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--accent)', marginBottom: '4px' }}>{msg.user}</div>}
                  {!isSelf && isVoiceOnly && <div style={{ fontWeight: 600, fontSize: '11px', color: 'var(--accent)', paddingLeft: '12px', marginBottom: '-2px' }}>{msg.user}</div>}
                  
                  {msg.replyToUser && !isVoiceOnly && (
                    <div onClick={() => scrollToMessage(msg.replyToId)} style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '8px', marginBottom: '6px', background: 'rgba(0,0,0,0.1)', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer' }}>
                      <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>{msg.replyToUser}</div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '250px' }}>{msg.replyToText}</div>
                    </div>
                  )}

                  {!isVoiceOnly && (
                    <div style={{ fontSize: '14px', lineHeight: '1.45', color: 'var(--text-main)', wordBreak: 'break-word', userSelect: 'text' }}>
                      {msg.text !== 'Файл' && msg.text !== '' ? msg.text : ''}
                      
                      {msg.fileData && (
                        <div style={{ marginTop: msg.text !== 'Файл' ? 8 : 0 }}>
                          {isImage ? (
                             <img src={msg.fileData} alt={msg.fileName} onClick={() => setFullscreenMedia(msg.fileData)} style={{ maxWidth: '100%', borderRadius: 8, maxHeight: '250px', objectFit: 'cover', cursor: 'pointer' }} /> 
                          ) : (
                             <a href={msg.fileData} download={msg.fileName} style={{ display: 'inline-block', padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 8, color: 'var(--text-main)', textDecoration: 'none', fontSize: '12px', border: '1px solid var(--border)' }}>📎 {msg.fileName}</a>
                          )}
                        </div>
                      )}
                      
                      <span style={{ float: 'right', fontSize: '10px', color: isSelf ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', marginLeft: '12px', marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                        {msg.isEdited && <span>изменено</span>}
                        {formatTime(safeTimestamp)}
                      </span>
                    </div>
                  )}

                  {isVoiceOnly && (
                    <CustomAudioPlayer src={msg.fileData} initialDuration={msg.duration} isSelf={isSelf} timeStr={formatTime(safeTimestamp)} />
                  )}

                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '0 24px', height: '20px', display: 'flex', alignItems: 'center', opacity: typingUsers.size > 0 ? 1 : 0, transition: 'opacity 0.2s', color: 'var(--accent)', fontSize: '12px', fontStyle: 'italic', marginBottom: '8px' }}>
        {typingUsers.size > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>{Array.from(typingUsers).join(', ')} печатает...</div>}
      </div>

      {(replyTo || editMsg) && (
        <div style={{ padding: '10px 24px', background: 'var(--bg-input)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '10px' }}>
            <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 'bold' }}>{editMsg ? 'Редактирование' : `Ответ для ${replyTo.user}`}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{editMsg ? editMsg.text : replyTo.text}</div>
          </div>
          <button onClick={() => { setReplyTo(null); setEditMsg(null); setInputValue(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
      )}
         
          {isRecording ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--danger)', fontWeight: 500, fontSize: '14px' }}>
               <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s infinite' }} />
               Запись... {formatRecordTime(recordTime)}
            </div>
          ) : (
            <>
              <div onClick={() => fileInputRef.current?.click()} style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}>+</div>
              <input key={fileKey} type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
              <input ref={inputRef} type="text" placeholder="Написать сообщение..." value={inputValue} onChange={handleInputChange} onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', fontSize: '14px' }} />
            </>
          )} 
          <div style={{ display: 'flex', gap: '14px', color: 'var(--text-muted)', alignItems: 'center' }}>
            {!isRecording && <svg onClick={(e) => { e.stopPropagation(); setShowEmoji(!showEmoji); }} style={{ cursor: 'pointer', color: '#ffca28' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>}
            
            {showEmoji && (
              <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: '50px', right: '40px', background: '#10151c', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', width: '200px', boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
                {EMOJIS.map(emoji => <span key={emoji} onClick={(e) => addEmoji(emoji, e)} style={{ cursor: 'pointer', fontSize: '18px', padding: '4px' }}>{emoji}</span>)}
              </div>
            )}
            
            {inputValue.trim() || editMsg ? (
              <svg onClick={() => sendMessage()} style={{ cursor: 'pointer', color: 'var(--accent)' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            ) : isRecording ? (
              <div onClick={stopRecording} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"/></svg></div>
            ) : (
              <svg onClick={startRecording} style={{ cursor: 'pointer', transition: 'color 0.2s', color: 'var(--text-muted)' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            )}
          </div>
        
      {fullscreenMedia && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120000, backdropFilter: 'blur(10px)' }} onClick={() => setFullscreenMedia(null)}>
          <div style={{ position: 'absolute', top: 20, right: 30, color: 'white', fontSize: 30, cursor: 'pointer' }}>✕</div>
          <img src={fullscreenMedia} alt="Fullscreen" style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()} />
        </div>
  )}

      {contextMenu && (
        <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#10151c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', width: '250px', zIndex: 200000, padding: '6px', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }} onClick={(e) => e.stopPropagation()}>
          <MenuItem icon={<I_Reply />} text="Ответить" onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); inputRef.current?.focus(); }} />
          {contextMenu.msg.user === currentUser && <MenuItem icon={<I_Edit />} text="Изменить" onClick={() => { setEditMsg(contextMenu.msg); setInputValue(contextMenu.msg.text); setContextMenu(null); inputRef.current?.focus(); }} />}
          {contextMenu.msg.isPinned ? <MenuItem icon={<I_Unpin />} text="Открепить" danger onClick={() => { socket.emit('unpin message', contextMenu.msg.id); setContextMenu(null); }} /> : <MenuItem icon={<I_Pin />} text="Закрепить" onClick={() => { socket.emit('pin message', contextMenu.msg.id); setContextMenu(null); }} />}
          <MenuItem icon={<I_CopyText />} text={contextMenu.selection ? "Копировать выделенное" : "Копировать текст"} onClick={() => { navigator.clipboard.writeText(contextMenu.selection || contextMenu.msg.text); setContextMenu(null); }} />
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
          <MenuItem icon={<I_Trash />} text="Удалить" danger onClick={() => { setDeleteModal(contextMenu.msg); setContextMenu(null); }} />
        </div>
      )}

      {deleteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210000, backdropFilter: 'blur(4px)' }} onClick={() => setDeleteModal(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '24px', borderRadius: '16px', width: '320px', backdropFilter: 'blur(20px)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-main)', fontSize: '16px', textAlign: 'center' }}>Удалить сообщение?</h3>
            {deleteModal.user === currentUser ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', marginBottom: '24px' }}><input type="checkbox" checked={deleteForAll} onChange={(e) => setDeleteForAll(e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> Удалить для всех участников</label>
            ) : <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px', textAlign: 'center' }}>Будет удалено только для вас.</div>}
            <div style={{ display: 'flex', gap: '10px' }}><button onClick={() => setDeleteModal(null)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '8px' }}>Отмена</button><button onClick={executeDelete} style={{ flex: 1, padding: '10px', background: 'rgba(255, 75, 75, 0.2)', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '8px', fontWeight: 600 }}>Удалить</button></div>
        </div>
        </div>
      )}
    </div>
  );
}