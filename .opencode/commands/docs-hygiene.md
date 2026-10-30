---
description: Run the documentation hygiene gate and repair what it reports.
---

Run `bash scripts/docs-hygiene.sh` and read its four sections (links, heredoc
artifacts, dead path references, process debris).

- If green: report "DOCS HYGIENE OK" with the counts it prints; change nothing.
- If red, fix in place, respecting the conventions already encoded in the
  script and `docs/README.md`:
  - **links:** a broken relative link is stale — repoint it or, if the target
    was deleted, drop the sentence; never recreate the dead file.
  - **heredoc artifacts:** remove the tail (`EOF`/stray `echo created`) and
    verify the file still parses (`bash -n`, `docker compose config`,
    `yaml.safe_load`).
  - **dead refs:** repoint to the current path (`docs/components/`,
    `docs/ops/`, `docs/knowledge/`); a legitimate historical mention may be
    whitelisted by rewording to past tense ("migrated from"), not by widening
    the grep.
  - **process debris:** move finished task/status/plan docs to
    `docs/archive/` (never delete) and re-run until green.
- Commit anything you changed: `docs(hygiene): <what>` — separately from any
  feature work in flight.
