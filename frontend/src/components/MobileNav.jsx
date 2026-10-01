export default function MobileNav() {
  const tabs = [
    { icon: '🏠', label: 'Главная', active: true },
    { icon: '🔔', label: 'Уведомления' },
    { icon: '⊕', label: 'Создать', isAction: true },
    { icon: '💬', label: 'Чаты' },
    { icon: '👤', label: 'Профиль' },
  ];

  return (
    <div className="mobile-nav">
      {tabs.map((tab, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', color: tab.active ? 'var(--accent)' : 'var(--text-muted)' }}>
          {tab.isAction ? (
            <div style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '2px' }}>
              +
            </div>
          ) : (
            <>
              <div style={{ fontSize: '24px' }}>{tab.icon}</div>
              <div style={{ fontSize: '10px', fontWeight: 500 }}>{tab.label}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}