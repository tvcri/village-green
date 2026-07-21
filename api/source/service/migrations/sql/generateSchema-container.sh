#!/bin/bash

# Regenerate the fresh-install scaffold SQL in current/ by running
# generateSchema.sh inside a running DB container, so mysqldump's version
# matches the server's.
#
#   ./generateSchema-container.sh [container]
#
# container defaults to $VG_SCHEMA_DB_CONTAINER, else village-green-orch-db-1.
#
# WHEN TO RUN THIS: after adding a migration. The scaffold files are how a
# fresh install builds its schema, and they are NOT regenerated automatically —
# a new migration is invisible to new installs until someone runs this. The
# API test harness (test/api) boots off these same files, so stale output
# shows up there too.
#
# The source DB must already be migrated to head. The dump captures the
# _migrations table, so every migration it marks executed must also have its
# schema and static data actually present in that DB. If you add a migration
# that seeds catalog rows, add its table(s) to static_data_tables in
# generateSchema.sh as well — otherwise the dump marks the migration executed
# while shipping none of its rows (this is exactly how the 0013 role catalog
# went missing; see PR #69).
#
# Output (both overwritten in place, then commit them):
#   current/10-vg-tables.sql   schema only, no data
#   current/20-vg-static.sql   static catalog rows + _migrations

set -euo pipefail

container="${1:-${VG_SCHEMA_DB_CONTAINER:-village-green-orch-db-1}}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! docker inspect "$container" >/dev/null 2>&1; then
  echo "error: no such container: $container" >&2
  echo "usage: $(basename "$0") [container]   (or set VG_SCHEMA_DB_CONTAINER)" >&2
  exit 1
fi

echo "generating scaffold SQL from container: $container"

docker cp "$here/generateSchema.sh" "$container:/tmp/generateSchema.sh"
docker exec -i "$container" bash -c "cd /tmp && chmod +x generateSchema.sh && ./generateSchema.sh"

docker cp "$container:/tmp/10-vg-tables.sql" "$here/current/10-vg-tables.sql"
docker cp "$container:/tmp/20-vg-static.sql" "$here/current/20-vg-static.sql"

echo "wrote current/{10-vg-tables,20-vg-static}.sql"
echo
echo "sanity check — highest migrations marked executed in the dump:"
grep -oE "0[0-9]{3}-[a-z-]+\.js" "$here/current/20-vg-static.sql" | sort -u | tail -3
echo "review 'git diff' before committing."
