import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { all, get, localDate, nowIso, run } from './db';

/**
 * 通行密钥（WebAuthn）登录。
 * 通行密钥和注册时的网址绑定：每把钥匙记下注册时的来源和域名，登录时按记录校验，
 * 所以换了域名之后旧的通行密钥不能用，需要用密码登录后重新添加。
 */

interface Row {
  id: string;
  public_key: string;
  counter: number;
  transports: string;
  name: string;
  rp_id: string;
  origin: string;
  created_at: string;
  last_used_at: string | null;
}

export interface PasskeyView {
  id: string;
  name: string;
  host: string;
  created_at: string;
  last_used_at: string | null;
}

export class PasskeyError extends Error {}

const RP_NAME = '英语日记';
const USER_ID = new TextEncoder().encode('english-diary-owner');
const TTL = 5 * 60 * 1000;

// 发出去还没用掉的挑战值：一次性，5 分钟过期。单进程应用，放内存里就够了
const g = globalThis as unknown as { __diaryChallenges?: Map<string, number> };
const challenges = (g.__diaryChallenges ??= new Map<string, number>());

function remember(challenge: string) {
  const now = Date.now();
  for (const [c, exp] of challenges) if (exp < now) challenges.delete(c);
  // 登录的挑战值不用登录就能要，限制数量免得被刷爆内存
  while (challenges.size >= 100) challenges.delete(challenges.keys().next().value as string);
  challenges.set(challenge, now + TTL);
}

function consume(challenge: string) {
  const exp = challenges.get(challenge);
  challenges.delete(challenge);
  return !!exp && exp >= Date.now();
}

/** 浏览器所在的网址。浏览器发 POST 时会带 Origin，页面脚本改不了它 */
function site(req: Request) {
  const origin = req.headers.get('origin');
  let url: URL;
  try {
    url = new URL(origin ?? '');
  } catch {
    throw new PasskeyError('无法确定当前网址，请直接在浏览器里打开本站操作');
  }
  return { origin: url.origin, rpID: url.hostname };
}

export function passkeyCount() {
  return get<{ n: number }>('SELECT COUNT(*) AS n FROM passkeys')?.n ?? 0;
}

export function listPasskeys(): PasskeyView[] {
  return all<Row>('SELECT * FROM passkeys ORDER BY created_at').map((r) => ({
    id: r.id,
    name: r.name,
    host: new URL(r.origin).host,
    created_at: r.created_at,
    last_used_at: r.last_used_at,
  }));
}

export function deletePasskey(id: string) {
  return run('DELETE FROM passkeys WHERE id = ?', id).changes > 0;
}

export async function registerOptions(req: Request) {
  const { rpID } = site(req);
  const existing = all<Row>('SELECT * FROM passkeys WHERE rp_id = ?', rpID);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: USER_ID,
    userName: 'diary',
    userDisplayName: RP_NAME,
    attestationType: 'none',
    // 同一个设备不重复添加
    excludeCredentials: existing.map((r) => ({ id: r.id, transports: JSON.parse(r.transports) as string[] })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  remember(options.challenge);
  return options;
}

export async function register(req: Request, response: RegistrationResponseJSON, name: string) {
  const { origin, rpID } = site(req);
  let out;
  try {
    out = await verifyRegistrationResponse({
      response,
      expectedChallenge: consume,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (e) {
    throw new PasskeyError(`添加失败：${(e as Error).message}`);
  }
  if (!out.verified) throw new PasskeyError('添加失败：验证没有通过');
  const c = out.registrationInfo.credential;
  if (get('SELECT id FROM passkeys WHERE id = ?', c.id)) throw new PasskeyError('这个通行密钥已经添加过了');
  run(
    'INSERT INTO passkeys(id, public_key, counter, transports, name, rp_id, origin, created_at) VALUES(?,?,?,?,?,?,?,?)',
    c.id,
    Buffer.from(c.publicKey).toString('base64url'),
    c.counter,
    JSON.stringify(c.transports ?? []),
    name.trim().slice(0, 40) || `通行密钥 ${localDate()}`,
    rpID,
    origin,
    nowIso(),
  );
}

export async function loginOptions(req: Request) {
  const { rpID } = site(req);
  if (!get('SELECT id FROM passkeys WHERE rp_id = ?', rpID)) {
    throw new PasskeyError('这个网址下还没有添加通行密钥，请用密码登录后在设置里添加');
  }
  // 不列出具体的钥匙，由浏览器让用户从已保存的通行密钥里选
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  remember(options.challenge);
  return options;
}

export async function login(response: AuthenticationResponseJSON) {
  const row = get<Row>('SELECT * FROM passkeys WHERE id = ?', String(response?.id ?? ''));
  if (!row) throw new PasskeyError('这个通行密钥没有在本站登记，或者已经被删除');
  let out;
  try {
    out = await verifyAuthenticationResponse({
      response,
      expectedChallenge: consume,
      expectedOrigin: row.origin,
      expectedRPID: row.rp_id,
      requireUserVerification: true,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(Buffer.from(row.public_key, 'base64url')),
        counter: row.counter,
        transports: JSON.parse(row.transports) as string[],
      },
    });
  } catch (e) {
    throw new PasskeyError(`登录失败：${(e as Error).message}`);
  }
  if (!out.verified) throw new PasskeyError('登录失败：验证没有通过');
  run('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?', out.authenticationInfo.newCounter, nowIso(), row.id);
}
