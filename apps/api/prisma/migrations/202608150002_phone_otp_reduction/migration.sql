ALTER TABLE user_sessions
ADD COLUMN idle_timeout_seconds integer NOT NULL DEFAULT 1800;

ALTER TABLE user_sessions
ADD CONSTRAINT user_sessions_idle_timeout_check
CHECK (idle_timeout_seconds BETWEEN 300 AND 604800);
