'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import AccountNav from '@/components/AccountNav';
import { api } from '@/lib/client-api';
import { membershipStatus } from '@/lib/membership/status.mjs';
type RecordRow = { id: string; createdAt: string; days: number; reason: string; expiresAt: string };
const statuses: Record<string, string> = { SUCCEEDED: '已完成', PROCESSING: '生成中', FAILED: '生成失败，可重试' };
type Profile = { user: { email: string; role: string }; membership: { expiresAt: string | null }; events: RecordRow[]; redemptions: { id: string; durationDays: number; expiresAt: string; createdAt: string; card: { suffix: string } }[]; exports: { id: string; status: string; createdAt: string }[] };
export default function Account() {
  const [profile, setProfile] = useState<Profile | null>(null); const [code, setCode] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [now, setNow] = useState(() => new Date());
  const load = useCallback(async () => { try { setProfile(await api('/api/me')); setNow(new Date()); } catch (error) { setMessage(error instanceof Error ? error.message : '加载失败'); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  async function redeem(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { const result = await api('/api/membership/redeem', { code }); setCode(''); setMessage(`兑换成功，增加 ${result.durationDays} 天，到期时间：${time(result.expiresAt)}`); await load(); window.dispatchEvent(new Event('membership-changed')); } catch (error) { setMessage(error instanceof Error ? error.message : '兑换失败'); } finally { setBusy(false); }
  }
  async function download(id: string) { try { setFiles((await api(`/api/exports/${id}`)).files); } catch (error) { setMessage(error instanceof Error ? error.message : '下载失败'); } }
  const time = (value: string) => new Date(value).toLocaleString('zh-CN');
  const membership = membershipStatus(profile?.membership.expiresAt, now);
  return <main className="mx-auto max-w-4xl space-y-8 px-5 py-10"><div className="flex items-center justify-between gap-4"><Link href="/" className="text-sm text-neutral-400">← 返回工作台</Link><AccountNav /></div><div className="flex justify-between"><h1 className="text-2xl font-bold">个人中心</h1><button onClick={load}>刷新</button></div>
    <p role="status">{message}</p>
    {!profile ? <Link href="/login">登录 / 验证邮箱后查看账号</Link> : <>
      <section className="rounded-xl bg-neutral-900 p-6 text-neutral-100"><p>{profile.user.email}</p><p className="mt-3 text-3xl font-bold">{membership.active ? '会员有效' : membership.expiresAt ? '会员已到期' : '尚未开通会员'}</p>{membership.expiresAt && <p className="mt-3">到期时间：{time(membership.expiresAt)}</p>}<p className="mt-2 text-sm text-neutral-400">{membership.active ? `剩余约 ${membership.remainingDays} 天 · 有效期内不限导出` : '兑换兑换码后即可开通或续期，预览与编辑始终免费。'}</p>{profile.user.role === 'ADMIN' && <Link className="mt-4 inline-block underline" href="/admin">管理后台</Link>}</section>
      <section id="redeem"><h2 className="mb-3 text-lg font-semibold">兑换会员</h2><p className="mb-3 text-sm text-neutral-400">会员未到期时顺延，到期后从兑换时间重新起算。</p><form onSubmit={redeem} className="flex flex-wrap gap-3"><input aria-label="兑换码" required maxLength={80} className="min-w-0 flex-1 rounded border p-3 dark:bg-neutral-900" placeholder="输入兑换码" value={code} onChange={e => setCode(e.target.value)} /><button disabled={busy} className="rounded bg-neutral-700 px-6 py-3 text-white disabled:opacity-50">{busy ? '兑换中…' : '兑换'}</button></form></section>
      <section id="exports"><h2 className="mb-3 text-lg font-semibold">历史导出（最近 50 条）</h2><p className="mb-3 text-sm text-neutral-400">会员有效期内可下载历史文件，每次下载都会验证账号与会员状态。</p>{membership.active && files.length > 0 && <div className="mb-4 flex flex-wrap gap-4">{files.map(file => <a key={file.name} href={file.url} className="text-neutral-300 underline">下载 {file.name}</a>)}</div>}{profile.exports.length === 0 && <p>暂无导出</p>}{profile.exports.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><span>{time(job.createdAt)} · {statuses[job.status] || job.status}</span>{job.status === 'SUCCEEDED' && <button disabled={!membership.active} className="text-neutral-300 disabled:opacity-50" onClick={() => download(job.id)}>{membership.active ? '获取下载链接' : '续期后下载'}</button>}</div>)}</section>
      <section><h2 className="mb-3 text-lg font-semibold">兑换记录（最近 50 条）</h2>{profile.redemptions.length === 0 && <p>暂无兑换</p>}{profile.redemptions.map(row => <p key={row.id} className="border-b py-3">{time(row.createdAt)} · 尾号 {row.card.suffix} · +{row.durationDays} 天 · 兑换后到期：{time(row.expiresAt)}</p>)}</section>
      <section><h2 className="mb-3 text-lg font-semibold">会员变更记录（最近 50 条）</h2>{profile.events.length === 0 && <p>暂无变更</p>}{profile.events.map(row => <p key={row.id} className="border-b py-3">{time(row.createdAt)} · {row.reason} · {row.days > 0 ? '+' : ''}{row.days} 天 · 到期：{time(row.expiresAt)}</p>)}</section>
    </>}
  </main>;
}
