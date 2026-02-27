-- Migration: 005_auth_method_sort_order
-- Adds sort_order to the route ↔ auth method junction table so that
-- auth methods can be evaluated in a user-defined order.

ALTER TABLE api_gateway_route_auth_methods
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_gateway_route_auth_methods_sort_order
  ON api_gateway_route_auth_methods(route_id, sort_order);
