'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { api } from '@/lib/client-api';
type Mode = 'login' | 'register' | 'forgot';
type Step = 'email' | 'code' | 'username' | 'password';
function checked(result: { error?: { message?: string; code?: string } | null }) {
  if (result.error) {
    const messages: Record<string, string> = { INVALID_OTP: '验证码错误', OTP_EXPIRED: '验证码已过期，请重新发送', TOO_MANY_ATTEMPTS: '尝试过多，请重新发送验证码', INVALID_EMAIL_OR_PASSWORD: '邮箱或密码错误', INVALID_USERNAME_OR_PASSWORD: '用户名或密码错误', USERNAME_IS_ALREADY_TAKEN: '用户名已被使用，请换一个', EMAIL_NOT_VERIFIED: '请使用邮箱验证码登录并完成邮箱验证' };
    throw new Error(messages[result.error.code || ''] || result.error.message || '请求失败，请重试');
  }
}
export default function AuthFlow() {
  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>('email');
  const [account, setAccount] = useState(''); const [username, setUsername] = useState('');
  const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false); const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [failed, setFailed] = useState(false);
  const [resendAt, setResendAt] = useState(0); const [now, setNow] = useState(Date.now()); const [codeActive, setCodeActive] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const email = account.trim().toLowerCase(); const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!busy) inputRef.current?.focus(); }, [step, mode, busy]);
  function clear() { setMessage(''); setFailed(false); setVisible(false); }
  function switchMode(next: Mode) { if (busy) return; clear(); setMode(next); setStep('email'); setPassword(''); setConfirmPassword(''); setCode(''); setUsername(''); setAgreed(false); setSentEmail(''); setResendAt(0); if (next === 'forgot' && !isEmail) setAccount(''); }
  function back() {
    if (busy) return; clear(); setPassword(''); setConfirmPassword('');
    setStep(mode === 'register' ? ({ password: 'username', username: 'code', code: 'email', email: 'email' } as const)[step] : 'email');
  }
  async function sendCode() {
    if (remaining > 0) throw new Error(`请等待 ${remaining} 秒后重新发送`);
    setCode('');
    if (mode === 'register') await api('/api/registration', { action: 'send', email });
    else checked(await authClient.emailOtp.sendVerificationOtp({ email, type: mode === 'forgot' ? 'forget-password' : 'sign-in' }));
    const sentAt = Date.now(); setNow(sentAt); setResendAt(sentAt + 60000); setSentEmail(email);
  }
  async function resend() { if (busy || remaining) return; clear(); setBusy(true); try { await sendCode(); } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : '发送失败'); } finally { setBusy(false); } }
  async function codeLogin() { if (busy) return; clear(); setStep('code'); setPassword(''); setCode(''); if (!remaining) await resend(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; clear(); setBusy(true);
    try {
      if (step === 'email') {
        if (mode === 'login') {
          if (!isEmail && !/^[a-z0-9_]{4,32}$/.test(email)) throw new Error('请输入邮箱或用户名');
          if (!agreed) throw new Error('请先阅读并同意使用条款和隐私政策');
          setStep('password'); return;
        }
        if (!isEmail) throw new Error('请输入有效的邮箱地址');
        if (mode === 'register' && !agreed) throw new Error('请先阅读并同意使用条款和隐私政策');
        setStep('code'); await sendCode(); return;
      }
      if (step === 'code') {
        if (!/^\d{6}$/.test(code)) throw new Error('请输入 6 位邮箱验证码');
        if (mode === 'register') { await api('/api/registration', { action: 'verify', email, code }); setStep('username'); }
        else if (mode === 'forgot') { checked(await authClient.emailOtp.checkVerificationOtp({ email, otp: code, type: 'forget-password' })); setStep('password'); }
        else { checked(await authClient.signIn.emailOtp({ email, otp: code })); window.location.assign('/account'); }
        return;
      }
      if (step === 'username') {
        const normalized = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{4,32}$/.test(normalized)) throw new Error('用户名需要 4–32 位英文字母、数字或下划线');
        const result = await api('/api/registration', { action: 'username', email, username: normalized });
        if (!result.available) throw new Error('用户名已被使用，请换一个');
        setUsername(normalized); setStep('password'); return;
      }
      if (password.length < 8 || password.length > 128) throw new Error('密码长度需要 8–128 位');
      if (mode === 'register') {
        const signup = await authClient.signUp.email({ email, username, name: username, password });
        checked(signup);
        if (!signup.data?.user.emailVerified) throw new Error('该邮箱已注册，请直接登录');
        const result = await authClient.signIn.email({ email, password });
        if (result.error) { setMode('login'); setStep('email'); setPassword(''); setAgreed(false); setCode(''); setMessage('注册成功，请使用新账号登录。'); return; }
        window.location.assign('/account');
      } else if (mode === 'forgot') {
        if (password !== confirmPassword) throw new Error('两次输入的密码不一致');
        checked(await authClient.emailOtp.resetPassword({ email, otp: code, password }));
        setMode('login'); setStep('email'); setPassword(''); setConfirmPassword(''); setCode(''); setMessage('密码已重置，请使用新密码登录。');
      } else {
        checked(isEmail ? await authClient.signIn.email({ email, password }) : await authClient.signIn.username({ username: email, password }));
        window.location.assign('/account');
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : '请求失败，请重试';
      setFailed(true); setMessage(text);
      if (mode === 'register' && step === 'password' && text.includes('用户名')) { setStep('username'); setPassword(''); }
      if (mode === 'register' && (step === 'username' || step === 'password') && /验证邮箱|邮箱验证码/.test(text)) { setStep('code'); setCode(''); setPassword(''); setSentEmail(''); setResendAt(0); }
    }
    finally { setBusy(false); }
  }
  const title = mode === 'register' ? ({ email: '创建账号', code: '验证你的邮箱', username: '设置用户名', password: '设置密码' })[step] : mode === 'forgot' ? step === 'email' ? '重置密码' : step === 'code' ? '验证你的邮箱' : '设置新密码' : step === 'email' ? '登录你的账号' : step === 'code' ? '验证你的邮箱' : '输入密码';
  const subtitle = step === 'code' ? `${sentEmail === email ? '验证码已发送至' : '使用邮箱接收验证码：'} ${email}` : mode === 'register' ? step === 'email' ? '输入邮箱，开始你的拼豆创作' : step === 'username' ? '用户名可以用来登录。支持 4–32 位英文字母、数字和下划线，不区分大小写。' : '密码至少应有 8 个字符。' : mode === 'forgot' ? '验证邮箱后可设置新的登录密码' : step === 'email' ? '继续你的拼豆创作' : `输入 ${email} 对应的密码进行登录`;
  return <main className="bead-auth-page">
    <section className="bead-auth-brand"><Link href="/" className="bead-auth-logo"><img src="/icon.svg" alt="" />豆格 <span>BeadGrid</span></Link><small>BEADGRID STUDIO</small><h1>把创意，<br />变成拼豆图纸。</h1><p>从一张喜欢的图片开始，匹配色板、精细编辑，让每一颗拼豆都有自己的位置。</p><div className="bead-auth-points"><span>✓ 上传图片，免费预览与编辑</span><span>✓ 兑换会员，有效期内不限导出</span><span>✓ 图纸与采购清单，一次生成</span></div></section>
    <section className="bead-auth-card" aria-labelledby="auth-title">
      {step !== 'email' && <button type="button" className="bead-auth-link" disabled={busy} onClick={back}>‹ 返回</button>}
      <Link href="/" className="bead-auth-logo"><img src="/icon.svg" alt="" />豆格 <span>BeadGrid</span></Link>
      <h2 id="auth-title">{title}</h2><p>{subtitle}</p>
      <form onSubmit={submit}><fieldset disabled={busy}>
        {step === 'email' && <><label htmlFor="auth-account">{mode === 'login' ? '邮箱 / 用户名' : '邮箱'}<input ref={inputRef} id="auth-account" required type={mode === 'login' ? 'text' : 'email'} autoComplete={mode === 'login' ? 'username' : 'email'} maxLength={254} placeholder={mode === 'login' ? '请输入邮箱或用户名' : '请输入邮箱地址'} value={account} onChange={event => { setAccount(event.target.value); setCode(''); }} /></label>{mode !== 'forgot' && <label className="bead-auth-agreement"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /><span>我已阅读并同意 <Link href="/terms" target="_blank">使用条款</Link> 和 <Link href="/privacy" target="_blank">隐私政策</Link></span></label>}</>}
        {step === 'code' && <><div className="bead-auth-code"><input ref={inputRef} aria-label="六位邮箱验证码" autoComplete="one-time-code" inputMode="numeric" value={code} onFocus={() => setCodeActive(true)} onBlur={() => setCodeActive(false)} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /><div aria-hidden="true" className="bead-auth-digits">{Array.from({ length: 6 }, (_, index) => <span key={index} className={codeActive && index === Math.min(code.length, 5) ? 'focused' : ''}>{code[index] || ''}</span>)}</div></div><button type="button" className="bead-auth-link" disabled={busy || remaining > 0} onClick={resend}>{remaining > 0 ? `还没收到？ ${remaining} 秒后重发` : '还没收到？重新发送'}</button></>}
        {step === 'username' && <label htmlFor="auth-username">用户名<input ref={inputRef} id="auth-username" required autoComplete="username" maxLength={32} placeholder="请输入用户名" value={username} onChange={event => setUsername(event.target.value)} /></label>}
        {step === 'password' && <label htmlFor="auth-password">{mode === 'forgot' ? '新密码' : '密码'}<div className="bead-auth-password"><input ref={inputRef} key={`${mode}-${step}`} id="auth-password" required minLength={8} maxLength={128} type={visible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="至少 8 位" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={visible ? '隐藏密码' : '显示密码'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? '隐藏' : '显示'}</button></div></label>}
        {mode === 'forgot' && step === 'password' && <label htmlFor="auth-confirm">确认密码<input id="auth-confirm" required type="password" minLength={8} maxLength={128} autoComplete="new-password" placeholder="再次输入密码" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>}
        {mode === 'login' && step === 'password' && <button type="button" className="bead-auth-link" onClick={() => switchMode('forgot')}>忘记密码？</button>}
        {message && <p className="bead-auth-message" role={failed ? 'alert' : 'status'}>{message}</p>}
        <button className="bead-auth-submit" type="submit" disabled={busy || (step === 'code' && code.length !== 6)}>{busy ? '请稍候…' : mode === 'register' && step === 'password' ? '保存密码' : mode === 'forgot' && step === 'password' ? '重置密码' : mode === 'login' && step === 'email' ? '登录' : '继续'}</button>
      </fieldset></form>
      <button disabled={busy} className="bead-auth-mode" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '还没有账号？立即注册' : '已有账号？返回登录'}</button>
      {mode === 'login' && step === 'password' && isEmail && <button disabled={busy} className="bead-auth-mode" onClick={codeLogin}>⇄ 用验证码登录</button>}
      {mode === 'login' && step === 'code' && <button disabled={busy} className="bead-auth-mode" onClick={() => { clear(); setStep('password'); setCode(''); }}>⇄ 密码登录</button>}
      <Link className="bead-auth-explore" href="/">继续免费体验 →</Link><small className="bead-auth-note">预览与编辑免费，会员有效期内不限导出。</small>
    </section>
  </main>;
}
