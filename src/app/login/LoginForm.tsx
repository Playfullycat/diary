'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { loginWithPasskey, passkeySupported } from '@/lib/passkey-client';

export default function LoginForm({ setup, passkey }: { setup: boolean; passkey: boolean }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);

  useEffect(() => setCanPasskey(passkey && passkeySupported()), [passkey]);

  async function usePasskey() {
    setError('');
    setBusy(true);
    try {
      await loginWithPasskey();
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (setup && password !== confirm) {
      setError('两次输入的密码不一样');
      return;
    }
    setBusy(true);
    try {
      await api('/api/auth', { action: setup ? 'setup' : 'login', password });
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>英语日记</h1>
      <p className="muted small">{setup ? '第一次使用，先设置一个登录密码（至少 6 位）。' : '请输入密码登录。'}</p>
      {error && <div className="banner error" role="alert">{error}</div>}
      <label className="field">
        <span>密码</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={setup ? 'new-password' : 'current-password'}
          autoFocus
          required
        />
      </label>
      {setup && (
        <label className="field">
          <span>再输入一次</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
      )}
      <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
        {busy ? '请稍候…' : setup ? '设置密码并进入' : '登录'}
      </button>
      {canPasskey && (
        <button type="button" onClick={usePasskey} disabled={busy} style={{ width: '100%', marginTop: 10 }}>
          用通行密钥登录
        </button>
      )}
    </form>
  );
}
