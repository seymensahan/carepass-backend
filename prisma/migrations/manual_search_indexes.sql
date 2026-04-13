-- Manual search indexes for CarePass. Run with psql against the target database:
--   psql "$DATABASE_URL" -f prisma/migrations/manual_search_indexes.sql
--
-- Safe to run multiple times (all statements use IF NOT EXISTS).

-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Patients: full-text search on carepass_id (first/last name live on users)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_patients_search
  ON patients
  USING GIN (to_tsvector('french', coalesce(carepass_id, '')));

CREATE INDEX IF NOT EXISTS idx_patients_carepass_id_trgm
  ON patients USING GIN (carepass_id gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Users: fuzzy search (trigram on first_name / last_name / email)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_firstname_trgm ON users USING GIN (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_lastname_trgm  ON users USING GIN (last_name  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm     ON users USING GIN (email      gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Consultations: full-text search on diagnosis + notes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_consultations_search
  ON consultations
  USING GIN (to_tsvector('french', coalesce(diagnosis, '') || ' ' || coalesce(notes, '')));

-- ---------------------------------------------------------------------------
-- Institutions: fuzzy search on name / city
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_institutions_name_trgm ON institutions USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_institutions_city_trgm ON institutions USING GIN (city gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Doctors: trigram on specialty for partial match
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_doctors_specialty_trgm ON doctors USING GIN (specialty gin_trgm_ops);
