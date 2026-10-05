'use client';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
type Mode = 'login' | 'register' | 'forgot' | 'verify';
export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (mode === 'register') {
        const result = await authClient.signUp.email({ email, password, name, callbackURL: '/account' });
        if (result.error) throw new Error(result.error.message);
        setMessage('注册成功，请查看邮箱中的验证邮件。验证后即可登录。');
      } else if (mode === 'forgot') {
        const result = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
        if (result.error) throw new Error(result.error.message);
        setMessage('如果邮箱已注册，你将收到密码重置邮件。');
      } else if (mode === 'verify') {
        const result = await authClient.sendVerificationEmail({ email, callbackURL: '/account' });
        if (result.error) throw new Error(result.error.message);
        setMessage('请查看验证邮件。');
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(result.error.message);
        window.location.assign('/account');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '请求失败'); } finally { setBusy(false); }
  }
  const labels = { login: '登录', register: '注册', forgot: '找回密码', verify: '重发验证邮件' };
  return <main className="mx-auto max-w-md px-5 py-12"><h1 className="mb-6 text-2xl font-bold">{labels[mode]}</h1>
    <form onSubmit={submit} className="space-y-4">
      {mode === 'register' && <label className="block">昵称<input required maxLength={60} className="mt-1 w-full rounded border p-3 dark:bg-neutral-900" value={name} onChange={e => setName(e.target.value)} /></label>}
      <label className="block">邮箱<input required type="email" autoComplete="email" className="mt-1 w-full rounded border p-3 dark:bg-neutral-900" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {(mode === 'login' || mode === 'register') && <label className="block">密码<input required minLength={10} maxLength={128} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} className="mt-1 w-full rounded border p-3 dark:bg-neutral-900" value={password} onChange={e => setPassword(e.target.value)} /><span className="text-xs text-neutral-400">至少 10 个字符</span></label>}
      <button disabled={busy} className="w-full rounded bg-neutral-700 p-3 text-white disabled:opacity-50">{busy ? '处理中…' : labels[mode]}</button>
    </form>
    <p role="status" className="my-4 text-sm">{message}</p>
    <div className="flex flex-wrap gap-4 text-sm text-neutral-300">{(Object.keys(labels) as Mode[]).filter(m => m !== mode).map(m => <button key={m} onClick={() => { setMode(m); setMessage(''); }}>{labels[m]}</button>)}<Link href="/">继续免费体验</Link></div>
  </main>;
}
