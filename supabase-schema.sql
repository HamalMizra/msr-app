create table if not exists public.items (
  "recordId" text primary key,
  "firstName" text not null default '',
  "familyName" text not null default '',
  "phone" text not null default '',
  "idNumber" text not null default '',
  indication boolean not null default false,
  "arrivalReason" text not null default '',
  "arrivalOther" text not null default '',
  released boolean not null default false,
  "releaseNotes" text not null default '',
  "currentStation" text not null default '',
  "nextStation" text not null default '',
  "nextStations" text not null default '[]',
  "arrivalReasons" text not null default '[]',
  "stationNotes" text not null default '{}',
  "stationNotesLev" text not null default '',
  "stationNotesMedical" text not null default '',
  "stationPhases" text not null default '{}',
  "visitedStations" text not null default '[]',
  "recordStatus" text not null default 'פתוח',
  "savedAt" timestamptz not null default now(),
  "updatedAt" timestamptz
);

create index if not exists idx_items_savedAt on public.items ("savedAt" desc);
create index if not exists idx_items_currentStation on public.items ("currentStation");
create index if not exists idx_items_released on public.items (released);
create index if not exists idx_items_idNumber on public.items ("idNumber");
create index if not exists idx_items_phone on public.items (phone);
