/**
 * The copy of the messages of the interface.
 *
 * The validators answer with a **message** (the key of its copy and its
 * values), not with a sentence: the copy lives in the dictionary. The
 * tests render the message with the default language of the interface, so
 * they pin the copy the user actually reads.
 */

import { dictionaries, interpolate, type Message } from '$lib/i18n';

/** The Spanish copy of a message — the language of the interface. */
export function spanish(message: Message): string {
  return interpolate(dictionaries.es[message.key], message.params);
}
