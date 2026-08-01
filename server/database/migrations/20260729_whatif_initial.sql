-- PROPOSED MIGRATION ONLY. Do not execute before both approval gates complete.
-- Engine: Miaoda PostgreSQL (development database for app_17b2h3329qw).

CREATE TABLE IF NOT EXISTS whatif_characters (
  id varchar(80) PRIMARY KEY,
  owner_id varchar(80) NOT NULL,
  name varchar(80) NOT NULL,
  description text NOT NULL DEFAULT '',
  source_type varchar(24) NOT NULL DEFAULT 'custom',
  is_self boolean NOT NULL DEFAULT false,
  status varchar(24) NOT NULL DEFAULT 'draft',
  current_version integer NOT NULL DEFAULT 1,
  master_asset_id varchar(80),
  avatar_path text,
  voice_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility varchar(16) NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whatif_characters_owner_updated ON whatif_characters(owner_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uk_whatif_character_self ON whatif_characters(owner_id) WHERE is_self = true AND status <> 'deleted';

CREATE TABLE IF NOT EXISTS whatif_character_assets (
  id varchar(80) PRIMARY KEY,
  character_id varchar(80) NOT NULL,
  owner_id varchar(80) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  kind varchar(32) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'processing',
  reference_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_path text,
  prompt_version varchar(48),
  model_trace_id varchar(160),
  error_code varchar(120),
  error_message text,
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whatif_character_assets_character ON whatif_character_assets(character_id, version DESC, kind);
CREATE INDEX IF NOT EXISTS idx_whatif_character_assets_owner_status ON whatif_character_assets(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatif_worldviews (
  id varchar(80) PRIMARY KEY,
  owner_id varchar(80) NOT NULL,
  name varchar(120) NOT NULL,
  description text NOT NULL DEFAULT '',
  atmosphere text NOT NULL DEFAULT '',
  style_prompt text NOT NULL DEFAULT '',
  cover_path text,
  visibility varchar(16) NOT NULL DEFAULT 'private',
  status varchar(24) NOT NULL DEFAULT 'active',
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whatif_worldviews_owner_updated ON whatif_worldviews(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatif_story_drafts (
  id varchar(80) PRIMARY KEY,
  owner_id varchar(80) NOT NULL,
  mode varchar(16) NOT NULL DEFAULT 'create',
  source_work_id varchar(80),
  template_id varchar(80),
  title varchar(160) NOT NULL DEFAULT '未命名故事',
  setting text NOT NULL DEFAULT '',
  relationship text NOT NULL DEFAULT '',
  worldview_id varchar(80),
  worldview_version integer,
  status varchar(24) NOT NULL DEFAULT 'editing',
  version integer NOT NULL DEFAULT 1,
  latest_scene_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whatif_drafts_owner_status ON whatif_story_drafts(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatif_draft_characters (
  id varchar(80) PRIMARY KEY,
  draft_id varchar(80) NOT NULL,
  owner_id varchar(80) NOT NULL,
  character_id varchar(80) NOT NULL,
  character_version integer NOT NULL,
  authorization_snapshot_id varchar(80),
  source_type varchar(24) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  asset_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_whatif_draft_character ON whatif_draft_characters(draft_id, character_id);
CREATE INDEX IF NOT EXISTS idx_whatif_draft_characters_owner ON whatif_draft_characters(owner_id, draft_id, sort_order);

CREATE TABLE IF NOT EXISTS whatif_stories (
  id varchar(80) PRIMARY KEY,
  owner_id varchar(80) NOT NULL,
  source_draft_id varchar(80),
  title varchar(160) NOT NULL,
  setting text NOT NULL DEFAULT '',
  worldview_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  character_snapshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_path text,
  status varchar(24) NOT NULL DEFAULT 'serializing',
  active_branch_id varchar(80),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whatif_stories_owner_updated ON whatif_stories(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatif_story_branches (
  id varchar(80) PRIMARY KEY,
  story_id varchar(80) NOT NULL,
  owner_id varchar(80) NOT NULL,
  parent_scene_id varchar(80),
  label varchar(120) NOT NULL DEFAULT '主故事线',
  status varchar(24) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whatif_branches_story ON whatif_story_branches(story_id, created_at);

CREATE TABLE IF NOT EXISTS whatif_scenes (
  id varchar(80) PRIMARY KEY,
  story_id varchar(80) NOT NULL,
  branch_id varchar(80) NOT NULL,
  owner_id varchar(80) NOT NULL,
  parent_scene_id varchar(80),
  sequence integer NOT NULL,
  title varchar(160) NOT NULL,
  user_script text NOT NULL,
  director_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  seedance_prompt text,
  continuity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(24) NOT NULL DEFAULT 'draft',
  price_sob integer NOT NULL DEFAULT 15,
  charge_status varchar(24) NOT NULL DEFAULT 'pending',
  selected_result_id varchar(80),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_whatif_scene_sequence ON whatif_scenes(branch_id, sequence);
CREATE INDEX IF NOT EXISTS idx_whatif_scenes_story_updated ON whatif_scenes(story_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatif_video_tasks (
  id varchar(80) PRIMARY KEY,
  scene_id varchar(80) NOT NULL,
  story_id varchar(80) NOT NULL,
  owner_id varchar(80) NOT NULL,
  provider_task_id varchar(160),
  provider varchar(40) NOT NULL DEFAULT 'seedance',
  model varchar(120) NOT NULL,
  prompt_version varchar(48) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'submitting',
  stage varchar(40) NOT NULL DEFAULT 'directing',
  progress integer NOT NULL DEFAULT 5,
  input_mode varchar(40),
  request_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  video_path text,
  poster_path text,
  last_frame_path text,
  duration_seconds integer NOT NULL DEFAULT 15,
  qa_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code varchar(160),
  error_message text,
  trace_id varchar(160),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whatif_video_tasks_owner_status ON whatif_video_tasks(owner_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatif_video_tasks_scene ON whatif_video_tasks(scene_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uk_whatif_provider_task ON whatif_video_tasks(provider, provider_task_id) WHERE provider_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatif_invitations (
  id varchar(80) PRIMARY KEY,
  draft_id varchar(80) NOT NULL,
  inviter_id varchar(80) NOT NULL,
  invitee_id varchar(80) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  version integer NOT NULL DEFAULT 1,
  placeholder_character_id varchar(80),
  participant_character_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whatif_invitations_invitee_status ON whatif_invitations(invitee_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uk_whatif_pending_invitation ON whatif_invitations(draft_id, invitee_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS whatif_authorization_snapshots (
  id varchar(80) PRIMARY KEY,
  invitation_id varchar(80) NOT NULL,
  owner_id varchar(80) NOT NULL,
  character_id varchar(80) NOT NULL,
  character_version integer NOT NULL,
  asset_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope varchar(40) NOT NULL DEFAULT 'invitation_story_only',
  status varchar(24) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_whatif_invitation_authorization ON whatif_authorization_snapshots(invitation_id);
CREATE INDEX IF NOT EXISTS idx_whatif_authorization_owner ON whatif_authorization_snapshots(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatif_publications (
  id varchar(80) PRIMARY KEY,
  story_id varchar(80) NOT NULL,
  owner_id varchar(80) NOT NULL,
  scene_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  title varchar(160) NOT NULL,
  summary text NOT NULL DEFAULT '',
  cover_path text,
  video_path text,
  status varchar(24) NOT NULL DEFAULT 'draft',
  visibility varchar(16) NOT NULL DEFAULT 'public',
  can_remix boolean NOT NULL DEFAULT true,
  remix_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  like_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whatif_publications_feed ON whatif_publications(status, visibility, like_count DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatif_publications_owner ON whatif_publications(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatif_idempotency_records (
  id varchar(80) PRIMARY KEY,
  owner_id varchar(80) NOT NULL,
  scope varchar(64) NOT NULL,
  idempotency_key varchar(160) NOT NULL,
  resource_id varchar(80) NOT NULL,
  response_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_whatif_idempotency ON whatif_idempotency_records(owner_id, scope, idempotency_key);

-- Seed only reusable official/configuration assets. These are not user data.
INSERT INTO whatif_worldviews (id, owner_id, name, description, atmosphere, style_prompt, cover_path, visibility, status, current_version)
VALUES
  ('world-modern-romance', 'system', '现代都市', '当代城市中的关系故事。', '霓虹雨夜与错过的重逢', 'cinematic contemporary city, natural acting, restrained romance', 'assets/whatif/world-modern-romance.jpg', 'public', 'active', 1),
  ('world-period-romance', 'system', '旧时代', '带有时代质感的命运故事。', '命运岔路上的同行与告别', 'period romance, tactile production design, cinematic lighting', 'assets/whatif/world-period-romance.jpg', 'public', 'active', 1),
  ('world-future-parallel', 'system', '未来平行线', '科技与人性共存的未来城市。', '在另一个时间节点再次相遇', 'near-future Shanghai, grounded science fiction, emotional realism', 'assets/whatif/world-future.png', 'public', 'active', 1),
  ('world-art-life', 'system', '文艺人生', '围绕创作、遗憾与重新选择的人生故事。', '共同完成未说出口的梦想', 'poetic slice of life, delicate natural light, film texture', 'assets/whatif/world-art-story.jpg', 'public', 'active', 1)
ON CONFLICT (id) DO NOTHING;
