'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { addPasskey, passkeySupported, type PasskeyView } from '@/lib/passkey-client';
import { AI_PRESETS, LEVELS, levelLabel, type LevelInfo } from '@/lib/shared';

interface Log {
  id: number;
  created_at: string;
  file: string;
  size: number;
  ok: number;
  remote: string;
  message: string;
}

interface Health {
  remoteConfigured: boolean;
  lastOk: string | null;
  lastRemoteOk: string | null;
  warning: string | null;
}

interface Props {
  initial: Record<string, string | boolean>;
  level: LevelInfo;
  initialLogs: Log[];
  initialHealth: Health;
  initialPasskeys: PasskeyView[];
}

interface RemoteFile {
  name: string;
  size: number;
  time: string;
  encrypted: boolean;
}

const KEEP_PRESETS = ['7', '31', '90', '365'];

type Msg ={ kind: 'ok' | 'error'; text: string } | null;

function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <div className={`banner ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'} style={{ marginTop: 12, marginBottom: 0 }}>{msg.text}</div>;
}

const time = (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '还没有');
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function SettingsClient({ initial, level, initialLogs, initialHealth, initialPasskeys }: Props) {
  const str = (k: string) => String(initial[k] ?? '');
  const [ai, setAi] = useState({
    ai_preset: str('ai_preset'),
    ai_protocol: str('ai_protocol'),
    ai_base_url: str('ai_base_url'),
    ai_model: str('ai_model'),
    ai_api_key: '',
  });
  const [hasKey, setHasKey] = useState(!!initial.has_ai_api_key);
  const [lv, setLv] = useState({ level: str('level') || 'A2', level_mode: str('level_mode') || 'auto' });
  const [bk, setBk] = useState({
    backup_enabled: str('backup_enabled') || '1',
    backup_hour: str('backup_hour') || '3',
    backup_keep_days: str('backup_keep_days') || '31',
    webdav_url: str('webdav_url'),
    webdav_user: str('webdav_user'),
    webdav_pass: '',
    backup_password: '',
  });
  const [hasDavPass, setHasDavPass] = useState(!!initial.has_webdav_pass);
  const [hasBkPass, setHasBkPass] = useState(!!initial.has_backup_password);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [logs, setLogs] = useState(initialLogs);
  const [health, setHealth] = useState(initialHealth);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<Record<string, Msg>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [restorePw, setRestorePw] = useState('');
  const [keepCustom, setKeepCustom] = useState(!KEEP_PRESETS.includes(str('backup_keep_days') || '31'));
  const [davSaved, setDavSaved] = useState(!!str('webdav_url'));
  const [remote, setRemote] = useState<RemoteFile[] | null>(null);
  const [remotePick, setRemotePick] = useState('');
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [passkeyName, setPasskeyName] = useState('');
  // null 表示还没检测（服务端渲染时不知道浏览器支不支持）
  const [passkeyOk, setPasskeyOk] = useState<boolean | null>(null);
  useEffect(() => setPasskeyOk(passkeySupported()), []);

  const preset = AI_PRESETS.find((p) => p.id === ai.ai_preset) ?? AI_PRESETS[AI_PRESETS.length - 1];

  function note(section: string, kind: 'ok' | 'error', text: string) {
    setMsg((m) => ({ ...m, [section]: { kind, text } }));
  }

  async function act(section: string, name: string, fn: () => Promise<string>) {
    setBusy(name);
    setMsg((m) => ({ ...m, [section]: null }));
    try {
      note(section, 'ok', await fn());
    } catch (e) {
      note(section, 'error', (e as Error).message);
    } finally {
      setBusy('');
    }
  }

  function choosePreset(id: string) {
    const p = AI_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setAi((a) => ({ ...a, ai_preset: p.id, ai_protocol: p.protocol, ai_base_url: p.baseUrl, ai_model: p.model }));
  }

  const saveAi = () =>
    act('ai', 'saveAi', async () => {
      await api('/api/settings', { action: 'save', values: ai });
      if (ai.ai_api_key) setHasKey(true);
      setAi((a) => ({ ...a, ai_api_key: '' }));
      return 'AI 设置已保存。';
    });

  const testAi = () =>
    act('ai', 'testAi', async () => (await api<{ message: string }>('/api/settings', { action: 'testAi', values: ai })).message);

  const saveLevel = () =>
    act('level', 'saveLevel', async () => {
      await api('/api/settings', { action: 'save', values: lv });
      return '水平设置已保存。';
    });

  const saveBackup = () =>
    act('backup', 'saveBackup', async () => {
      await api('/api/settings', { action: 'save', values: bk });
      if (bk.webdav_pass) setHasDavPass(true);
      if (bk.backup_password) setHasBkPass(true);
      setBk((b) => ({ ...b, webdav_pass: '', backup_password: '' }));
      setDavSaved(!!bk.webdav_url.trim());
      setRemote(null);
      return '备份设置已保存。';
    });

  const loadRemote = () =>
    act('remote', 'loadRemote', async () => {
      const out = await api<{ files: RemoteFile[] }>('/api/backup?list=remote', undefined, 'GET');
      setRemote(out.files);
      setRemotePick(out.files[0]?.name ?? '');
      return out.files.length ? `网盘里有 ${out.files.length} 份备份，已选中最新的一份。` : '网盘里还没有备份。';
    });

  /** name 为空表示恢复网盘里最新的一份 */
  const restoreFromRemote = (name: string) =>
    act('remote', 'restoreRemote', async () => {
      const which = name ? `网盘备份 ${name}` : '网盘里最新的一份备份';
      if (!confirm(`恢复会用${which}覆盖现在所有的日记、批改、生词本和练习记录。确定继续吗？`)) throw new Error('已取消');
      const out = await api<{ message: string }>('/api/backup', { action: 'restoreRemote', name, password: restorePw });
      return out.message + ' 刷新页面后可以看到恢复的内容。';
    });

  const clearBkPass = () =>
    act('backup', 'clearBkPass', async () => {
      await api('/api/settings', { action: 'save', values: { clear_backup_password: true } });
      setHasBkPass(false);
      return '已取消备份加密，之后的备份不再加密。';
    });

  const testDav = () =>
    act('backup', 'testDav', async () => (await api<{ message: string }>('/api/settings', { action: 'testDav', values: bk })).message);

  const runNow = () =>
    act('backup', 'runNow', async () => {
      const out = await api<{ log: Log; logs: Log[]; health: Health }>('/api/backup', {});
      setLogs(out.logs);
      setHealth(out.health);
      if (!out.log.ok || out.log.remote === 'failed') throw new Error(out.log.message || '备份失败');
      return out.log.remote === 'ok' ? `备份完成，已上传到网盘并校验：${out.log.file}` : `本地备份完成：${out.log.file}（未配置网盘）`;
    });

  const doRestore = () =>
    act('restore', 'restore', async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('请先选择备份文件');
      if (!confirm('恢复会用备份文件覆盖现在所有的日记、批改和生词本。确定继续吗？')) throw new Error('已取消');
      const form = new FormData();
      form.append('file', file);
      form.append('password', restorePw);
      const out = await api<{ message: string }>('/api/backup', form);
      if (fileRef.current) fileRef.current.value = '';
      return out.message;
    });

  const newPasskey = () =>
    act('passkey', 'addPasskey', async () => {
      setPasskeys(await addPasskey(passkeyName));
      setPasskeyName('');
      return '通行密钥已添加，下次可以在登录页直接用它登录。';
    });

  const removePasskey = (p: PasskeyView) =>
    act('passkey', 'removePasskey', async () => {
      if (!confirm(`删除通行密钥"${p.name}"？删除后它不能再用来登录本站。`)) throw new Error('已取消');
      const out = await api<{ passkeys: PasskeyView[] }>(`/api/passkey?id=${encodeURIComponent(p.id)}`, undefined, 'DELETE');
      setPasskeys(out.passkeys);
      return '已删除。设备或密码管理器里保存的那一份需要你自己在那边删掉。';
    });

  const changePw = () =>
    act('password', 'password', async () => {
      const out = await api<{ message: string }>('/api/settings', { action: 'password', values: pw });
      setPw({ current: '', next: '' });
      return out.message;
    });

  async function logout() {
    await api('/api/auth', { action: 'logout' });
    window.location.href = '/login';
  }

  return (
    <>
      <h1 style={{ marginBottom: 16 }}>设置</h1>

      <section className="card">
        <h2>AI 模型</h2>
        <div className="grid2">
          <label className="field"><span>服务商</span>
            <select value={ai.ai_preset} onChange={(e) => choosePreset(e.target.value)}>
              {AI_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field"><span>接口协议</span>
            <select value={ai.ai_protocol} onChange={(e) => setAi({ ...ai, ai_protocol: e.target.value })}>
              <option value="openai">OpenAI 兼容（大多数厂商和中转）</option>
              <option value="anthropic">Anthropic 原生</option>
              <option value="gemini">Gemini 原生</option>
            </select>
          </label>
          <label className="field"><span>接口地址{ai.ai_protocol === 'openai' ? '（通常以 /v1 结尾）' : ''}</span>
            <input type="text" value={ai.ai_base_url} onChange={(e) => setAi({ ...ai, ai_base_url: e.target.value })} placeholder="https://你的中转地址/v1" />
          </label>
          <label className="field"><span>模型名称</span>
            <input type="text" value={ai.ai_model} onChange={(e) => setAi({ ...ai, ai_model: e.target.value })} placeholder={preset.hint} />
          </label>
        </div>
        <label className="field"><span>API 密钥{hasKey ? '（已保存，留空表示不修改）' : ''}</span>
          <input type="password" value={ai.ai_api_key} onChange={(e) => setAi({ ...ai, ai_api_key: e.target.value })} autoComplete="off" placeholder={hasKey ? '••••••••' : '粘贴你的密钥'} />
        </label>
        <p className="muted small">密钥只保存在你自己的服务器上，不会出现在备份文件里。用中转时选对应的协议，再把接口地址换成中转地址。</p>
        <div className="row">
          <button className="primary" onClick={saveAi} disabled={!!busy}>保存</button>
          <button onClick={testAi} disabled={!!busy}>{busy === 'testAi' ? '测试中…' : '测试连接'}</button>
        </div>
        <Notice msg={msg.ai ?? null} />
      </section>

      <section className="card">
        <h2>我的水平</h2>
        <div className="grid2">
          <label className="field"><span>水平</span>
            <select value={lv.level} onChange={(e) => setLv({ ...lv, level: e.target.value })}>
              {LEVELS.map((l) => <option key={l.code} value={l.code}>{l.label} — {l.desc}</option>)}
            </select>
          </label>
          <label className="field"><span>模式</span>
            <select value={lv.level_mode} onChange={(e) => setLv({ ...lv, level_mode: e.target.value })}>
              <option value="auto">自动：跟随 AI 识别的水平</option>
              <option value="manual">手动：固定用我选的水平</option>
            </select>
          </label>
        </div>
        <p className="muted small">
          {level.detected
            ? `根据最近 ${level.samples} 篇日记，识别到的水平是"${levelLabel(level.detected)}"。`
            : `自动识别需要至少 3 篇批改过的日记（现在有 ${level.samples} 篇），在那之前用你选的水平。`}
          水平会影响解释的详细程度、推荐词汇的难度和润色版的复杂度。
        </p>
        <button className="primary" onClick={saveLevel} disabled={!!busy}>保存</button>
        <Notice msg={msg.level ?? null} />
      </section>

      <section className="card" id="backup">
        <h2>备份</h2>
        {health.warning && <div className="banner warn" role="alert">{health.warning}</div>}
        <p className="small">
          上次本地备份：<strong>{time(health.lastOk)}</strong>
          　上次上传网盘：<strong>{health.remoteConfigured ? time(health.lastRemoteOk) : '未配置网盘'}</strong>
        </p>
        <div className="grid2">
          <label className="field"><span>每日自动备份</span>
            <select value={bk.backup_enabled} onChange={(e) => setBk({ ...bk, backup_enabled: e.target.value })}>
              <option value="1">开启</option>
              <option value="0">关闭</option>
            </select>
          </label>
          <label className="field"><span>每天几点之后备份（0–23）</span>
            <input type="number" min={0} max={23} value={bk.backup_hour} onChange={(e) => setBk({ ...bk, backup_hour: e.target.value })} />
          </label>
        </div>
        <div className="grid2">
          <label className="field"><span>备份保留多久</span>
            <select
              value={keepCustom ? 'custom' : bk.backup_keep_days}
              onChange={(e) => {
                if (e.target.value === 'custom') setKeepCustom(true);
                else {
                  setKeepCustom(false);
                  setBk({ ...bk, backup_keep_days: e.target.value });
                }
              }}
            >
              <option value="7">7 天</option>
              <option value="31">31 天</option>
              <option value="90">90 天</option>
              <option value="365">365 天</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          {keepCustom && (
            <label className="field"><span>自定义保留天数（1–3650）</span>
              <input type="number" min={1} max={3650} value={bk.backup_keep_days} onChange={(e) => setBk({ ...bk, backup_keep_days: e.target.value })} />
            </label>
          )}
        </div>
        <label className="field"><span>WebDAV 备份目录（AList 地址形如 https://你的域名/dav/网盘名/diary-backup）</span>
          <input type="text" value={bk.webdav_url} onChange={(e) => setBk({ ...bk, webdav_url: e.target.value })} placeholder="留空则只做本地备份" />
        </label>
        <div className="grid2">
          <label className="field"><span>WebDAV 用户名</span>
            <input type="text" value={bk.webdav_user} onChange={(e) => setBk({ ...bk, webdav_user: e.target.value })} autoComplete="off" />
          </label>
          <label className="field"><span>WebDAV 密码{hasDavPass ? '（已保存，留空表示不修改）' : ''}</span>
            <input type="password" value={bk.webdav_pass} onChange={(e) => setBk({ ...bk, webdav_pass: e.target.value })} autoComplete="off" placeholder={hasDavPass ? '••••••••' : ''} />
          </label>
        </div>
        <label className="field"><span>备份加密密码（可选）{hasBkPass ? ' — 已开启加密，留空表示不修改' : ''}</span>
          <input type="password" value={bk.backup_password} onChange={(e) => setBk({ ...bk, backup_password: e.target.value })} autoComplete="off" placeholder={hasBkPass ? '••••••••' : '设置后，自动备份的文件会加密再上传'} />
        </label>
        <p className="muted small">
          保留策略：保留期内每天留最新的一份，超过保留期的在下次备份时自动删除（本地和网盘都是），最新的一份始终保留。把保留期改短会删掉更早的备份。
          加密密码请自己记好，忘了就无法解开加密的备份。AList 用户需要开启"WebDAV 读取"和"WebDAV 管理"权限。
        </p>
        <div className="row">
          <button className="primary" onClick={saveBackup} disabled={!!busy}>保存</button>
          <button onClick={testDav} disabled={!!busy}>{busy === 'testDav' ? '测试中…' : '测试 WebDAV'}</button>
          <button onClick={runNow} disabled={!!busy}>{busy === 'runNow' ? '备份中…' : '立即备份'}</button>
          <a className="btn" href="/api/backup" download>导出 ZIP 到本机</a>
          {hasBkPass && <button className="ghost" onClick={clearBkPass} disabled={!!busy}>取消加密</button>}
        </div>
        <Notice msg={msg.backup ?? null} />

        {logs.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 16 }}>
            <table className="logs">
              <thead><tr><th>时间</th><th>本地</th><th>网盘</th><th>大小</th><th>说明</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{time(l.created_at)}</td>
                    <td>{l.ok ? '成功' : '失败'}</td>
                    <td>{l.remote === 'ok' ? '成功' : l.remote === 'failed' ? '失败' : '—'}</td>
                    <td>{l.size ? kb(l.size) : '—'}</td>
                    <td>{l.message || l.file}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 style={{ marginTop: 20 }}>从备份恢复</h3>
        <p className="muted small">
          恢复会覆盖现有的日记、批改、生词本和练习记录，恢复前会自动在本地另存一份当前数据。登录密码、API 密钥和 WebDAV 密码不受影响。
        </p>
        <label className="field" style={{ maxWidth: 360 }}><span>加密备份的密码（未加密，或和上面保存的加密密码相同，就不用填）</span>
          <input type="password" value={restorePw} onChange={(e) => setRestorePw(e.target.value)} autoComplete="off" />
        </label>

        <h4 style={{ margin: '14px 0 6px' }}>从网盘恢复</h4>
        {davSaved ? (
          <>
            <div className="row">
              <button className="danger" onClick={() => restoreFromRemote('')} disabled={!!busy}>
                {busy === 'restoreRemote' ? '恢复中…' : '一键恢复最新备份'}
              </button>
              <button onClick={loadRemote} disabled={!!busy}>{busy === 'loadRemote' ? '读取中…' : remote ? '刷新列表' : '选择其它备份'}</button>
            </div>
            {remote && remote.length > 0 && (
              <div className="row" style={{ marginTop: 10 }}>
                <select value={remotePick} onChange={(e) => setRemotePick(e.target.value)} aria-label="选择网盘里的备份" style={{ maxWidth: 360 }}>
                  {remote.map((f, i) => (
                    <option key={f.name} value={f.name}>
                      {f.time}{f.size > 0 ? ` · ${kb(f.size)}` : ''}{f.encrypted ? ' · 加密' : ''}{i === 0 ? ' · 最新' : ''}
                    </option>
                  ))}
                </select>
                <button className="danger" onClick={() => restoreFromRemote(remotePick)} disabled={!!busy || !remotePick}>恢复选中的这份</button>
              </div>
            )}
            <Notice msg={msg.remote ?? null} />
          </>
        ) : (
          <p className="muted small">先在上面填好 WebDAV 备份目录并保存，就能直接从网盘恢复。</p>
        )}

        <h4 style={{ margin: '18px 0 6px' }}>从本机文件恢复</h4>
        <p className="muted small">上传本站导出的 ZIP 或加密备份（.zip.enc）。</p>
        <div className="row">
          <input type="file" ref={fileRef} accept=".zip,.enc" aria-label="选择备份文件" style={{ maxWidth: 280 }} />
          <button className="danger" onClick={doRestore} disabled={!!busy}>{busy === 'restore' ? '恢复中…' : '恢复'}</button>
        </div>
        <Notice msg={msg.restore ?? null} />
      </section>

      <section className="card" id="passkey">
        <h2>通行密钥</h2>
        <p className="muted small">
          用指纹、面容、设备 PIN 或密码管理器登录，不用输密码。密码登录仍然保留。通行密钥和添加时的网址绑定，换了域名需要重新添加。
        </p>
        {passkeys.length > 0 && (
          <ul className="passkeys">
            {passkeys.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <div className="muted small">
                    {p.host} · 添加于 {time(p.created_at)} · {p.last_used_at ? `上次使用 ${time(p.last_used_at)}` : '还没用过'}
                  </div>
                </div>
                <button className="ghost" onClick={() => removePasskey(p)} disabled={!!busy}>删除</button>
              </li>
            ))}
          </ul>
        )}
        {passkeyOk === false ? (
          <div className="banner warn" role="status">
            现在的访问方式不能添加通行密钥：浏览器只在 HTTPS 网址（或本机 localhost）下提供这个功能。给本站配好 HTTPS 域名后再来添加。
          </div>
        ) : (
          <div className="row">
            <input type="text" value={passkeyName} onChange={(e) => setPasskeyName(e.target.value)} placeholder="起个名字，比如：我的手机（可不填）" maxLength={40} style={{ maxWidth: 300 }} aria-label="通行密钥名称" />
            <button className="primary" onClick={newPasskey} disabled={!!busy || !passkeyOk}>{busy === 'addPasskey' ? '等待设备确认…' : '添加通行密钥'}</button>
          </div>
        )}
        <Notice msg={msg.passkey ?? null} />
      </section>

      <section className="card">
        <h2>登录密码</h2>
        <div className="grid2">
          <label className="field"><span>当前密码</span>
            <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </label>
          <label className="field"><span>新密码（至少 6 位）</span>
            <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          </label>
        </div>
        <div className="row">
          <button className="primary" onClick={changePw} disabled={!!busy}>修改密码</button>
          <span className="spacer" />
          <button onClick={logout}>退出登录</button>
        </div>
        <Notice msg={msg.password ?? null} />
      </section>
    </>
  );
}
