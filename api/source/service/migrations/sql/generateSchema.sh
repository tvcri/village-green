#!/bin/bash

# Use this script to generate the current schema and static data for the 'vg' database.
# It will produce two SQL scripts which will be used in the village green application to recreate a new database schema in its most recent state. 

#NEEDS: mysqldump

#How to use:
# 1. Ensure that the MySQL server is running and that the 'vg' database is accessible and in its most recent state.
# 2. Run this script from the command line.
# 3. When village green is started, it will automatically run the SQL scripts to create the database schema and insert the static data.


#List of table names for static data.
# Must include every table a migration seeds with catalog rows, or a fresh
# scaffold marks that migration executed while shipping none of its data.
# (role/role_permission come from 0013; role_grant/village_grant are per-install
# migrated data, not catalog, and are deliberately excluded.)
static_data_tables="capability role role_permission _migrations"

# Export the schema of all tables in the 'vg' database into a SQL file,
# removing any AUTO_INCREMENT attribute values to prevent conflicts with existing data when imported
# and removing statements that trigger a mysql2 bug when changing client character set
# The '--no-data' flag means no table row data will be dumped, only the schema.
# The '--no-create-db' flag prevents the inclusion of CREATE DATABASE statements in the dump.
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

