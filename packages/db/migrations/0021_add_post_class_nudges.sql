-- Migration 0021: Post-Class Nudges
-- Enables automated post-class check-ins to capture assignments/updates when they're fresh

-- Nudges table: Stores individual nudge instances
CREATE TABLE IF NOT EXISTS nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'POST_CLASS' CHECK (type IN ('POST_CLASS')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'deferred', 'sent', 'delivered', 'resolved', 'expired')),
  
  -- Timing
  trigger_at TIMESTAMP WITH TIME ZONE NOT NULL, -- When class ended
  scheduled_send_at TIMESTAMP WITH TIME ZONE, -- When we plan to send (accounts for DND)
  delivered_at TIMESTAMP WITH TIME ZONE, -- When user saw it
  response_at TIMESTAMP WITH TIME ZONE, -- When user acted on it
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'), -- Auto-expire after 48h
  
  -- Delivery
  delivery_channel TEXT CHECK (delivery_channel IN ('push', 'in_app')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}', -- {class_date, dnd_deferred, etc}
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_nudges_user_status ON nudges(user_id, status);
CREATE INDEX idx_nudges_trigger_at ON nudges(trigger_at) WHERE status IN ('queued', 'deferred');
CREATE INDEX idx_nudges_course_date ON nudges(user_id, course_id, ((trigger_at AT TIME ZONE 'UTC')::date)); -- Prevents duplicates per day

-- Unique constraint: One nudge per course per day
CREATE UNIQUE INDEX idx_nudges_unique_course_day ON nudges(user_id, course_id, ((trigger_at AT TIME ZONE 'UTC')::date));

-- Nudge actions table: Stores user responses
CREATE TABLE IF NOT EXISTS nudge_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nudge_id UUID NOT NULL REFERENCES nudges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('NO_UPDATES', 'ADD_ASSIGNMENT', 'LOG_FOCUS', 'DISMISSED')),
  payload JSONB DEFAULT '{}', -- {text: for assignments, focusMinutes: for focus logging}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_nudge_actions_nudge ON nudge_actions(nudge_id);
CREATE INDEX idx_nudge_actions_user ON nudge_actions(user_id, created_at DESC);

-- Course nudge settings: Per-course mute/cooldown preferences
CREATE TABLE IF NOT EXISTS course_nudge_settings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  mute_until TIMESTAMP WITH TIME ZONE, -- User explicitly muted
  auto_cooldown_until TIMESTAMP WITH TIME ZONE, -- Auto cooldown from ignoring
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, course_id)
);

CREATE INDEX idx_course_nudge_settings_mute ON course_nudge_settings(user_id, course_id) 
  WHERE mute_until IS NOT NULL OR auto_cooldown_until IS NOT NULL;

-- Streak counters: Daily action streaks for motivation
CREATE TABLE IF NOT EXISTS streak_counters (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_action_date DATE, -- Last date user took any nudge action
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_streak_counters_user ON streak_counters(user_id);

-- Comments for clarity
COMMENT ON TABLE nudges IS 'Post-class nudges to capture assignments and updates when fresh';
COMMENT ON COLUMN nudges.trigger_at IS 'When the class ended (nudge trigger time)';
COMMENT ON COLUMN nudges.scheduled_send_at IS 'When to actually send (after DND deferral)';
COMMENT ON COLUMN nudges.status IS 'queued→sent→delivered→resolved (or expired)';
COMMENT ON COLUMN nudges.expires_at IS 'Auto-expire nudges after 48 hours if not acted on';

COMMENT ON TABLE nudge_actions IS 'User responses to nudges (No updates, Add assignment, Log focus)';
COMMENT ON COLUMN nudge_actions.action IS 'What the user chose to do';
COMMENT ON COLUMN nudge_actions.payload IS 'Action-specific data (assignment text, focus minutes)';

COMMENT ON TABLE course_nudge_settings IS 'Per-course mute and cooldown preferences';
COMMENT ON COLUMN course_nudge_settings.mute_until IS 'User explicitly muted this course until this time';
COMMENT ON COLUMN course_nudge_settings.auto_cooldown_until IS 'Auto cooldown from ignoring nudges';

COMMENT ON TABLE streak_counters IS 'Daily streak tracking for engagement and motivation';
COMMENT ON COLUMN streak_counters.current_streak IS 'Consecutive days with at least one nudge action';
COMMENT ON COLUMN streak_counters.longest_streak IS 'All-time longest streak';

