-- Add 'meta' value to lead_source_type enum
ALTER TYPE lead_source_type ADD VALUE IF NOT EXISTS 'meta';