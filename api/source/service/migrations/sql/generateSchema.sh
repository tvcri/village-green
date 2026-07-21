#!/bin/bash

# Regenerate the fresh-install scaffold SQL in current/ from a migrated 'vg'
# database. These two files are how a fresh install builds its schema, and the
# test/api harness boots off them as well.
#
#   ./generateSchema.sh                          # run INSIDE a DB container
#   ./generateSchema.sh --container <name>       # run from the HOST
#   ./generateSchema.sh --container              # ...using $VG_SCHEMA_DB_CONTAINER
#                                                #    or village-green-orch-db-1
#
# --container re-executes this same script inside the named container (via
# docker cp + docker exec) and copies the output back, so mysqldump's version
# always matches the server's.
#
# WHEN TO RUN THIS: after adding a migration. The scaffold is NOT regenerated
# automatically — a new migration is invisible to fresh installs until someone
# runs this, and stale output shows up in the test harness too.
#
# The source DB must already be migrated to head. The dump captures the
# _migrations table, so every migration it marks executed must also have its
# schema and static data actually present in that DB.
#
# If a migration seeds CATALOG rows, add its table(s) to static_data_tables
# below. Otherwise the dump marks the migration executed while shipping none of
# its rows, and a fresh install comes up with that catalog empty — how the 0013
# role catalog went missing until PR #69 (every role_grant insert then hit
# fk_role_grant_role). Per-install DATA migrations (e.g. 0013's role_grant /
# village_grant backfill) stay out: dumping them would ship one deployment's
# rows to every other.
#
# Output (both overwritten in place; review git diff, then commit):
#   current/10-vg-tables.sql   schema + views, no data
#   current/20-vg-static.sql   static catalog rows + _migrations

#NEEDS: mysqldump (or docker, with --container)

set -euo pipefail

#List of table names for static data.
static_data_tables="capability role role_permission _migrations"

# --container: re-exec this script inside a DB container, copy the results back.
if [ "${1:-}" = "--container" ]; then
  container="${2:-${VG_SCHEMA_DB_CONTAINER:-village-green-orch-db-1}}"
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if ! docker inspect "$container" >/dev/null 2>&1; then
    echo "error: no such container: $container" >&2
    echo "usage: $(basename "$0") --container [name]   (or set VG_SCHEMA_DB_CONTAINER)" >&2
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
  exit 0
fi

# Export the schema of all tables in the 'vg' database into a SQL file,
# removing any AUTO_INCREMENT attribute values to prevent conflicts with existing data when imported
# and removing statements that trigger a mysql2 bug when changing client character set
# The '--no-data' flag means no table row data will be dumped, only the schema.
# The '--no-create-db' flag prevents the inclusion of CREATE DATABASE statements in the dump.
# Views (active_member / active_volunteer) are included by mysqldump, so fresh
# installs get them without migration 0006 ever running.
mysqldump -h 127.0.0.1 -P 3306 -u root -prootpw --routines --events --no-data --no-create-db vg |
  sed --expression='s/ AUTO_INCREMENT=[0-9]\+//'  \
      --expression='s/DEFINER=`vg`@`%` *//' \
      --expression '/SQL SECURITY DEFINER/d' \
      --expression='s/;;/$/g' |
  awk 'tolower($0) !~ /character_set|set names/' > 10-vg-tables.sql

# Export only the data from specific tables listed in $static_data_tables into a separate SQL file.
# '--no-create-info' flag ensures that table creation statements are not included, just the row insertions.
mysqldump -h 127.0.0.1 -P 3306 -u root -prootpw --no-create-info vg $static_data_tables |
  awk 'tolower($0) !~ /character_set|set names/' > 20-vg-static.sql
