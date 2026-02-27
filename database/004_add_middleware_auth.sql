-- =====================================================
-- Migration 004: Add middleware auth type + auth_logic
-- =====================================================

-- 1. Drop the old type CHECK constraint and add a new one
--    that includes 'middleware' as a valid auth type.
ALTER TABLE api_gateway_auth_methods
  DROP CONSTRAINT IF EXISTS api_gateway_auth_methods_type_check;

ALTER TABLE api_gateway_auth_methods
  ADD CONSTRAINT api_gateway_auth_methods_type_check
  CHECK (type IN ('basic_auth', 'bearer_jwt', 'api_key', 'middleware'));

-- config shape for middleware:
--   { "functionId": "<uuid of a function in the same project>" }

-- 2. Add auth_logic column to api_gateway_routes.
--    'or'  → any one passing auth method grants access (default, backward-compatible)
--    'and' → all attached auth methods must pass
ALTER TABLE api_gateway_routes
  ADD COLUMN IF NOT EXISTS auth_logic VARCHAR(3) NOT NULL DEFAULT 'or'
  CHECK (auth_logic IN ('or', 'and'));
