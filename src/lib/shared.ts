// 浏览器和服务端都能用的类型与常量（不要在这里引入任何服务端模块）

export type IssueType = 'chinese' | 'spelling' | 'grammar' | 'word_choice' | 'unnatural' | 'punctuation';
export type Severity = 'must' | 'suggest' | 'advanced';

export interface Issue {
  original: string;
  corrected: string;
  type: IssueType;
  category: string;
  severity: Severity;
  explanation: string;
}

export interface VocabSuggestion {
  term: string;
  phonetic: string;
  meaning: string;
  example: string;
  reason: 'chinese' | 'spelling' | 'upgrade';
  source: string;
}

export interface PhraseSuggestion {
  /** 固定搭配或句式，如 take sb. home */
  pattern: string;
  meaning: string;
  example: string;
  reason: 'mistake' | 'upgrade';
  source: string;
}

export interface ReviewResult {
  corrected_text: string;
  polished_text: string;
  praise: string;
  key_points: string[];
  issues: Issue[];
  vocab: VocabSuggestion[];
  /** 早期的批改记录里没有这一项 */
  phrases?: PhraseSuggestion[];
  level_estimate: string | null;
}

export interface ReviewView {
  id: number;
  original_text: string;
  created_at: string;
  model: string | null;
  result: ReviewResult;
}

export const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  chinese: '中文替代',
  spelling: '拼写',
  grammar: '语法',
  word_choice: '用词',
  unnatural: '不够地道',
  punctuation: '标点',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  must: '必须改',
  suggest: '建议改',
  advanced: '进阶表达',
};

export const VOCAB_REASON_LABEL: Record<string, string> = {
  chinese: '中文替代',
  spelling: '拼写',
  upgrade: '好表达',
  manual: '手动添加',
};

export const PHRASE_REASON_LABEL: Record<string, string> = {
  mistake: '这次用错的',
  upgrade: '好表达',
  manual: '手动添加',
};

export type VocabKind = 'word' | 'phrase';

export const LEVELS = [
  { code: 'A1', label: '入门', desc: '刚开始学，只会简单的词和短句' },
  { code: 'A2', label: '初中', desc: '能写简单句，时态和搭配常出错' },
  { code: 'B1', label: '高中', desc: '能写完整段落，表达不够地道' },
  { code: 'B2', label: '四级', desc: '基本流畅，想提升用词和句式' },
  { code: 'C1', label: '六级及以上', desc: '追求自然、准确、有变化的表达' },
] as const;

export function levelLabel(code: string) {
  return LEVELS.find((l) => l.code === code)?.label ?? code;
}

export interface LevelInfo {
  /** 批改实际使用的水平 */
  effective: string;
  /** 用户手动选的水平 */
  chosen: string;
  mode: 'auto' | 'manual';
  /** 根据最近几篇识别出的水平；样本不足时为 null */
  detected: string | null;
  samples: number;
}

export function countWords(text: string) {
  return (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length;
}

/** AI 厂商预设。模型名各家更新很快，除 Claude 外只给示例，由用户自己填 */
export const AI_PRESETS = [
  { id: 'anthropic', name: 'Claude（Anthropic）', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5', hint: 'claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5' },
  { id: 'openai', name: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', hint: '填 OpenAI 的模型名' },
  { id: 'gemini', name: 'Gemini（Google）', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: '', hint: '填 Gemini 的模型名' },
  { id: 'deepseek', name: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hint: 'deepseek-chat' },
  { id: 'qwen', name: '通义千问（阿里云百炼）', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '', hint: '例如 qwen-plus' },
  { id: 'zhipu', name: '智谱 GLM', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: '', hint: '填智谱的模型名' },
  { id: 'moonshot', name: 'Kimi（Moonshot）', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: '', hint: '填 Moonshot 的模型名' },
  { id: 'custom', name: '自定义 / 中转', protocol: 'openai', baseUrl: '', model: '', hint: '填中转站提供的模型名' },
] as const;
