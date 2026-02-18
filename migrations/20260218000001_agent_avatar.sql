-- Add avatar_path column for custom uploaded avatar images.
-- Falls back to avatar_seed gradient when NULL.
ALTER TABLE agent_profile ADD COLUMN avatar_path TEXT;
