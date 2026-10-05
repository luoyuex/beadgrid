'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';
type RecordRow = { id: string; createdAt: string; delta: number; reason: string };
const statuses: Record<string, string> = { SUCCEEDED: '已完成', PROCESSING: '生成中', FAILED: '失败，未扣费' };
type Profile = { user: { email: string; role: string }; balance: number; reserved: number; ledger: RecordRow[]; redemptions: { id: string; credits: number; createdAt: string; card: { suffix: string } }[]; exports: { id: string; status: string; createdAt: string }[] };
export default function Account() {
  const [profile, setProfile] = useState<Profile | null>(null); const [code, setCode] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const load = useCallback(async () => { try { setProfile(await api('/api/me')); } catch (error) { setMessage(error instanceof Error ? error.message : '加载失败'); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function redeem(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { const result = await api('/api/credits/redeem', { code }); setCode(''); setMessage(`兑换成功，增加 ${result.credits} 次`); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : '兑换失败'); } finally { setBusy(false); }
  }
  async function download(id: string) { try { setFiles((await api(`/api/exports/${id}`)).files); } catch (error) { setMessage(error instanceof Error ? error.message : '下载失败'); } }
  const time = (value: string) => new Date(value).toLocaleString('zh-CN');
  return <main className="mx-auto max-w-4xl space-y-8 px-5 py-10"><div className="flex justify-between"><h1 className="text-2xl font-bold">个人中心</h1><button onClick={load}>刷新</button></div>
    <p role="status">{message}</p>
    {!profile ? <Link href="/login">登录 / 验证邮箱后查看账号</Link> : <>
      <section className="rounded-xl bg-neutral-900 p-6 text-neutral-100"><p>{profile.user.email}</p><p className="mt-3 text-3xl font-bold">可用 {profile.balance - profile.reserved} 次</p><p className="mt-2 text-sm">总余额 {profile.balance} 次 · 生成中预占 {profile.reserved} 次 · 次数长期有效</p>{profile.user.role === 'ADMIN' && <Link className="mt-4 inline-block underline" href="/admin">管理后台</Link>}</section>
      <section><h2 className="mb-3 text-lg font-semibold">兑换卡密</h2><form onSubmit={redeem} className="flex flex-wrap gap-3"><input aria-label="卡密" required maxLength={80} className="min-w-0 flex-1 rounded border p-3 dark:bg-neutral-900" placeholder="输入卡密" value={code} onChange={e => setCode(e.target.value)} /><button disabled={busy} className="rounded bg-neutral-700 px-6 py-3 text-white disabled:opacity-50">{busy ? '兑换中…' : '兑换'}</button></form></section>
      <section><h2 className="mb-3 text-lg font-semibold">历史导出（最近 50 条）</h2><p className="mb-3 text-sm text-neutral-400">同一成品重复下载不扣费；下载链接有效期 5 分钟，过期后可重新获取。</p>{files.length > 0 && <div className="mb-4 flex flex-wrap gap-4">{files.map(file => <a key={file.name} href={file.url} className="text-neutral-300 underline">下载 {file.name}</a>)}</div>}{profile.exports.length === 0 && <p>暂无导出</p>}{profile.exports.map(job => <div key={job.id} className="flex items-center justify-between border-b py-3"><span>{time(job.createdAt)} · {statuses[job.status] || job.status}</span>{job.status === 'SUCCEEDED' && <button className="text-neutral-300" onClick={() => download(job.id)}>获取下载链接</button>}</div>)}</section>
      <section><h2 className="mb-3 text-lg font-semibold">兑换记录（最近 50 条）</h2>{profile.redemptions.map(row => <p key={row.id} className="border-b py-3">{time(row.createdAt)} · 尾号 {row.card.suffix} · +{row.credits} 次</p>)}</section>
      <section><h2 className="mb-3 text-lg font-semibold">额度流水（最近 50 条）</h2>{profile.ledger.map(row => <p key={row.id} className="border-b py-3">{time(row.createdAt)} · {row.reason} · {row.delta > 0 ? '+' : ''}{row.delta} 次</p>)}</section>
    </>}
  </main>;
}
