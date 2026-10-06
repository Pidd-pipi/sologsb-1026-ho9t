// Carbon 组件事件取值辅助（与旧版页面一致的宽松事件解析）

export function readText(event: Event): string {
  const custom = event as CustomEvent<{ value?: string; text?: string } | string | number>;
  if (typeof custom.detail === 'string') return custom.detail;
  if (typeof custom.detail === 'number') return String(custom.detail);
  if (custom.detail?.value) return custom.detail.value;
  if (custom.detail?.text) return custom.detail.text;
  const target = (event.currentTarget ?? event.target) as HTMLInputElement | HTMLTextAreaElement | null;
  return target?.value ?? '';
}

export function readNumber(event: Event): number {
  return Number(readText(event));
}

export function readChecked(event: Event): boolean {
  const custom = event as CustomEvent<{ checked?: boolean } | boolean>;
  if (typeof custom.detail === 'boolean') return custom.detail;
  if (typeof custom.detail?.checked === 'boolean') return custom.detail.checked;
  const target = (event.currentTarget ?? event.target) as HTMLInputElement | null;
  return Boolean(target?.checked);
}

export function parsePhonemes(value: string): string[] {
  return value
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
