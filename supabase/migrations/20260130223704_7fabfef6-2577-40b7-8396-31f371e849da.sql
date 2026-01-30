-- =============================================
-- RBAC - Step 1: Add new enum values
-- =============================================

-- Add new role values to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'responsabile_venditori';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'responsabile_callcenter';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'operatore_callcenter';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'venditore';

-- Add is_active column to user_roles if not exists
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;