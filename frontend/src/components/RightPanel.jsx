import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';

export default function RightPanel({ currentUser, currentAvatar, activeChatData, onDisconnect }) {
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [micActive, setMicActive] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  const [headphonesMuted, setHeadphonesMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showParticipants, setShowParticipants] = useState(true);

  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafId = useRef(null);
  
  const speakingRef = useRef(false);
  const lastSpokenTime = useRef(0);
  const peersRef = useRef({});
  const mutedStateRef = useRef({ mic: true, deaf: false });

  useEffect(() => {
    if (activeChatData?.id) {
      socket.emit('join voice', activeChatData.id);
      const handleVoiceUsers = (data) => { if (data.room === activeChatData.id) setVoiceUsers(data.users); };
      
      const handleWebRTC = async (data) => {
        if (data.room !== activeChatData.id || data.targetUser !== currentUser) return;
        let pc = peersRef.current[data.senderUser];
        
        if (data.type === 'offer') {
          if (!pc) pc = createPeerConnection(data.senderUser, streamRef.current);
          await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc signal', { room: activeChatData.id, targetUser: data.senderUser, senderUser: currentUser, type: 'answer', payload: answer });
        } 
        else if (data.type === 'answer') {
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
        } 
        else if (data.type === 'ice') {
          if (pc && data.payload) await pc.addIceCandidate(new RTCIceCandidate(data.payload));
        }
      };

      socket.on('voice room users', handleVoiceUsers);
      socket.on('webrtc signal', handleWebRTC);
      
      return () => { 
        socket.emit('leave voice'); 
        socket.off('voice room users', handleVoiceUsers); 
        socket.off('webrtc signal', handleWebRTC);
        stopAudio(); 
        Object.values(peersRef.current).forEach(pc => pc.close());
        peersRef.current = {};
      };
    }
  }, [activeChatData?.id, currentUser]);

  useEffect(() => {
    const currentUsers = new Set(voiceUsers.map(u => u.user));
    Object.keys(peersRef.current).forEach(peerUser => {
      if (!currentUsers.has(peerUser)) {
        peersRef.current[peerUser].close();
        delete peersRef.current[peerUser];
      }
    });

    if (micActive && !micMuted && streamRef.current) {
      voiceUsers.forEach(async (u) => {
        if (u.user !== currentUser && !peersRef.current[u.user]) {
          const pc = createPeerConnection(u.user, streamRef.current);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc signal', { room: activeChatData?.id, targetUser: u.user, senderUser: currentUser, type: 'offer', payload: offer });
        }
      });
    }
  }, [voiceUsers, micActive, micMuted, currentUser, activeChatData?.id]);

  useEffect(() => {
    if (activeChatData?.id) {
      socket.emit('voice update', { room: activeChatData.id, user: currentUser, micMuted, headphonesMuted, isSpeaking });
    }
  }, [micMuted, headphonesMuted, isSpeaking, activeChatData?.id, currentUser]);

  const createPeerConnection = (targetUser, stream) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    if (stream) stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc signal', { room: activeChatData.id, targetUser, senderUser: currentUser, type: 'ice', payload: e.candidate });
    };
    pc.ontrack = (e) => {
      const audioEl = document.getElementById(`audio-${targetUser}`);
      if (audioEl) audioEl.srcObject = e.streams[0];
    };
    peersRef.current[targetUser] = pc;
    return pc;
  };

  const checkAudioLevel = () => {
    if (!analyserRef.current || mutedStateRef.current.mic || mutedStateRef.current.deaf) { 
      if (speakingRef.current) { speakingRef.current = false; setIsSpeaking(false); }
      rafId.current = setTimeout(checkAudioLevel, 100);
      return; 
    }
    
    const dataArray = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(dataArray);
    
    let maxDeviation = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const deviation = Math.abs(dataArray[i] - 128);
      if (deviation > 6) maxDeviation = deviation;
    }
    
    const now = Date.now();
    if (maxDeviation > 6) {
      lastSpokenTime.current = now;
      if (!speakingRef.current) {
        speakingRef.current = true;
        setIsSpeaking(true);
      }
    } else {
      if (speakingRef.current && now - lastSpokenTime.current > 400) {
        speakingRef.current = false;
        setIsSpeaking(false);
      }
    }
    rafId.current = setTimeout(checkAudioLevel, 100);
  };

  const toggleMic = async () => {
    if (headphonesMuted) return; 

    if (micActive && !micMuted) {
      streamRef.current?.getAudioTracks().forEach(t => t.enabled = false);
      setMicMuted(true);
      mutedStateRef.current.mic = true;
      setIsSpeaking(false);
    } else if (micActive && micMuted) {
      streamRef.current?.getAudioTracks().forEach(t => t.enabled = true);
      setMicMuted(false);
      mutedStateRef.current.mic = false;
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setMicActive(true);
        setMicMuted(false);
        mutedStateRef.current.mic = false;
        
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await audioCtx.resume();
        audioCtxRef.current = audioCtx;
        
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        
        checkAudioLevel();
      } catch (err) { alert('Нет доступа к микрофону.'); }
    }
  };

  const toggleHeadphones = () => {
    if (headphonesMuted) {
      setHeadphonesMuted(false);
      mutedStateRef.current.deaf = false;
      voiceUsers.forEach(u => { const audioEl = document.getElementById(`audio-${u.user}`); if (audioEl) audioEl.muted = false; });
    } else {
      setHeadphonesMuted(true);
      mutedStateRef.current.deaf = true;
      voiceUsers.forEach(u => { const audioEl = document.getElementById(`audio-${u.user}`); if (audioEl) audioEl.muted = true; });
      if (!micMuted) {
        streamRef.current?.getAudioTracks().forEach(t => t.enabled = false);
        setMicMuted(true);
        mutedStateRef.current.mic = true;
        setIsSpeaking(false);
      }
    }
  };

  const stopAudio = () => { streamRef.current?.getTracks().forEach(t => t.stop()); audioCtxRef.current?.close(); clearTimeout(rafId.current); };
  const handleDisconnect = () => { stopAudio(); onDisconnect(); };

  const IconMicOn = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
  const IconMicOff = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/></svg>;
  const IconHeadphonesOn = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>;
  const IconHeadphonesOff = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {voiceUsers.map(u => ( u.user !== currentUser && <audio key={`audio-${u.user}`} id={`audio-${u.user}`} autoPlay playsInline style={{ display: 'none' }} /> ))}

      <div style={{ height: '64px', padding: '0 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success)' }}>Голосовая связь</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{activeChatData?.name}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {voiceUsers.slice(0, 4).map((u, i) => {
          const isMe = u.user === currentUser;
          const uDeaf = isMe ? headphonesMuted : (u.headphonesMuted || false);
          const uMicMuted = uDeaf ? true : (isMe ? micMuted : (u.micMuted !== undefined ? u.micMuted : true));
          const uSpeaking = isMe ? isSpeaking : (u.isSpeaking || false);
          
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div className={uSpeaking ? 'avatar-glow' : ''} style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-hover)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'var(--accent)', transition: 'all 0.15s ease' }}>
                 {(isMe && currentAvatar) ? <img src={currentAvatar} alt="ava" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}}/> : u.user.charAt(0).toUpperCase()}
              </div>
              <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <span style={{ color: uMicMuted ? 'var(--danger)' : 'var(--text-main)' }}>{uMicMuted ? <IconMicOff /> : <IconMicOn />}</span>
                  <span style={{ color: uDeaf ? 'var(--danger)' : 'var(--text-main)' }}>{uDeaf ? <IconHeadphonesOff /> : <IconHeadphonesOn />}</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-main)', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.user}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '16px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center' }}>
           <div onClick={toggleMic} style={{ width: 42, height: 42, borderRadius: '50%', background: (!micMuted && !headphonesMuted) ? 'var(--bg-hover)' : 'rgba(255,255,255,0.05)', border: (!micMuted && !headphonesMuted) ? '1px solid var(--text-main)' : '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: (!micMuted && !headphonesMuted) ? 'var(--text-main)' : 'var(--danger)', marginBottom: 6, cursor: headphonesMuted ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: headphonesMuted ? 0.5 : 1 }}>
             {(!micMuted && !headphonesMuted) ? <IconMicOn /> : <IconMicOff />}
           </div>
        </div>
        <div style={{ textAlign: 'center' }}>
           <div onClick={toggleHeadphones} style={{ width: 42, height: 42, borderRadius: '50%', background: !headphonesMuted ? 'var(--bg-hover)' : 'rgba(255,255,255,0.05)', border: !headphonesMuted ? '1px solid var(--text-main)' : '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: !headphonesMuted ? 'var(--text-main)' : 'var(--danger)', marginBottom: 6, cursor: 'pointer', transition: 'all 0.2s' }}>
             {!headphonesMuted ? <IconHeadphonesOn /> : <IconHeadphonesOff />}
           </div>
        </div>
        <div style={{ textAlign: 'center' }}>
           <div onClick={handleDisconnect} style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', marginBottom: 6, cursor: 'pointer', boxShadow: '0 4px 12px rgba(229, 83, 83, 0.3)' }}>
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)"/></svg>
           </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div onClick={() => setShowParticipants(!showParticipants)} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-hover)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Участники — {voiceUsers.length}</span>
          <svg style={{ transform: showParticipants ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        
        {showParticipants && (
          <div style={{ padding: '8px 16px', overflowY: 'auto', flex: 1 }}>
            {voiceUsers.map((u, i) => {
              const isMe = u.user === currentUser;
              const uDeaf = isMe ? headphonesMuted : (u.headphonesMuted || false);
              const uMicMuted = uDeaf ? true : (isMe ? micMuted : (u.micMuted !== undefined ? u.micMuted : true));
              const uSpeaking = isMe ? isSpeaking : (u.isSpeaking || false);
              
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', position: 'relative' }}>
                  <div className={uSpeaking ? 'avatar-glow' : ''} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', overflow: 'hidden', transition: 'all 0.2s' }}>
                    {(isMe && currentAvatar) ? <img src={currentAvatar} alt="a" style={{width:'100%', height:'100%', objectFit:'cover'}}/> : u.user.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{u.user} {isMe && '(Вы)'}</div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ color: uMicMuted ? 'var(--danger)' : 'var(--text-muted)' }}>{uMicMuted ? <IconMicOff /> : <IconMicOn />}</span>
                    <span style={{ color: uDeaf ? 'var(--danger)' : 'var(--text-muted)' }}>{uDeaf ? <IconHeadphonesOff /> : <IconHeadphonesOn />}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}