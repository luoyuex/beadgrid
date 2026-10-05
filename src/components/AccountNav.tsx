'use client';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
export default function AccountNav() {
  const { data, isPending } = authClient.useSession();
  return <nav className="account-nav flex flex-wrap items-center justify-between gap-3 border-b border-neutral-700 bg-neutral-900 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-950">
    <Link href="/" className="font-semibold" aria-label="豆格 BeadGrid 首页">豆格 <span className="ml-1 text-xs font-normal text-neutral-400">BeadGrid</span></Link>
    <div className="flex flex-wrap items-center gap-4">
      <span className="text-neutral-400">预览免费 · 成品导出 1 次</span>
      {isPending ? <span>加载中</span> : data ? <><Link href="/account">我的次数 / 兑换卡密</Link><button onClick={async () => { await authClient.signOut(); window.location.assign('/'); }}>退出登录</button></> : <Link href="/login">登录 / 注册</Link>}
    </div>
  </nav>;
}
