// 极简 WebDAV 客户端，够 AList / 坚果云 等备份使用

export interface Dav {
  url: string;
  user: string;
  pass: string;
}

export class DavError extends Error {}

function dirUrl(d: Dav) {
  return d.url.replace(/\/+$/, '') + '/';
}

async function request(d: Dav, method: string, url: string, init: { headers?: Record<string, string>; body?: BodyInit } = {}) {
  try {
    return await fetch(url, {
      method,
      headers: {
        authorization: 'Basic ' + Buffer.from(`${d.user}:${d.pass}`).toString('base64'),
        ...init.headers,
      },
      body: init.body,
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    throw new DavError(`连不上 WebDAV 服务器：${(e as Error).message}`);
  }
}

function explain(status: number) {
  if (status === 401) return '用户名或密码不对（401）';
  if (status === 403) return '没有权限（403）。AList 需要给该用户开启"WebDAV 读取"和"WebDAV 管理"';
  if (status === 404) return '路径不存在（404），请检查地址，AList 的 WebDAV 地址以 /dav/ 开头';
  if (status === 507) return '网盘空间不足（507）';
  return `服务器返回 ${status}`;
}

/** 确保备份目录存在（逐级创建） */
export async function ensureDir(d: Dav) {
  const target = new URL(dirUrl(d));
  const probe = await request(d, 'PROPFIND', target.href, { headers: { depth: '0' } });
  if (probe.status === 207 || probe.status === 200) return;
  if (probe.status === 401 || probe.status === 403) throw new DavError(explain(probe.status));
  const segs = target.pathname.split('/').filter(Boolean);
  let last = 0;
  for (let i = 1; i <= segs.length; i++) {
    const u = new URL(target.href);
    u.pathname = '/' + segs.slice(0, i).join('/') + '/';
    last = (await request(d, 'MKCOL', u.href)).status;
  }
  // 201 新建成功；405/301 表示已存在
  if (![201, 405, 301, 200].includes(last)) throw new DavError(`创建备份目录失败：${explain(last)}`);
}

export interface DavFile {
  name: string;
  size: number;
}

export async function list(d: Dav): Promise<DavFile[]> {
  const res = await request(d, 'PROPFIND', dirUrl(d), { headers: { depth: '1' } });
  if (res.status !== 207 && res.status !== 200) throw new DavError(`读取备份目录失败：${explain(res.status)}`);
  const xml = await res.text();
  const self = decodeURIComponent(new URL(dirUrl(d)).pathname).replace(/\/+$/, '');
  const out: DavFile[] = [];
  for (const part of xml.split(/<(?:[\w-]+:)?response[\s>]/i).slice(1)) {
    const href = part.match(/<(?:[\w-]+:)?href[^>]*>([^<]+)</i)?.[1];
    if (!href) continue;
    let p: string;
    try {
      p = decodeURIComponent(href.startsWith('http') ? new URL(href).pathname : href).replace(/\/+$/, '');
    } catch {
      continue;
    }
    if (p === self) continue;
    const size = Number(part.match(/<(?:[\w-]+:)?getcontentlength[^>]*>(\d+)</i)?.[1] ?? -1);
    out.push({ name: p.split('/').pop() ?? '', size });
  }
  return out;
}

export async function put(d: Dav, name: string, data: Buffer) {
  const res = await request(d, 'PUT', dirUrl(d) + encodeURIComponent(name), {
    headers: { 'content-type': 'application/octet-stream' },
    body: new Uint8Array(data),
  });
  if (res.status < 200 || res.status >= 300) throw new DavError(`上传失败：${explain(res.status)}`);
}

export async function download(d: Dav, name: string): Promise<Buffer> {
  const res = await request(d, 'GET', dirUrl(d) + encodeURIComponent(name));
  if (res.status !== 200) throw new DavError(`下载备份失败：${explain(res.status)}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function remove(d: Dav, name: string) {
  const res = await request(d, 'DELETE', dirUrl(d) + encodeURIComponent(name));
  if (res.status >= 300 && res.status !== 404) throw new DavError(`删除旧备份失败：${explain(res.status)}`);
}

/** 上传后校验：文件要能在目录里查到，且大小一致。部分网盘有延迟，所以重试几次 */
export async function verify(d: Dav, name: string, size: number) {
  let found: DavFile | undefined;
  for (let i = 0; i < 4; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 3000));
    found = (await list(d)).find((f) => f.name === name);
    if (found && (found.size === size || found.size < 0)) return;
  }
  if (!found) throw new DavError('上传后在网盘里找不到备份文件，该存储可能不支持上传');
  throw new DavError(`上传后文件大小不一致（本地 ${size}，网盘 ${found.size}）`);
}

/** 设置页"测试"按钮：建目录、写入、校验、删除 */
export async function testDav(d: Dav) {
  await ensureDir(d);
  const name = `diary-test-${Date.now()}.txt`;
  const data = Buffer.from('english-diary webdav test');
  await put(d, name, data);
  await verify(d, name, data.length);
  await remove(d, name);
}
