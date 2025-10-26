-- Supabase schema for face ↔ wallet mapping (JSONB embeddings, optional email hash)

-- Table stores a single, averaged face embedding per wallet.
-- Identification (cosine similarity) will be done in application code for now.

create table if not exists face_templates (
  -- Primary key is the exact 20-byte address value (case-independent for on-chain/ZK use)
  wallet_address_bytes bytea primary key,
  -- Checksummed hex string for UX/display (e.g., EIP-55). We generate this in the app.
  wallet_address_checksum text not null unique,
  embedding jsonb not null,                -- numeric array, e.g. [0.12, -0.03, ...]
  embedding_dim integer not null,          -- length of the embedding array
  model_version text not null,             -- e.g. 'human-face-v1'
  email_hash bytea,                        -- optional; 32 bytes if present
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- enforce correct lengths when provided
  constraint chk_addr_len check (octet_length(wallet_address_bytes) = 20),
  constraint chk_email_hash_len check (
    email_hash is null or octet_length(email_hash) = 32
  ),
  -- basic hex format for checksum string (checksum validity enforced in app)
  constraint chk_addr_checksum_hex check (wallet_address_checksum ~* '^0x[0-9a-f]{40}$')
);

-- Keep updated_at current
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_set_updated_at on face_templates;
create trigger trg_set_updated_at
before update on face_templates
for each row execute function set_updated_at();

-- Helper view for quick status checks (e.g., redirect logic based on email hash presence)
create or replace view face_templates_status as
select
  wallet_address_checksum as wallet_address,
  (email_hash is not null) as has_email_hash,
  created_at,
  updated_at
from face_templates;

-- Suggested usage notes:
-- 1) From the app, convert an input hex address to:
--    (a) 20-byte value: decode(replace($addrHex, '0x', ''), 'hex') for wallet_address_bytes
--    (b) checksummed string: compute EIP-55 in app for wallet_address_checksum
-- 2) For email hash, pass a 0x-hex string from the app and convert to bytea in SQL with:
--    decode(replace($1, '0x', ''), 'hex')
-- 3) Embedding is JSONB array of numbers. Also store embedding_dim for future pgvector migration.
-- 4) Identification is handled in the API: fetch all embeddings and compute cosine similarity in code.


