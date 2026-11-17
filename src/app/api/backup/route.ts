import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { backupHealth, buildZip, listRemote, recentLogs, restore, restoreRemote, runBackup } from '@/lib/backup';
import { localDate } from '@/lib/db';

/** 手动导出：下载未加密的 ZIP（直接到你自己的电脑）。带 ?list=remote 时返回网盘里的备份列表 */
export async function GET(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  if (new URL(req.url).searchParams.get('list') === 'remote') {
    try {
      return NextResponse.json({ files: await listRemote() });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }
  const zip = buildZip();
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="english-diary-${localDate()}.zip"`,
      'cache-control': 'no-store',
    },
  });
}

const done = (out: { entries: number; vocab: number }, from = '') =>
  `恢复完成${from}：${out.entries} 篇日记，${out.vocab} 个生词和搭配。恢复前的数据已另存一份在本地备份目录。`;

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const type = req.headers.get('content-type') ?? '';

  try {
    if (type.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: '请选择备份文件' }, { status: 400 });
      const out = await restore(Buffer.from(await file.arrayBuffer()), String(form.get('password') ?? ''));
      return NextResponse.json({ message: done(out) });
    }
    const body = await req.json().catch(() => ({}));
    if (body.action === 'restoreRemote') {
      const out = await restoreRemote(typeof body.name === 'string' && body.name ? body.name : undefined, String(body.password ?? ''));
      return NextResponse.json({ message: done(out, `（来自网盘的 ${out.name}）`) });
    }
    const log = await runBackup();
    return NextResponse.json({ log, logs: recentLogs(), health: backupHealth() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
