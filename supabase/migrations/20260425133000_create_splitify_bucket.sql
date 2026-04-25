-- Create app-specific storage bucket for Splitify receipt images.
-- Keep legacy bill-images bucket untouched for one-time copy/rollback safety.

insert into storage.buckets (id, name, public)
values ('splitify', 'splitify', false)
on conflict (id) do nothing;
