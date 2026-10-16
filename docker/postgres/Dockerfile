# VozLab Postgres: PostgreSQL 18 + Apache AGE (graph) + pgvector (embeddings)
#
# Strategy: start from the OFFICIAL Apache AGE image — AGE is the fragile part
# to build, and Apache ships a tested binary for PG18 (release_PG18_1.8.0). We
# only add pgvector from the PostgreSQL PGDG apt repository (already configured
# in the upstream `postgres:18` base that apache/age is built upon).
#
# This avoids compiling AGE from source and keeps both extensions sourced from
# their official maintainers (Apache + PGDG), which is safer for supply-chain
# review than pulling a third-party community image that bundles both.
#
# Resulting size: ~175 MB compressed (AGE base ~174 MB + pgvector ~1 MB).
FROM apache/age:release_PG18_1.8.0

# AGE is preloaded via the base image CMD: postgres -c shared_preload_libraries=age
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-18-pgvector \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Sanity check at build time: both extension control files must be present.
RUN test -f "$(pg_config --sharedir)/extension/age.control" \
 && test -f "$(pg_config --sharedir)/extension/vector.control" \
 && echo "AGE + pgvector present"
