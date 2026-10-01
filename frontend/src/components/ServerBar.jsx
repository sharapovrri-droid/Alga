export default function ServerBar({ activeWorkspace, setActiveWorkspace }) {
  const workspaces = [
    { id: 'alga', name: 'Alga', isBrand: true },
    { id: 'w1', icon: <path d="M3 18v-6a9 9 0 0 1 18 0v6 M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /> },
    { id: 'w2', icon: <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4 M4 6v12a2 2 0 0 0 2 2h14v-4 M8 16h8" /> },
    { id: 'w3', icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: '16px', height: '100%' }}>
      {workspaces.map(ws => {
        const isActive = activeWorkspace === ws.id;
        return (
          <div key={ws.id} onClick={() => setActiveWorkspace(ws.id)} style={{ position: 'relative', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {isActive && <div style={{ position: 'absolute', left: '-1px', width: '4px', height: '30px', background: 'var(--accent)', borderRadius: '0 4px 4px 0', boxShadow: '1px 0 8px var(--accent-glow)' }} />}
            
            <div style={{ width: '44px', height: '44px', borderRadius: isActive ? '14px' : '22px', background: ws.isBrand ? 'var(--accent)' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: ws.isBrand ? '#03070b' : 'var(--text-muted)' }}>
              {ws.isBrand ? <span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '-0.5px' }}>{ws.name}</span> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ws.icon}</svg>}
            </div>
          </div>
        );
      })}
      <div style={{ width: '28px', height: '1px', background: 'var(--border)', margin: '4px 0' }} />
      <div style={{ width: '44px', height: '44px', borderRadius: '22px', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>
    </div>
  );
}