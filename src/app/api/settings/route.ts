import { NextResponse } from 'next/server';
import { guard, hashPassword, verifyPassword } from '@/lib/auth';
import { AiError, type Protocol } from '@/lib/ai';
import { KEEP_DAYS_MAX, davConfig } from '@/lib/backup';
import { testAi } from '@/lib/review';
import { getSetting, publicSettings, setSetting } from '@/lib/settings';
import { testDav } from '@/lib/webdav';

const PLAIN_KEYS = [
  'ai_preset', 'ai_protocol', 'ai_base_url', 'ai_model', 'level', 'level_mode',
  'backup_enabled', 'backup_hour', 'webdav_url', 'webdav_user',
];
// 密钥类：留空表示不修改
const SECRET_INPUT_KEYS = ['ai_api_key', 'webdav_pass', 'backup_password'];

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const v: Record<string, unknown> = body.values ?? {};

  switch (body.action) {
    case 'save': {
      if (v.backup_keep_days !== undefined) {
        const n = Number(v.backup_keep_days);
        if (!Number.isInteger(n) || n < 1 || n > KEEP_DAYS_MAX) return fail(`备份保留天数要填 1 到 ${KEEP_DAYS_MAX} 之间的整数`);
        setSetting('backup_keep_days', String(n));
      }
      for (const k of PLAIN_KEYS) if (typeof v[k] === 'string') setSetting(k, (v[k] as string).trim());
      for (const k of SECRET_INPUT_KEYS) if (typeof v[k] === 'string' && v[k]) setSetting(k, (v[k] as string).trim());
      if (v.clear_backup_password === true) setSetting('backup_password', '');
      return NextResponse.json({ settings: publicSettings() });
    }
    case 'testAi': {
      try {
        const out = await testAi({
          protocol: v.ai_protocol as Protocol,
          baseUrl: typeof v.ai_base_url === 'string' ? v.ai_base_url : undefined,
          apiKey: typeof v.ai_api_key === 'string' ? v.ai_api_key : undefined,
          model: typeof v.ai_model === 'string' ? v.ai_model : undefined,
        });
        return NextResponse.json({ message: `连接成功，模型 ${out.model} 有回复。` });
      } catch (e) {
        return fail(e instanceof AiError ? e.message : `测试失败：${(e as Error).message}`, 502);
      }
    }
    case 'testDav': {
      const saved = davConfig();
      const url = (typeof v.webdav_url === 'string' ? v.webdav_url : saved?.url ?? '').trim();
      if (!url) return fail('请先填写 WebDAV 地址');
      try {
        await testDav({
          url,
          user: typeof v.webdav_user === 'string' ? v.webdav_user.trim() : saved?.user ?? '',
          pass: (typeof v.webdav_pass === 'string' && v.webdav_pass) || saved?.pass || '',
        });
        return NextResponse.json({ message: '连接成功，可以写入和删除文件。' });
      } catch (e) {
        return fail((e as Error).message, 502);
      }
    }
    case 'password': {
      const current = String(v.current ?? '');
      const next = String(v.next ?? '');
      if (!verifyPassword(current, getSetting('password_hash'))) return fail('当前密码不对');
      if (next.length < 6) return fail('新密码至少 6 位');
      setSetting('password_hash', hashPassword(next));
      return NextResponse.json({ message: '密码已修改。' });
    }
    default:
      return fail('未知操作');
  }
}
