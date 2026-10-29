# 13 — Internationalisation: interface, content, vocabulary and models

> **Knowledge doc** — verified 2026-10-29 (no content `lang` column exists). Graduation path in [README.md](README.md).

You asked for a rethought language strategy for both content and interface, with the options, their pros and cons, and
their implications. This file separates the six places where language matters, because each has a different answer.

## 1. The judgment

- **The interface is in good shape and should stay.** The Spanish and English dictionaries are typed so that a missing or
  misspelled key does not compile, the server renders the right `lang` attribute, and dates and numbers follow the locale.
  Replacing it now would be a cost with little return. [repo] ROADMAP 3.10
- **The content has no language at all.** Records, proposals, posts and threads carry no language tag, so the platform
  cannot know what it is storing, cannot choose a model or a sort order per language, and cannot tell a reader which
  language a record is written in. This is the real gap. [repo] schema search for `lang`/`locale`: none on content tables
- **The places where language changes the result are the AI and the detection of personal data,** not the screens. The
  embedding model, the chat model, the prompts and the masking rules are English-centred today. For Spanish-first content,
  they are the decisions that most affect quality. [repo][web] `06`
- **Decide the languages before the model.** The model choice depends on which languages must work well, and the content
  strategy depends on whether anything is translated at all. Those are product decisions (D-11 in `15`).

## 2. The six places where language matters, and their current state

| # | Place | What it is | Current state (verified) | Gap |
| --- | --- | --- | --- | --- |
| 1 | **Interface copy** | Labels, messages, help, the toast and the errors the web app owns | Spanish default, English second. Two dictionaries of about 830 and 765 lines, typed so that `en` cannot drift from `es`. Language chosen by a cookie, rendered on the server, switchable without reload. | Few. No pluralisation or ICU message format; no translator tooling. Fine for two languages. |
| 2 | **API messages** | Error codes and messages | Codes are English and stable; the message is the API's English text. The web app maps codes to its own copy. | Acceptable, if clients always map codes. |
| 3 | **Vocabulary (ontology)** | Class and property names, descriptions, relation names | Locale maps in the database (`{"en": …, "es": …}`). The API returns the whole map; the client picks its language. Statuses are a typed vocabulary. | Activation does not appear to require a complete set of locales (G8, to confirm). |
| 4 | **Content** | Node titles and descriptions, proposal justifications, posts, thread titles | **No language field.** Seeded content is Spanish by convention. | Unmodelled. Cannot route, sort, search or label by language. |
| 5 | **Models and prompts** | Embeddings, the chat model, the system prompts | Embedder: `nomic-embed-text`, English-centred. Chat: `llama3.1:8b`, English prompts over Spanish content. No evaluation. | Quality for Spanish unknown; the largest technical risk for language. |
| 6 | **Personal-data detection** | The masking rules that protect people in listening records | Rules for emails, phone numbers, digit runs and id-like groups are language-neutral. Name detection uses English and Spanish term lists, heuristically. | Spanish names with particles and accents, national identifier formats and the Spanish use of separators are not tested. |

Two smaller items belong here too:

- **Ordering.** Several sorts call `localeCompare` without an explicit locale (for example in the node form and the
  inspector). The result depends on the runtime's default locale, so the server and the browser may order the same list
  differently, and an accented initial may land in the wrong place. Pass an explicit locale (`es`, or the user's
  choice) everywhere. [repo] `apps/web/src/lib/ontology/node-form.ts`, `InspectorAttributes.svelte`.
- **Time.** Timestamps are stored with time zones (`timestamptz`) [repo]. Display uses `Intl` with the user's locale.
  The institution's time zone should be a setting, not an assumption. [supuesto]

## 3. Interface: the options, compared

| Option | How it works | Strengths | Weaknesses | Verdict |
| --- | --- | --- | --- | --- |
| **A. Keep the current typed dictionary** | Nested `as const` objects; `en` declared as the shape of `es`; runtime lookup | Zero dependencies; compile-time completeness already in place; tested | No plural or gender rules beyond what the code adds; no translator tooling (no PO, XLIFF or a translation service); manual extraction | **Keep** for two languages. |
| **B. Paraglide JS (inlang)** | A compiler turns message files into typed functions; unused messages are removed by the bundler; SSR is supported | Recommended by the Svelte CLI for SvelteKit (`sv add paraglide`) [web]; typed; tree-shakeable; small runtime; localised URLs available | Generated files in the repository (merge conflicts when branches touch messages); a migration of about 1 600 lines of dictionary; a learning curve | **Adopt when** three or more locales are needed, or translators must work outside the codebase. Migration effort: medium. |
| **C. svelte-i18n** | Runtime store with ICU message syntax | ICU support; mature in the ecosystem | Heavier at runtime; a module-level store can leak one visitor's language into another's server render unless wired through context (the same problem this codebase already solved) [web] | Not preferred. |
| **D. typesafe-i18n** | Generated TypeScript from a dictionary, framework-agnostic | Strong typing; works outside Svelte | Generated files; a watcher process; the project's activity has been described as slower [web] | Not preferred. |
| **E. Wuchale (gettext PO)** | Extracts strings from Svelte components into PO files | Translators can use PO tooling; extraction is automatic | Newer; the ecosystem is smaller; verify maturity before adoption [web] | Watch. |
| **F. A translation management system** (Crowdin, Lokalise, Weblate and similar) | Hosted or self-hosted platform that feeds one of the libraries above | Translators work in a UI; review workflow; history | Cost (hosted) or operation (self-hosted); a data processor if hosted | Use only when translators join the project. |

**Judgment:** keep **A** for Spanish and English. Move to **B** when a third locale is confirmed or translators are involved.
The migration is mechanical and can be scripted, which makes it a safe later step.

## 4. Content: the options, compared

| Option | How it works | Strengths | Weaknesses | Verdict |
| --- | --- | --- | --- | --- |
| **1. Monolingual content, interface translated** | Each workspace writes in one language. The UI follows the reader's choice. | Simplest. Matches a single Spanish-speaking institution. | Mixed-language communities cannot write in their own language and be read in another. | **Default now**, with the language recorded (option 2's first step). |
| **2. Original language recorded on every item** | Each node, edge, proposal, thread and post has a `lang` (BCP 47, for example `es` or `es-CO`) set from the author's choice or the workspace default. The UI shows the language. | Cheap. Enables language-aware sorting, search, embeddings and reporting. Honest about what is written where. | Needs one column per table and a default; the author must be able to set it. | **Recommended first step.** |
| **3. Per-field translation table** | `translations(entity, field, lang, text, origin: human or machine, reviewed_by, reviewed_at)`. Originals are kept; translations are separate records. | Strong for curated content (ontology, statements, guidance). Keeps provenance. | Divergence between an original and its translation; review workload; the schema grows. | **Later**, for content that must be read in several languages (for example public summaries). |
| **4. Machine translation at view time** | The client or server translates on demand through a model or a service | Cheap to build; works for any language pair | No provenance; different wording each time; content leaves the premises if the translator is hosted; disputes about meaning in governance content | **Not for governance content.** Acceptable only for reading aid, labelled as machine output, and only with a residency-compliant service. |
| **5. Separate tenant or workspace per language** | Each language is a silo | Simple to reason about | Breaks the community; duplicates the graph; defeats cross-language duplicate detection | **Reject.** |
| **6. Cross-lingual embeddings** | One multilingual vector space, so the Relator finds duplicates across languages without translation | No translation needed for the Relator; improves search across languages | Quality depends on the model; must be evaluated (section 5) | **Recommended** as the mechanism for cross-language analysis, subject to evaluation. |

**Recommendation:** option 2 now (a language tag on every content table, with a workspace default), option 6 when the model
is chosen, and option 3 only for curated content. Avoid option 4 for anything that participants argue about.

**Mixed-language content.** Accessibility guidelines (WCAG 3.1.2, Language of Parts) require that a passage in a different
language be marked as such, so that a screen reader pronounces it correctly. A post in Spanish that quotes an English
phrase should mark the phrase with its own `lang`. The interface does this for its own copy; the content should do it for
the text it contains, which requires the language tag of option 2 and a rule for quotes. [web][juicio]

## 5. Models: the decisions that carry most of the quality

The embedding and chat choices are developed in `06` §4. In brief, for language:

| Concern | Current | Required |
| --- | --- | --- |
| Embedding model | `nomic-embed-text` v1, English-centred | Evaluate `bge-m3`, `qwen3-embedding` and `nomic-embed-text-v2-moe` on Spanish records, with cross-lingual pairs if English content exists. A dimension change is a migration (`05` §4). |
| Chat model | `llama3.1:8b`, English prompts over Spanish content | Evaluate a multilingual model (for example Qwen3 8B or a Gemma 4 small variant) on Spanish verdicts and drafts. |
| Prompt language | English system prompts | Test both English and Spanish system prompts; the answer should be valid JSON in either case. |
| Output language | Unspecified | The `reason` and the draft `title` should follow the record's language. Make it an explicit instruction and measure it. |
| Language of stored AI output | Not recorded | Record the language of each agent-created text (provenance, `06` §8). |

## 6. Personal-data detection in Spanish

The masker is rule-based, which is the right design for speed and for auditability (`06` §3.3). Its weak points for Spanish
are specific:

- **Names.** Spanish names often include particles (`de`, `del`, `la`, `y`, `los`) and compound given names, and they carry
  accents. A capitalised-pair rule catches some of them and misses others, and it over-masks institutional phrases. The
  term lists are maintained by hand; they should be tested against a labelled Spanish corpus (`06` §7).
- **National identifiers.** Identifier formats differ by country (for example, the length and the check digit of a national
  identity number). Add the patterns for the institution's country, with a test for each. [supuesto: the jurisdiction]
- **Contact details.** Phone formats differ by country, and Spanish commonly writes them with spaces or dots. Test the
  formats the institution's people actually use.
- **Addresses and places.** Free text can contain a street or a building. These are hard for rules; a named-entity model for
  Spanish is the usual complement. Verify the model's licence and its accuracy on the corpus before use.

**Judgment:** keep the rules as the first layer, add a Spanish named-entity layer behind them, and measure the residual
names on the corpus. The target is a documented residual rate, not a claim of zero. The privacy text of the institution should
state the limit honestly.

## 7. Sorting, search and normalisation

| Concern | Recommendation | Note |
| --- | --- | --- |
| Sorting names and labels | Pass an explicit locale to `localeCompare` (`es`, or the user's choice) everywhere | The default depends on the runtime. [repo] |
| Accent-insensitive search | Already present in the root picker (ROADMAP 3.29) | Extend the same normalisation to the server if search moves there. |
| Full-text search, if added | PostgreSQL text search configuration per language (`spanish`, `english`), chosen by the record's `lang` | Requires option 2 first. |
| Case and diacritics in identifiers | Store identifiers in one normalised form; display the original | Avoids duplicates such as "Ana" and "Ana" with a different accent. |
| Dates | Store `timestamptz`; display in the institution's time zone and the reader's locale | The time zone is a tenant setting. |
| Numbers | `Intl.NumberFormat` (already used) | Decimal separators differ across Spanish-speaking countries. |

## 8. The API contract and internationalisation

- Keep **error codes** stable and in English; the client maps them (`docs/errors.md`).
- Keep **messages** as diagnostics for developers; do not show them to users without mapping.
- Return **ontology names as maps** (already the case, ROADMAP 3.18); let the client pick. Do not negotiate the language
  in the API, because that couples the response to a header and complicates caching.
- For content, return the `lang` of each item, so the client can label and order it.
- Use ISO 8601 with offsets for dates, and never localised strings in data.

## 9. Legal and accessibility texts

- Privacy notices, consent texts and terms of use must exist in the institution's language, and the Spanish version is the
  authoritative one if the institution's language is Spanish. A translation of a legal text is a legal document in its own
  right; do not produce it with a machine and publish it. [juicio]
- Interface copy that explains an AI decision must say, in each language, that the decision is a suggestion by an automated
  agent and that a person decides.

## 10. The phased plan

| Phase | Content | Effort | Depends on |
| --- | --- | --- | --- |
| **I. Record the language** | `lang` column on nodes, edges, proposals, threads and posts, with a workspace default; the form sets it; the UI shows it | Small (about a week) | Nothing |
| **II. Make the vocabulary complete** | Activation requires the locales of the workspace; explicit locale in every sort; `lang` marks on mixed-language text | Small to medium | Phase I |
| **III. Choose the models by evaluation** | Evaluate embedding and chat candidates on Spanish records; decide; migrate the vector dimension if needed; test prompts in both languages; record the output language | Medium (dominated by the evaluation) | The evaluation set (`06` §7); decisions D-06 and D-07 |
| **IV. Protect Spanish personal data** | Spanish name and identifier patterns; a named-entity layer; residual measurement | Medium | Phase III's corpus |
| **V. Translation workflow** | A translation table for curated content; reviewer workflow; PO or XLIFF if translators join; Paraglide when three or more locales are live | Medium to large | A decision to translate (D-11) |

## 11. Decisions I need from you

1. **Which languages must the interface and the content support in the next twelve months?** Spanish only, Spanish and English,
   or more? (D-11)
2. **Will any content ever be translated for readers?** If yes, is it curated content only, or community content too?
3. **Which regional variant of Spanish** should the interface and the seeded content follow? The differences are mainly
   vocabulary and formality; a regional variant can be a setting. [supuesto]
4. **Will the community write in more than one language in the same workspace?** That decides whether option 6 (cross-lingual
   embeddings) is a requirement or a convenience.
5. **Are there national identifiers or sensitive categories in the listening sources?** That defines the masking patterns.
6. **What is the default language of a new workspace?** Spanish is the current default. Confirm.
