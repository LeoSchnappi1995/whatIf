/**
 * Whatif Mongo schema（轻量定义：兼容 drizzle 链式 API，底层用 MongoDB）
 */

export interface Field { key: string; }

export interface TableDef { name: string; cols: Record<string, Field>; }
export type Table = TableDef & Record<string, Field>;

export function field(key: string): Field { return { key }; }

export function table(name: string, cols: Record<string, Field>): Table {
  return { ...cols, name, cols } as Table;
}


export const whatifCharacters = table('whatif_characters', {
  id: field('id'),
  ownerId: field('ownerId'),
  name: field('name'),
  description: field('description'),
  sourceType: field('sourceType'),
  isSelf: field('isSelf'),
  status: field('status'),
  currentVersion: field('currentVersion'),
  masterAssetId: field('masterAssetId'),
  avatarPath: field('avatarPath'),
  visibility: field('visibility'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifCharacterAssets = table('whatif_character_assets', {
  id: field('id'),
  characterId: field('characterId'),
  ownerId: field('ownerId'),
  version: field('version'),
  kind: field('kind'),
  status: field('status'),
  referencePaths: field('referencePaths'),
  imagePath: field('imagePath'),
  promptVersion: field('promptVersion'),
  modelTraceId: field('modelTraceId'),
  errorCode: field('errorCode'),
  errorMessage: field('errorMessage'),
  confirmed: field('confirmed'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifWorldviews = table('whatif_worldviews', {
  id: field('id'),
  ownerId: field('ownerId'),
  name: field('name'),
  description: field('description'),
  atmosphere: field('atmosphere'),
  stylePrompt: field('stylePrompt'),
  coverPath: field('coverPath'),
  visibility: field('visibility'),
  status: field('status'),
  currentVersion: field('currentVersion'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifStoryDrafts = table('whatif_story_drafts', {
  id: field('id'),
  ownerId: field('ownerId'),
  mode: field('mode'),
  sourceWorkId: field('sourceWorkId'),
  templateId: field('templateId'),
  title: field('title'),
  setting: field('setting'),
  relationship: field('relationship'),
  worldviewId: field('worldviewId'),
  worldviewVersion: field('worldviewVersion'),
  status: field('status'),
  version: field('version'),
  latestSceneDraft: field('latestSceneDraft'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifDraftCharacters = table('whatif_draft_characters', {
  id: field('id'),
  draftId: field('draftId'),
  ownerId: field('ownerId'),
  characterId: field('characterId'),
  characterVersion: field('characterVersion'),
  authorizationSnapshotId: field('authorizationSnapshotId'),
  sourceType: field('sourceType'),
  sortOrder: field('sortOrder'),
  assetSnapshot: field('assetSnapshot'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifStories = table('whatif_stories', {
  id: field('id'),
  ownerId: field('ownerId'),
  sourceDraftId: field('sourceDraftId'),
  title: field('title'),
  setting: field('setting'),
  worldviewSnapshot: field('worldviewSnapshot'),
  characterSnapshots: field('characterSnapshots'),
  coverPath: field('coverPath'),
  status: field('status'),
  activeBranchId: field('activeBranchId'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifStoryBranches = table('whatif_story_branches', {
  id: field('id'),
  storyId: field('storyId'),
  ownerId: field('ownerId'),
  parentSceneId: field('parentSceneId'),
  label: field('label'),
  status: field('status'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifScenes = table('whatif_scenes', {
  id: field('id'),
  storyId: field('storyId'),
  branchId: field('branchId'),
  ownerId: field('ownerId'),
  parentSceneId: field('parentSceneId'),
  sequence: field('sequence'),
  title: field('title'),
  userScript: field('userScript'),
  directorPlan: field('directorPlan'),
  seedancePrompt: field('seedancePrompt'),
  continuitySnapshot: field('continuitySnapshot'),
  status: field('status'),
  priceSob: field('priceSob'),
  chargeStatus: field('chargeStatus'),
  selectedResultId: field('selectedResultId'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifVideoTasks = table('whatif_video_tasks', {
  id: field('id'),
  sceneId: field('sceneId'),
  storyId: field('storyId'),
  ownerId: field('ownerId'),
  providerTaskId: field('providerTaskId'),
  provider: field('provider'),
  model: field('model'),
  promptVersion: field('promptVersion'),
  status: field('status'),
  stage: field('stage'),
  progress: field('progress'),
  inputMode: field('inputMode'),
  requestSnapshot: field('requestSnapshot'),
  responseSnapshot: field('responseSnapshot'),
  videoPath: field('videoPath'),
  posterPath: field('posterPath'),
  lastFramePath: field('lastFramePath'),
  durationSeconds: field('durationSeconds'),
  qaResult: field('qaResult'),
  errorCode: field('errorCode'),
  errorMessage: field('errorMessage'),
  traceId: field('traceId'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifInvitations = table('whatif_invitations', {
  id: field('id'),
  draftId: field('draftId'),
  inviterId: field('inviterId'),
  inviteeId: field('inviteeId'),
  status: field('status'),
  version: field('version'),
  placeholderCharacterId: field('placeholderCharacterId'),
  participantCharacterDraft: field('participantCharacterDraft'),
  expiresAt: field('expiresAt'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifAuthorizationSnapshots = table('whatif_authorization_snapshots', {
  id: field('id'),
  invitationId: field('invitationId'),
  ownerId: field('ownerId'),
  characterId: field('characterId'),
  characterVersion: field('characterVersion'),
  assetSnapshot: field('assetSnapshot'),
  scope: field('scope'),
  status: field('status'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifPublications = table('whatif_publications', {
  id: field('id'),
  storyId: field('storyId'),
  ownerId: field('ownerId'),
  sceneIds: field('sceneIds'),
  title: field('title'),
  summary: field('summary'),
  coverPath: field('coverPath'),
  videoPath: field('videoPath'),
  status: field('status'),
  visibility: field('visibility'),
  canRemix: field('canRemix'),
  remixTemplate: field('remixTemplate'),
  likeCount: field('likeCount'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});


export const whatifIdempotencyRecords = table('whatif_idempotency_records', {
  id: field('id'),
  ownerId: field('ownerId'),
  scope: field('scope'),
  idempotencyKey: field('idempotencyKey'),
  resourceId: field('resourceId'),
  responseSnapshot: field('responseSnapshot'),
  expiresAt: field('expiresAt'),
  createdAt: field('createdAt'),
  updatedAt: field('updatedAt'),
});
