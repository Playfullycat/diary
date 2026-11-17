// 浏览器端的通行密钥操作
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from './client';

export interface PasskeyView {
  id: string;
  name: string;
  host: string;
  created_at: string;
  last_used_at: string | null;
}

/** 浏览器只在 HTTPS 或 localhost 下提供通行密钥 */
export function passkeySupported() {
  return typeof window !== 'undefined' && window.isSecureContext && browserSupportsWebAuthn();
}

function explain(e: unknown): Error {
  const err = e as Error;
  if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return new Error('已取消，或者等待超时了');
  if (err?.name === 'InvalidStateError') return new Error('这台设备上已经添加过通行密钥了');
  if (err?.name === 'SecurityError') return new Error('当前网址不能使用通行密钥，需要通过 HTTPS 域名访问');
  return err instanceof Error ? err : new Error('通行密钥操作失败');
}

type Options = Parameters<typeof startRegistration>[0]['optionsJSON'];
type LoginOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export async function addPasskey(name: string) {
  const { options } = await api<{ options: Options }>('/api/passkey', { action: 'registerOptions' });
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (e) {
    throw explain(e);
  }
  return (await api<{ passkeys: PasskeyView[] }>('/api/passkey', { action: 'register', response, name })).passkeys;
}

export async function loginWithPasskey() {
  const { options } = await api<{ options: LoginOptions }>('/api/passkey', { action: 'loginOptions' });
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (e) {
    throw explain(e);
  }
  await api('/api/passkey', { action: 'login', response });
}
