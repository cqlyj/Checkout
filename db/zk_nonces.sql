-- Nonce tracking for ZK proofs

create table if not exists zk_nonces (
  wallet_address_bytes bytea not null,
  intent smallint not null,
  nonce bigint not null,
  issued_at timestamptz default now(),
  used_at timestamptz,
  used boolean default false,
  constraint pk_zk_nonces primary key (wallet_address_bytes, intent, nonce)
);


