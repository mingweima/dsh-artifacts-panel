// 模板：并行审计 + 对抗复核（两段式 fan-out）
// 由 Lead 读取后按任务改写，作为 `workflow` 工具的 script 传入。
// 预期 args: { items: [{ id, target, question }], context?: string }
// 返回: { total, ok, issues, blocked, findings: [...] }

const items = args.items ?? [];
if (!Array.isArray(items) || items.length === 0) {
  return { error: 'args.items 不能为空；每项形如 { id, target, question }' };
}

const context = args.context ?? '';

const FINDING = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ok', 'issue', 'blocked'] },
    summary: { type: 'string' },
    evidence: { type: 'string' },
    details: { type: 'array', items: { type: 'string' } }
  },
  required: ['verdict', 'summary', 'evidence'],
  additionalProperties: false
};

const REVIEW = {
  type: 'object',
  properties: {
    confirmed: { type: 'boolean' },
    reason: { type: 'string' },
    correction: { type: 'string' }
  },
  required: ['confirmed', 'reason'],
  additionalProperties: false
};

phase('审计');
const findings = await pipeline(
  items,
  async (_prev, item, index) => {
    const id = item.id ?? `item-${index + 1}`;
    log(`审计 ${id}: ${item.target}`);
    return await agent(
      [
        '你在共享 workspace 中执行只读审计，不要修改任何文件。',
        context ? `任务背景：${context}` : '',
        `审计对象：${item.target}`,
        `要回答的问题：${item.question}`,
        '要求：结论必须带证据（文件路径+行号 / URL / 命令输出）；分不清事实与推断时明确标注。'
      ]
        .filter(Boolean)
        .join('\n'),
      { label: `audit-${id}`, phase: '审计', schema: FINDING }
    );
  },
  async (finding, item, index) => {
    if (!finding || finding.verdict === 'ok') return finding;

    // 对「有问题」的发现做一次独立对抗复核，降低误报。
    const id = item.id ?? `item-${index + 1}`;
    log(`复核 ${id} 的发现`);
    const review = await agent(
      [
        '你是独立的对抗复核者。下面是另一个 agent 的审计发现，请尝试反驳它。',
        `原问题：${item.question}`,
        `目标：${item.target}`,
        `原始发现：${JSON.stringify(finding)}`,
        '只基于仓库事实判断：该发现是否成立？证据是否充分？给出 confirmed 与理由；若部分成立，写出修正后的结论。'
      ].join('\n'),
      { label: `review-${id}`, phase: '复核', schema: REVIEW }
    );

    if (!review) return { ...finding, review: { confirmed: false, reason: '复核 agent 失败' } };
    if (!review.confirmed) {
      return { ...finding, review, summary: `${finding.summary}（复核未确认：${review.reason}）` };
    }
    return { ...finding, review, correction: review.correction };
  }
);

const clean = findings.filter(Boolean);
const count = (verdict) => clean.filter((f) => f.verdict === verdict).length;

return {
  total: items.length,
  completed: clean.length,
  ok: count('ok'),
  issues: count('issue'),
  blocked: count('blocked'),
  dropped: items.length - clean.length,
  findings: clean
};
