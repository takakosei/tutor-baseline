# Database backup

`.github/workflows/backup.yml` dumps the database every Monday at 03:00 (Tokyo): the structure, data, grants and
policies of every table in `public`, plus the migration history. The dump is compressed, encrypted and stored as an
Actions artifact for 90 days (about 13 backups).

It does not include Supabase Auth accounts. When restoring into a new project, recreate the tutor account and register
the passkeys again.

**Use this workflow only in a private repository.** Artifacts of a public repository can be downloaded by anyone. The
backup is encrypted, but it holds students' internal notes and parent links.

## Setup

1. **Database password:** Supabase dashboard → Project Settings → Database. You can reset it there; the web app and the
   assistant do not use it, so resetting it does not affect them.
2. **Connection string:** Supabase dashboard → Connect → **Session pooler**. Copy
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres` and replace `[YOUR-PASSWORD]`.
   GitHub runners only have IPv4, so the direct connection (`db.xxx.supabase.co`) does not work.
3. **GitHub secrets:** repository → Settings → Secrets and variables → Actions → New repository secret:
   - `SUPABASE_DB_URL`: the connection string from step 2
   - `BACKUP_PASSPHRASE`: a long passphrase of your choice. Store it in a password manager; without it the backups
     cannot be decrypted
4. **Test run:** Actions → **Database backup** → Run workflow. A green run has a `db-backup` artifact.

## When a run fails

GitHub emails you when a scheduled run fails. The reason is in the run's Annotations: a hint plus pg_dump's own message,
with hosts and user names removed. Common causes: a missing secret, a changed database password (update
`SUPABASE_DB_URL`), the direct connection string instead of the Session pooler one, or Supabase being briefly
unreachable. After fixing the secrets, run the workflow again by hand.

## Restore

1. Actions → a successful run → Artifacts → download `db-backup` (a zip) and unzip it to get `backup-YYYY-MM-DD.sql.gz.enc`.
2. Decrypt and decompress (the `openssl` that ships with macOS works; it asks for `BACKUP_PASSPHRASE`):

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -in backup-YYYY-MM-DD.sql.gz.enc | gunzip > backup.sql
   ```

3. Restore into a **new** Supabase project (never over the live one):

   ```bash
   psql "<the new project's Session pooler connection string>" -f backup.sql
   ```

   `profiles` references the Auth accounts, so create the tutor account in the new project first, then change the id of
   the `profiles` row in the backup to the new account's id. Afterwards, point the Vercel environment variables at the
   new project's URL and keys.

To recover only a few rows, there is no need to restore: open `backup.sql` and search it (lesson records follow
`COPY public.lessons …`).
