'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * 服务器说某个 AI 任务还在跑时，每隔几秒刷新一次页面数据，直到它结束。
 * 用在"提交后切到别的页面再回来"的情况：结果由服务器保存，页面只管等。
 */
export function useBusyRefresh(busy: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [busy, router]);
}
