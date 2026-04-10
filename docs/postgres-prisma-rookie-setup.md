# Local PostgreSQL + Prisma Setup (Rookie Guide)

This guide sets you up with:

- Local PostgreSQL now
- Prisma schema + migrations
- Insurer knowledge import (structured facts + PDF content)
- Easy migration to cloud later

---

## 1) What is what (simple)

- **PostgreSQL**: your database (where insurer facts live).
- **Prisma**: code tool/ORM that creates tables and reads/writes DB using JS/TS.
- **Mockoon**: fake insurer API simulator (not your main data store).

Use Mockoon for quote flow simulation, and PostgreSQL for AI knowledge.

---

## 2) Your action: install PostgreSQL on Mac

### Option A (recommended): Postgres.app

1. Download and install `Postgres.app`.
2. Open Postgres.app and keep it running.
3. Add Postgres CLI tools to PATH (one-time):

```bash
echo 'export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

4. Verify:

```bash
psql --version
```

---

## 3) Create local DB + user

Run:

```bash
createuser lajoo --pwprompt
createdb lajoo_ai -O lajoo
```

If prompted, set password to something you remember (example: `lajoo123` for local dev only).

---

## 4) Configure DATABASE_URL

In project root `lajooweb/`, set `DATABASE_URL` in `.env.local`.

Example:

```env
DATABASE_URL="postgresql://lajoo:lajoo123@localhost:5432/lajoo_ai?schema=public"
```

You can copy from `.env.prisma.example`.

---

## 5) Create tables from Prisma schema

Run:

```bash
npm run db:migrate -- --name init_insurer_knowledge
npm run prisma:generate
```

This creates tables:

- `Insurer`
- `PolicyDocument`
- `KnowledgeChunk`
- `InsurerFact`
- `InsurerPromotion`

---

## 6) Fill structured insurer knowledge

Edit:

- `data/insurer-facts.json`

Then import:

```bash
npm run db:seed:insurers
```

Use this for facts like:

- towing limits
- betterment rules
- claim hotline/process notes
- promotions with `valid_from` / `valid_to`

---

## 7) Import each insurer PDF into DB

Run one command per PDF:

```bash
npm run db:import:pdf -- --file "/full/path/etiqa-policy.pdf" --insurer ETIQA --title "Etiqa Motor Policy 2026" --version "v2026-01" --effective-from 2026-01-01
npm run db:import:pdf -- --file "/full/path/allianz-policy.pdf" --insurer ALLIANZ --title "Allianz Motor Policy 2026" --version "v2026-01" --effective-from 2026-01-01
npm run db:import:pdf -- --file "/full/path/takaful-policy.pdf" --insurer TAKAFUL --title "Takaful Motor Policy 2026" --version "v2026-01" --effective-from 2026-01-01
```

This stores:

- full extracted text in `PolicyDocument.extractedText`
- chunked text in `KnowledgeChunk` for retrieval/search

---

## 8) Inspect data visually

```bash
npm run db:studio
```

You can open tables in Prisma Studio and verify records.

---

## 9) How AI should use this later

Rule of thumb:

- **Time-sensitive facts** (promo, towing this month): read from `InsurerFact` / `InsurerPromotion`
- **Long legal wording** (policy details): read from `KnowledgeChunk` / `PolicyDocument`
- **General insurance education**: can stay in app knowledge base

---

## 10) Move to cloud later (safe path)

1. Create cloud Postgres (Neon/Supabase/RDS).
2. Change `DATABASE_URL`.
3. Run migration again:

```bash
npm run db:migrate
```

4. Export/import data:

```bash
pg_dump <local_db_url> > local_dump.sql
psql <cloud_db_url> < local_dump.sql
```

No app logic changes needed if Prisma + env vars are used.
