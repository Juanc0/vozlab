import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSvgPainter,
  type SvgPainter
} from '$lib/graph/svg/painter';
import { EDGE, EDGE_B, EDGE_C, NODE_A, NODE_B, NODE_C } from './fixtures/graph';

const originalMatchMedia = window.matchMedia;

function motion(reduced: boolean): void {
  window.matchMedia = vi.fn(() => ({ matches: reduced })) as unknown as typeof window.matchMedia;
}

describe('the detail of a card of the SVG painter', () => {
  let container: HTMLDivElement;
  let painter: SvgPainter;
  let toggled: string[];

  beforeEach(() => {
    motion(false);
    container = document.createElement('div');
    toggled = [];
    painter = createSvgPainter({
      container,
      label: 'La imagen de la comparación',
      locale: 'es',
      onselect: () => {},
      ontoggle: (nodeId) => {
        toggled.push(nodeId);
      }
    });
  });

  afterEach(() => {
    painter.destroy();
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  function svg(): SVGSVGElement {
    const root = container.querySelector('svg');
    if (root === null) throw new Error('no svg');
    return root as SVGSVGElement;
  }

  function card(nodeId: string): SVGGElement {
    const found = svg().querySelector(`g.vozlab-svg-card[data-node-id="${nodeId}"]`);
    if (found === null) throw new Error(`no card ${nodeId}`);
    return found as SVGGElement;
  }

  function draw(expanded: string[] = []): void {
    painter.setElements({
      nodes: [NODE_A, NODE_B, NODE_C],
      edges: [EDGE, EDGE_B, EDGE_C],
      expandedIds: new Set(expanded),
      edgeStyle: 'bezier',
      selectedNodeId: null,
      presentedNodeId: null
    });
  }

  it('shows the type and the status on a closed card', () => {
    draw();
    const meta = card(NODE_A.id).querySelector('text.vozlab-svg-meta');
    expect(meta?.textContent).toContain('Problema');
    expect(meta?.textContent).toContain('Activo');
  });

  it('shows the description and each attribute on an expanded card', () => {
    draw([NODE_A.id]);
    const body = card(NODE_A.id).querySelector('text.vozlab-svg-body');
    const text = [...(body?.querySelectorAll('tspan') ?? [])].map((t) => t.textContent ?? '').join(' ');
    expect(text).toContain('Reported by the students of the faculty.');
    expect(text).toContain('source: runbook');
    expect(text).toContain('severity: 3');
  });

  it('draws a rule between the description and the attributes', () => {
    draw([NODE_A.id]);
    const rules = card(NODE_A.id).querySelectorAll('line');
    expect(rules.length).toBe(1);
  });

  it('is taller when expanded', () => {
    draw();
    const collapsed = Number(card(NODE_A.id).querySelector('rect.vozlab-svg-card-box')?.getAttribute('height'));
    draw([NODE_A.id]);
    const expanded = Number(card(NODE_A.id).querySelector('rect.vozlab-svg-card-box')?.getAttribute('height'));
    expect(expanded).toBeGreaterThan(collapsed);
  });

  it('renders a card without description or attributes without an empty separator', () => {
    draw([NODE_B.id]);
    const c = card(NODE_B.id);
    expect(c.querySelectorAll('line')).toHaveLength(0);
    expect(c.querySelector('text.vozlab-svg-body')).toBeNull();
  });

  it('expands on a double click', () => {
    draw();
    card(NODE_A.id).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(toggled.at(-1)).toBe(NODE_A.id);
  });

  it('expands from the badge', () => {
    draw();
    const badge = card(NODE_A.id).querySelector('g.vozlab-svg-badge');
    badge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggled.at(-1)).toBe(NODE_A.id);
  });

  it('opens only the node whose card is toggled', () => {
    draw([NODE_A.id]);
    expect(card(NODE_A.id)).toHaveAttribute('aria-expanded', 'true');
    expect(card(NODE_B.id)).toHaveAttribute('aria-expanded', 'false');
  });
});
