'use client';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
import './login.css';
type Mode = 'login' | 'register' | 'forgot';
export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [visible, setVisible] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [failed, setFailed] = useState(false);
  const [registered, setRegistered] = useState(false);
  function switchMode(next: Mode) {
    setMode(next); setStep('email'); setPassword(''); setConfirmPassword(''); setVisible(false); setMessage(''); setFailed(false); setRegistered(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setMessage(''); setFailed(false);
    if (mode === 'login' && step === 'email') { setStep('password'); return; }
    if (mode === 'register' && password !== confirmPassword) { setMessage('两次输入的密码不一致'); setFailed(true); return; }
    setBusy(true);
    try {
      if (mode === 'register') {
        if (registered) {
          const result = await authClient.sendVerificationEmail({ email, callbackURL: '/account' });
          if (result.error) throw new Error(result.error.message);
          setMessage('验证邮件已重新发送，请查看邮箱。');
          return;
        }
        const result = await authClient.signUp.email({ email, password, name, callbackURL: '/account' });
        if (result.error) throw new Error(result.error.message);
        setRegistered(true); setPassword(''); setConfirmPassword('');
        setMessage('验证邮件已发送，请打开邮箱中的链接完成验证。');
      } else if (mode === 'forgot') {
        const result = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
        if (result.error) throw new Error(result.error.message);
        setMessage('如果邮箱已注册，你将收到密码重置邮件。');
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(result.error.message);
        window.location.assign('/account');
      }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : '请求失败'); } finally { setBusy(false); }
  }
  const labels = { login: '登录', register: '注册', forgot: '找回密码' };
  const passwordStep = mode === 'login' && step === 'password';
  const showPassword = passwordStep || (mode === 'register' && !registered);
  const title = registered ? '验证你的邮箱' : mode === 'login' ? passwordStep ? '输入密码' : '登录你的账号' : mode === 'register' ? '创建账号' : labels[mode];
  const subtitle = registered ? `验证邮件已发送至 ${email}` : mode === 'login' ? passwordStep ? `输入 ${email} 对应的密码进行登录` : '继续你的拼豆创作' : mode === 'register' ? '创建账号，开始你的拼豆创作。' : '我们会向你的邮箱发送密码重置链接。';
  return <main className="bead-auth-page">
    <section className="bead-auth-brand"><Link href="/" className="bead-auth-logo"><img src="/icon.svg" alt="" />豆格 <span>BeadGrid</span></Link><small>BEADGRID STUDIO</small><h1>把创意，<br />变成拼豆图纸。</h1><p>从一张喜欢的图片开始，匹配色板、精细编辑，让每一颗拼豆都有自己的位置。</p><div className="bead-auth-points"><span>✓ 上传图片，免费预览与编辑</span><span>✓ 兑换会员，有效期内不限导出</span><span>✓ 图纸与采购清单，一次生成</span></div></section>
    <section className="bead-auth-card" aria-labelledby="auth-title">
      {passwordStep && <button className="bead-auth-link" disabled={busy} onClick={() => { setStep('email'); setPassword(''); setMessage(''); }}>‹ 返回</button>}
      <Link href="/" className="bead-auth-logo"><img src="/icon.svg" alt="" />豆格 <span>BeadGrid</span></Link>
      <h2 id="auth-title">{title}</h2><p>{subtitle}</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {mode === 'register' && !registered && <label htmlFor="auth-name">昵称<input id="auth-name" required maxLength={60} autoComplete="nickname" placeholder="你的创作昵称" value={name} onChange={e => setName(e.target.value)} /></label>}
          {!passwordStep && !registered && <label htmlFor="auth-email">邮箱<input id="auth-email" required type="email" maxLength={254} autoComplete="email" placeholder="请输入邮箱地址" value={email} onChange={e => setEmail(e.target.value.trim())} /></label>}
          {showPassword && <label htmlFor="auth-password">{mode === 'register' ? '设置密码' : '密码'}<div className="bead-auth-password"><input key={`${mode}-${step}`} id="auth-password" required minLength={10} maxLength={128} type={visible ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="请输入密码（至少 10 个字符）" value={password} onChange={e => setPassword(e.target.value)} /><button type="button" aria-label={visible ? '隐藏密码' : '显示密码'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? '隐藏' : '显示'}</button></div></label>}
          {mode === 'register' && !registered && <label htmlFor="auth-confirm">确认密码<input id="auth-confirm" required minLength={10} maxLength={128} type="password" autoComplete="new-password" placeholder="再次输入密码" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>}
          {passwordStep && <button type="button" className="bead-auth-link" onClick={() => switchMode('forgot')}>忘记密码？</button>}
          {message && <p className="bead-auth-message" role={failed ? 'alert' : 'status'}>{message}</p>}
          <button className={registered ? 'bead-auth-link' : 'bead-auth-submit'} type="submit">{busy ? '处理中…' : registered ? '还没收到？重新发送' : mode === 'login' ? passwordStep ? '登录' : '继续' : mode === 'register' ? '创建账号' : labels[mode]}</button>
        </fieldset>
      </form>
      <button disabled={busy} className="bead-auth-mode" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '还没有账号？立即注册' : '已有账号？返回登录'}</button>
      <Link className="bead-auth-explore" href="/">继续免费体验 →</Link>
      <small className="bead-auth-note">预览与编辑免费，会员有效期内不限导出。</small>
    </section>
  </main>;
}
