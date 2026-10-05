'use client';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
export default function ResetPassword() {
  const [password, setPassword] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      if (!token) throw new Error('重置链接无效，请重新申请');
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) throw new Error(result.error.message);
      setMessage('密码已重置，请重新登录。'); setPassword('');
    } catch (error) { setMessage(error instanceof Error ? error.message : '重置失败'); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md px-5 py-12"><h1 className="mb-6 text-2xl font-bold">设置新密码</h1><form className="space-y-4" onSubmit={submit}><label className="block">新密码<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded border p-3 dark:bg-neutral-900" value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={busy} className="rounded bg-neutral-700 p-3 text-white">{busy ? '处理中…' : '重置密码'}</button></form><p role="status" className="my-4">{message}</p><Link href="/login">返回登录</Link></main>;
}
