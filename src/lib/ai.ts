import Anthropic from '@anthropic-ai/sdk';
import { allSettings } from './settings';

export type Protocol = 'openai' | 'anthropic' | 'gemini';

export interface AiConfig {
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 单次请求的超时，默认 3 分钟；测试连接时用更短的 */
  timeoutMs?: number;
}

/** 给用户看的错误（中文、可操作） */
export class AiError extends Error {}

const TIMEOUT_MS = 180_000;

function timeoutMessage(cfg: AiConfig) {
  const sec = Math.round((cfg.timeoutMs ?? TIMEOUT_MS) / 1000);
  return `等了 ${sec} 秒，模型 ${cfg.model} 没有回应。接口地址和密钥可能没问题，是这个模型在服务商或中转站那边不可用，换一个模型试试。`;
}

export function aiConfigFromSettings(override: Partial<AiConfig> = {}): AiConfig {
  const s = allSettings();
  const cfg: AiConfig = {
    protocol: (override.protocol || s.ai_protocol || 'openai') as Protocol,
    baseUrl: (override.baseUrl ?? s.ai_base_url ?? '').trim(),
    apiKey: (override.apiKey || s.ai_api_key || '').trim(),
    model: (override.model ?? s.ai_model ?? '').trim(),
  };
  if (!cfg.apiKey) throw new AiError('还没有填写 API 密钥，请先到"设置"里配置 AI。');
  if (!cfg.model) throw new AiError('还没有填写模型名称，请先到"设置"里配置 AI。');
  return cfg;
}

function trimSlash(u: string) {
  return u.replace(/\/+$/, '');
}

function statusMessage(status: number, body: string) {
  const detail = body.slice(0, 300);
  if (status === 401 || status === 403) return `API 密钥无效或没有权限（${status}）。${detail}`;
  if (status === 404) return `接口地址或模型名称不对（404）。${detail}`;
  if (status === 429) return `请求太频繁或额度不足（429），请稍后再试。${detail}`;
  if (status >= 500) return `AI 服务暂时出错（${status}），请稍后重试。${detail}`;
  return `AI 接口返回错误（${status}）。${detail}`;
}

async function postJson(cfg: AiConfig, url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new AiError(timeoutMessage(cfg));
    throw new AiError(`连不上 AI 接口，请检查接口地址和网络。（${(e as Error).message}）`);
  }
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

async function callOpenAi(cfg: AiConfig, system: string, user: string) {
  const url = `${trimSlash(cfg.baseUrl || 'https://api.openai.com/v1')}/chat/completions`;
  const headers = { authorization: `Bearer ${cfg.apiKey}` };
  const base = {
    model: cfg.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  let r = await postJson(cfg, url, headers, { ...base, response_format: { type: 'json_object' } });
  // 有些模型或中转不支持 response_format，去掉再试一次
  if (r.status === 400 || r.status === 422) r = await postJson(cfg, url, headers, base);
  if (!r.ok) throw new AiError(statusMessage(r.status, r.text));
  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = JSON.parse(r.text);
  } catch {
    throw new AiError('AI 接口返回的不是 JSON，接口地址可能不对（OpenAI 兼容地址通常以 /v1 结尾）。');
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AiError('AI 返回了空内容，请重试。');
  // 推理模型可能把思考过程放在 <think> 里
  return content.replace(/<think>[\s\S]*?<\/think>/g, '');
}

async function callAnthropic(cfg: AiConfig, system: string, user: string) {
  const baseURL = trimSlash(cfg.baseUrl).replace(/\/v1$/, '') || undefined;
  const client = new Anthropic({ apiKey: cfg.apiKey, baseURL, timeout: cfg.timeoutMs ?? TIMEOUT_MS, maxRetries: cfg.timeoutMs ? 0 : 1 });
  try {
    const res = await client.messages.create({
      model: cfg.model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') throw new AiError('模型拒绝处理这篇内容，可以换个模型再试。');
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    if (!text) throw new AiError('AI 返回了空内容，请重试。');
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError(statusMessage(401, e.message));
    if (e instanceof Anthropic.NotFoundError) throw new AiError(statusMessage(404, e.message));
    if (e instanceof Anthropic.RateLimitError) throw new AiError(statusMessage(429, e.message));
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new AiError(timeoutMessage(cfg));
    if (e instanceof Anthropic.APIConnectionError)
      throw new AiError(`连不上 AI 接口，请检查接口地址和网络。（${e.message}）`);
    if (e instanceof Anthropic.APIError) throw new AiError(statusMessage(e.status ?? 0, e.message));
    throw e;
  }
}

async function callGemini(cfg: AiConfig, system: string, user: string) {
  const base = trimSlash(cfg.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/v1beta$/, '');
  const url = `${base}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
  const r = await postJson(
    cfg,
    url,
    { 'x-goog-api-key': cfg.apiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json' },
    },
  );
  if (!r.ok) throw new AiError(statusMessage(r.status, r.text));
  let data: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  try {
    data = JSON.parse(r.text);
  } catch {
    throw new AiError('AI 接口返回的不是 JSON，接口地址可能不对。');
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new AiError('AI 返回了空内容，请重试。');
  return text;
}

export async function callModel(cfg: AiConfig, system: string, user: string): Promise<string> {
  if (cfg.protocol === 'anthropic') return callAnthropic(cfg, system, user);
  if (cfg.protocol === 'gemini') return callGemini(cfg, system, user);
  return callOpenAi(cfg, system, user);
}

/** 从模型输出里取出 JSON 对象（容忍代码块包裹和前后多余文字） */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no json');
  return JSON.parse(cleaned.slice(start, end + 1));
}
