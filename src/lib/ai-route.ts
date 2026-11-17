import { NextResponse } from 'next/server';
import { AiError } from './ai';
import { runExclusive } from './busy';

/** 接口里跑一个 AI 任务：同一个任务不重复跑，出错时转成给用户看的提示 */
export async function aiTask(key: string, fn: () => Promise<Record<string, unknown>>) {
  try {
    const out = await runExclusive(key, fn);
    if (!out) return NextResponse.json({ error: '正在生成中，请稍等。' }, { status: 409 });
    return NextResponse.json(out.value);
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error('ai task failed', key, e);
    return NextResponse.json({ error: `出错了：${(e as Error).message}` }, { status: 500 });
  }
}
