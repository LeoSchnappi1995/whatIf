/**
 * Whatif business schema.
 *
 * The physical tables are created by the reviewed migration in
 * `server/database/migrations/20260729_whatif_initial.sql`. Keep this file and
 * that migration aligned until Miaoda schema generation is enabled.
 */
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userProfile = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = { bucket_id: string; file_path: string };

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined' ? ` (${config.precision})` : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as never;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    return value instanceof Date ? value : new Date(value);
  },
});

const createdAt = () => customTimestamptz('created_at').default(sql`CURRENT_TIMESTAMP`).notNull();
const updatedAt = () => customTimestamptz('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull();

export const whatifCharacters = pgTable('whatif_characters', {
  id: varchar({ length: 80 }).primaryKey(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  name: varchar({ length: 80 }).notNull(),
  description: text().default('').notNull(),
  sourceType: varchar('source_type', { length: 24 }).default('custom').notNull(),
  isSelf: boolean('is_self').default(false).notNull(),
  status: varchar({ length: 24 }).default('draft').notNull(),
  currentVersion: integer('current_version').default(1).notNull(),
  masterAssetId: varchar('master_asset_id', { length: 80 }),
  avatarPath: text('avatar_path'),
  voiceProfile: jsonb('voice_profile').default(sql`'{}'::jsonb`).notNull(),
  visibility: varchar({ length: 16 }).default('private').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifCharacterAssets = pgTable('whatif_character_assets', {
  id: varchar({ length: 80 }).primaryKey(),
  characterId: varchar('character_id', { length: 80 }).notNull(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  version: integer().default(1).notNull(),
  kind: varchar({ length: 32 }).notNull(),
  status: varchar({ length: 24 }).default('processing').notNull(),
  referencePaths: jsonb('reference_paths').default(sql`'[]'::jsonb`).notNull(),
  imagePath: text('image_path'),
  promptVersion: varchar('prompt_version', { length: 48 }),
  modelTraceId: varchar('model_trace_id', { length: 160 }),
  errorCode: varchar('error_code', { length: 120 }),
  errorMessage: text('error_message'),
  confirmed: boolean().default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifWorldviews = pgTable('whatif_worldviews', {
  id: varchar({ length: 80 }).primaryKey(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  name: varchar({ length: 120 }).notNull(),
  description: text().default('').notNull(),
  atmosphere: text().default('').notNull(),
  stylePrompt: text('style_prompt').default('').notNull(),
  coverPath: text('cover_path'),
  visibility: varchar({ length: 16 }).default('private').notNull(),
  status: varchar({ length: 24 }).default('active').notNull(),
  currentVersion: integer('current_version').default(1).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifStoryDrafts = pgTable('whatif_story_drafts', {
  id: varchar({ length: 80 }).primaryKey(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  mode: varchar({ length: 16 }).default('create').notNull(),
  sourceWorkId: varchar('source_work_id', { length: 80 }),
  templateId: varchar('template_id', { length: 80 }),
  title: varchar({ length: 160 }).default('未命名故事').notNull(),
  setting: text().default('').notNull(),
  relationship: text().default('').notNull(),
  worldviewId: varchar('worldview_id', { length: 80 }),
  worldviewVersion: integer('worldview_version'),
  status: varchar({ length: 24 }).default('editing').notNull(),
  version: integer().default(1).notNull(),
  latestSceneDraft: jsonb('latest_scene_draft').default(sql`'{}'::jsonb`).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifDraftCharacters = pgTable('whatif_draft_characters', {
  id: varchar({ length: 80 }).primaryKey(),
  draftId: varchar('draft_id', { length: 80 }).notNull(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  characterId: varchar('character_id', { length: 80 }).notNull(),
  characterVersion: integer('character_version').notNull(),
  authorizationSnapshotId: varchar('authorization_snapshot_id', { length: 80 }),
  sourceType: varchar('source_type', { length: 24 }).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  assetSnapshot: jsonb('asset_snapshot').default(sql`'{}'::jsonb`).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifStories = pgTable('whatif_stories', {
  id: varchar({ length: 80 }).primaryKey(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  sourceDraftId: varchar('source_draft_id', { length: 80 }),
  title: varchar({ length: 160 }).notNull(),
  setting: text().default('').notNull(),
  worldviewSnapshot: jsonb('worldview_snapshot').default(sql`'{}'::jsonb`).notNull(),
  characterSnapshots: jsonb('character_snapshots').default(sql`'[]'::jsonb`).notNull(),
  coverPath: text('cover_path'),
  status: varchar({ length: 24 }).default('serializing').notNull(),
  activeBranchId: varchar('active_branch_id', { length: 80 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifStoryBranches = pgTable('whatif_story_branches', {
  id: varchar({ length: 80 }).primaryKey(),
  storyId: varchar('story_id', { length: 80 }).notNull(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  parentSceneId: varchar('parent_scene_id', { length: 80 }),
  label: varchar({ length: 120 }).default('主故事线').notNull(),
  status: varchar({ length: 24 }).default('active').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifScenes = pgTable('whatif_scenes', {
  id: varchar({ length: 80 }).primaryKey(),
  storyId: varchar('story_id', { length: 80 }).notNull(),
  branchId: varchar('branch_id', { length: 80 }).notNull(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  parentSceneId: varchar('parent_scene_id', { length: 80 }),
  sequence: integer().notNull(),
  title: varchar({ length: 160 }).notNull(),
  userScript: text('user_script').notNull(),
  directorPlan: jsonb('director_plan').default(sql`'{}'::jsonb`).notNull(),
  seedancePrompt: text('seedance_prompt'),
  continuitySnapshot: jsonb('continuity_snapshot').default(sql`'{}'::jsonb`).notNull(),
  status: varchar({ length: 24 }).default('draft').notNull(),
  priceSob: integer('price_sob').default(15).notNull(),
  chargeStatus: varchar('charge_status', { length: 24 }).default('pending').notNull(),
  selectedResultId: varchar('selected_result_id', { length: 80 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifVideoTasks = pgTable('whatif_video_tasks', {
  id: varchar({ length: 80 }).primaryKey(),
  sceneId: varchar('scene_id', { length: 80 }).notNull(),
  storyId: varchar('story_id', { length: 80 }).notNull(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  providerTaskId: varchar('provider_task_id', { length: 160 }),
  provider: varchar({ length: 40 }).default('seedance').notNull(),
  model: varchar({ length: 120 }).notNull(),
  promptVersion: varchar('prompt_version', { length: 48 }).notNull(),
  status: varchar({ length: 24 }).default('submitting').notNull(),
  stage: varchar({ length: 40 }).default('directing').notNull(),
  progress: integer().default(5).notNull(),
  inputMode: varchar('input_mode', { length: 40 }),
  requestSnapshot: jsonb('request_snapshot').default(sql`'{}'::jsonb`).notNull(),
  responseSnapshot: jsonb('response_snapshot').default(sql`'{}'::jsonb`).notNull(),
  videoPath: text('video_path'),
  posterPath: text('poster_path'),
  lastFramePath: text('last_frame_path'),
  durationSeconds: integer('duration_seconds').default(15).notNull(),
  qaResult: jsonb('qa_result').default(sql`'{}'::jsonb`).notNull(),
  errorCode: varchar('error_code', { length: 160 }),
  errorMessage: text('error_message'),
  traceId: varchar('trace_id', { length: 160 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifInvitations = pgTable('whatif_invitations', {
  id: varchar({ length: 80 }).primaryKey(),
  draftId: varchar('draft_id', { length: 80 }).notNull(),
  inviterId: varchar('inviter_id', { length: 80 }).notNull(),
  inviteeId: varchar('invitee_id', { length: 80 }).notNull(),
  status: varchar({ length: 32 }).default('pending').notNull(),
  version: integer().default(1).notNull(),
  placeholderCharacterId: varchar('placeholder_character_id', { length: 80 }),
  participantCharacterDraft: jsonb('participant_character_draft').default(sql`'{}'::jsonb`).notNull(),
  expiresAt: customTimestamptz('expires_at').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifAuthorizationSnapshots = pgTable('whatif_authorization_snapshots', {
  id: varchar({ length: 80 }).primaryKey(),
  invitationId: varchar('invitation_id', { length: 80 }).notNull(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  characterId: varchar('character_id', { length: 80 }).notNull(),
  characterVersion: integer('character_version').notNull(),
  assetSnapshot: jsonb('asset_snapshot').default(sql`'{}'::jsonb`).notNull(),
  scope: varchar({ length: 40 }).default('invitation_story_only').notNull(),
  status: varchar({ length: 24 }).default('active').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifPublications = pgTable('whatif_publications', {
  id: varchar({ length: 80 }).primaryKey(),
  storyId: varchar('story_id', { length: 80 }).notNull(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  sceneIds: jsonb('scene_ids').default(sql`'[]'::jsonb`).notNull(),
  title: varchar({ length: 160 }).notNull(),
  summary: text().default('').notNull(),
  coverPath: text('cover_path'),
  videoPath: text('video_path'),
  status: varchar({ length: 24 }).default('draft').notNull(),
  visibility: varchar({ length: 16 }).default('public').notNull(),
  canRemix: boolean('can_remix').default(true).notNull(),
  remixTemplate: jsonb('remix_template').default(sql`'{}'::jsonb`).notNull(),
  likeCount: integer('like_count').default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatifIdempotencyRecords = pgTable('whatif_idempotency_records', {
  id: varchar({ length: 80 }).primaryKey(),
  ownerId: varchar('owner_id', { length: 80 }).notNull(),
  scope: varchar({ length: 64 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
  resourceId: varchar('resource_id', { length: 80 }).notNull(),
  responseSnapshot: jsonb('response_snapshot').default(sql`'{}'::jsonb`).notNull(),
  expiresAt: customTimestamptz('expires_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
