-- Migration 007: Backfill jwtMode for existing bearer_jwt auth methods
-- All existing bearer_jwt rows use a fixed HMAC secret, so tag them as 'fixed_secret'.
-- New rows created after this migration will always include jwtMode in their config.

UPDATE api_gateway_auth_methods
SET config = config || '{"jwtMode": "fixed_secret"}'::jsonb
WHERE type = 'bearer_jwt'
  AND config->>'jwtMode' IS NULL;
