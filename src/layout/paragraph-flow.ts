import type { Inline } from '../domain/document';

export type ParagraphLine = { end: number; bottom: number };

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function textBoundaries(text: string): number[] {
  return Array.from(segmenter.segment(text), ({ index, segment }) => index + segment.length);
}

function inlineUnits(node: Inline): number {
  if (node.kind === 'text') return textBoundaries(node.value).length;
  if ('children' in node) return paragraphUnits(node.children);
  return 1;
}

export function paragraphUnits(nodes: Inline[]): number {
  return nodes.reduce((total, node) => total + inlineUnits(node), 0);
}

export function splitInlines(nodes: Inline[], remaining: number): [Inline[], Inline[]] {
  const head: Inline[] = [];
  for (const [index, node] of nodes.entries()) {
    if (remaining === 0) return [head, nodes.slice(index)];
    const units = inlineUnits(node);
    if (remaining >= units) {
      head.push(node);
      remaining -= units;
    } else if (node.kind === 'text') {
      const split = textBoundaries(node.value)[remaining - 1];
      return [[...head, { ...node, value: node.value.slice(0, split) }], [{ ...node, value: node.value.slice(split) }, ...nodes.slice(index + 1)]];
    } else if ('children' in node) {
      const [before, after] = splitInlines(node.children, remaining);
      return [[...head, { ...node, children: before }], [{ ...node, children: after }, ...nodes.slice(index + 1)]];
    }
  }
  return [head, []];
}

export function measureParagraphLines(paragraph: HTMLElement): ParagraphLine[] {
  const style = getComputedStyle(paragraph);
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
  const bounds = paragraph.getBoundingClientRect();
  const range = document.createRange();
  const lines: ParagraphLine[] = [];
  let lastCenter: number | undefined;
  let units = 0;

  const add = (rect?: DOMRect) => {
    units += 1;
    if (!rect?.height) return;
    const center = (rect.top + rect.bottom) / 2;
    if (lastCenter !== undefined && Math.abs(center - lastCenter) > lineHeight * 0.55) {
      const bottom = Math.min(bounds.height, Math.max(lineHeight, center - bounds.top - lineHeight / 2));
      lines.push({ end: units - 1, bottom: Math.max(lines.at(-1)?.bottom ?? 0, bottom) });
      lastCenter = center;
    }
    lastCenter ??= center;
  };

  const visit = (node: Node) => {
    if (node instanceof Text) {
      let start = 0;
      for (const end of textBoundaries(node.data)) {
        range.setStart(node, start);
        range.setEnd(node, end);
        add(range.getClientRects()[0]);
        start = end;
      }
    } else if (node instanceof HTMLElement && node.matches('br, .inline-code, .inline-math')) {
      add(node.getBoundingClientRect());
    } else {
      node.childNodes.forEach(visit);
    }
  };
  paragraph.childNodes.forEach(visit);
  if (units) lines.push({ end: units, bottom: bounds.height });
  return lines;
}
