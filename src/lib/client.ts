// 浏览器端调用接口的小工具：出错时抛出服务端给的中文提示

export async function api<T = Record<string, unknown>>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body instanceof FormData || body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new Error('网络连接失败，请检查网络后重试');
  }
  if (res.status === 401 && !url.startsWith('/api/auth')) {
    window.location.href = '/login';
    throw new Error('登录已过期');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data as T;
}

export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
  return true;
}

/** 朗读搭配时把 sb. / sth. 读成完整的词 */
export function speakable(term: string) {
  return term.replace(/\bsb\b\.?/gi, 'somebody').replace(/\bsth\b\.?/gi, 'something');
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
