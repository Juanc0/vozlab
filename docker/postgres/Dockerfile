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

# Pin/verify pgvector >= 0.8.0 at build time (F-04 requires iterative scans,
# introduced in pgvector 0.8.0). Fail the build if the package is older.
RUN v="$(sed -n 's/^default_version[[:space:]]*=[[:space:]]*\x27\([^\x27]*\)\x27.*/\1/p' "$(pg_config --sharedir)/extension/vector.control")" \
 && echo "pgvector default_version=$v" \
 && python3 -c "import sys; v='$v'.split('.'); ok=int(v[0])>0 or (int(v[0])==0 and int(v[1])>=8); sys.exit(0 if ok else 1)" \
 || (echo "pgvector < 0.8.0 is not supported (F-04)" >&2; exit 1)

# Sanity check at build time: both extension control files must be present.
RUN test -f "$(pg_config --sharedir)/extension/age.control" \
 && test -f "$(pg_config --sharedir)/extension/vector.control" \
 && echo "AGE + pgvector present"
