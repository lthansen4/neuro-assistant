-- Migration: Add rejected_at column to rebalancing_proposals
-- This column tracks when a proposal was rejected by the user

ALTER TABLE rebalancing_proposals
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN rebalancing_proposals.rejected_at IS 'Timestamp when the proposal was rejected by the user';



