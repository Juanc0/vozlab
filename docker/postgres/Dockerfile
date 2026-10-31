# VozLab Postgres: PostgreSQL 18 + pgvector (embeddings)
#
# Apache AGE was removed per ADR-0027 (not used by code; not offered by
# managed PostgreSQL). Only pgvector (>= 0.8.0, for iterative scans, F-04)
# is installed from the PGDG apt repository.
FROM postgres:18

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-18-pgvector \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Sanity check at build time: pgvector control file must be present and
# its default version must be >= 0.8.0.
RUN test -f "$(pg_config --sharedir)/extension/vector.control" \
 && grep -Eq "default_version[[:space:]]*=[[:space:]]*'0\.[89]\.|default_version[[:space:]]*=[[:space:]]*'[1-9]" \
      "$(pg_config --sharedir)/extension/vector.control" \
 && echo "pgvector >= 0.8.0 present"