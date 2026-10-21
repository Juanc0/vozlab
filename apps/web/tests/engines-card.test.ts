/**
 * The title of a card is wrapped the **same way** in the two engines.
 *
 * The card of a node is a **pure** module (`$lib/graph/node-card`): the
 * measurer is injected and the wrapping is deterministic. The picture of
 * Sigma — the card it cannot draw with its own labels — is built from the
 * same module, so a title that is wrapped in four lines in Cytoscape is
 * wrapped in the same four lines in Sigma.
 *
 * A difference here would be a bug in one of the two: the test says it
 * out loud.
 */

import { describe, expect, it } from 'vitest';
import { toNodeElement } from '$lib/graph/elements';
import { createEstimateMeasurer, nodeCardSize } from '$lib/graph/node-card';
import { cardTextureFor } from '$lib/dev/engines/card-texture';
import { NODE_A, NODE_B, NODE_C } from './fixtures/graph';

/** The measurer of the test: a deterministic one, not the canvas. */
const measure = createEstimateMeasurer();

const TITLES = [
  NODE_A.title,
  NODE_B.title,
  NODE_C.title,
  'El estacionamiento de la plataforma elevada del campus norte',
  'Una relación de la ventana de exploración con un título muy largo',
  'Corto'
];

describe('the wrapping of the title', () => {
  it('is the same in the canvas of Cytoscape and in the picture of Sigma', () => {
    for (const title of TITLES) {
      const node = { ...NODE_A, title };

      // The picture of Sigma.
      const texture = cardTextureFor(node, { measure, locale: 'es' });

      // The card of Cytoscape: the same pure module, the same measurer.
      const card = nodeCardSize(title, {
        measure,
        width: 140,
        meta: 'Problema',
        body: ''
      });

      expect(texture.lines).toEqual(card.lines);
      expect(texture.lines.join('\n')).toBe(card.text);
    }
  });

  it('is the same in the element of Cytoscape and in the picture of Sigma', () => {
    const element = toNodeElement(NODE_A, { measure, locale: 'es' });
    const texture = cardTextureFor(NODE_A, { measure, locale: 'es' });

    expect(element.data.label).toBe(texture.lines.join('\n'));
    expect(texture.lines.length).toBeGreaterThan(0);
  });

  it('never breaks a word', () => {
    const title = `El Estacionamiento de la plataforma elevada`;
    const texture = cardTextureFor({ ...NODE_A, title }, { measure, locale: 'es' });

    // The long word is whole, in one line.
    const words = texture.lines.flatMap((line) => line.split(' '));
    expect(words).toContain('Estacionamiento');

    // No line holds a piece of it: a line that carries the beginning of
    // the word carries the whole of it.
    for (const line of texture.lines) {
      if (line.includes('Estacionamien')) {
        expect(line).toContain('Estacionamiento');
      }
    }
  });
});
