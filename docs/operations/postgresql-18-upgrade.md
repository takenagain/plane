# PostgreSQL 18 upgrade

The Compose files now attach PostgreSQL 18 to a new `pgdata18` volume and use
`/var/lib/postgresql/18/docker` as `PGDATA`. The previous `pgdata` volume stays
in place for rollback. PostgreSQL cannot open an older major-version cluster;
copying its files into the new volume does not upgrade it.

Stop Plane's application services before taking the dump so no requests or
background jobs write to PostgreSQL during the migration. Keep the dump until
the upgraded instance is verified.

## CLI deployment

Run these commands from the directory containing the CLI `setup.sh`:

```bash
docker compose -f plane-app/docker-compose.yaml --env-file plane-app/plane.env stop \
  web space admin api worker beat-worker migrator live proxy
docker compose -f plane-app/docker-compose.yaml --env-file plane-app/plane.env exec -T plane-db \
  sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > plane-postgres-before-18.dump
./setup.sh upgrade
docker compose -f plane-app/docker-compose.yaml --env-file plane-app/plane.env up -d plane-db
docker compose -f plane-app/docker-compose.yaml --env-file plane-app/plane.env exec -T plane-db \
  sh -c 'pg_restore --clean --if-exists --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < plane-postgres-before-18.dump
./setup.sh start
```

The installer translates the old default `PGDATA=/var/lib/postgresql/data` to
the PostgreSQL 18 default while syncing `plane.env`. Review any custom `PGDATA`
override before starting the new database.

## Repository Compose deployments

For `docker-compose.yml`, run the following from the repository root before
updating the checkout:

```bash
docker compose stop web space admin api worker beat-worker migrator live proxy
docker compose exec -T plane-db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > plane-postgres-before-18.dump
```

For `docker-compose-local.yml`, stop its database-writing services and dump the
configured application database with:

```bash
docker compose -f docker-compose-local.yml --env-file .env stop api worker beat-worker migrator
docker compose -f docker-compose-local.yml --env-file .env exec -T plane-db \
  sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > plane-postgres-before-18.dump
```

After updating the Compose file to the PostgreSQL 18 version, start only the
database, restore the application database, then start the rest of Plane:

```bash
docker compose up -d plane-db
docker compose exec -T plane-db \
  sh -c 'pg_restore --clean --if-exists --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < plane-postgres-before-18.dump
docker compose up -d
```

For the local Compose file, add `-f docker-compose-local.yml --env-file .env`
to each command and use the local services shown in its stop command above.

Verify the database is ready and check the application data in Plane before
removing the dump or old volume. Rollback uses the previous PostgreSQL image and
the original `pgdata` volume; do not attach the old cluster to PostgreSQL 18.

These steps migrate Plane's configured database. If the bundled PostgreSQL
instance contains additional databases or custom roles, dump and restore those
separately before switching the application services.
