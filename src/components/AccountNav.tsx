'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
export default function AccountNav() {
  const { data, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  if (isPending) return <span className="account-loading">加载中…</span>;
  if (!data) return <Link className="account-login" href="/login">登录 / 注册 <span aria-hidden="true">↗</span></Link>;
  const name = data.user.name || data.user.email;
  return <div ref={root} className="account-menu">
    <button ref={trigger} className="account-avatar" aria-label="账号菜单" aria-expanded={open} aria-controls="account-dropdown" onClick={() => setOpen(!open)}>{name.slice(0, 1).toUpperCase()}</button>
    {open && <div id="account-dropdown" className="account-dropdown">
      <div className="account-info"><b>{name}</b><small>{data.user.email}</small></div>
      <Link href="/account" onClick={() => setOpen(false)}><span aria-hidden="true">◎</span>个人中心</Link>
      <Link href="/account#redeem" onClick={() => setOpen(false)}><span aria-hidden="true">◇</span>兑换码</Link>
      <Link href="/account#exports" onClick={() => setOpen(false)}><span aria-hidden="true">▤</span>历史图纸</Link>
      <button className="account-logout" onClick={async () => { const result = await authClient.signOut(); if (result.error) { setError('退出失败，请重试'); return; } window.location.assign('/'); }}><span aria-hidden="true">↪</span>退出登录</button>
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
