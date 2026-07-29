export type CharacterSourceType = 'self' | 'custom' | 'friend' | 'official';

export interface CastCharacter {
  characterId: string;
  name: string;
  avatarUrl: string;
  summary: string;
  sourceType: CharacterSourceType;
  badges: string[];
  selectable: boolean;
  unavailableReason?: string;
  authorizationStatus: 'not_required' | 'authorized' | 'pending' | 'revoked';
  assetVersion: number;
}

export interface WorldviewOption {
  worldviewId: string;
  name: string;
  coverUrl: string;
  atmosphere: string;
  recommended: boolean;
  available: boolean;
  assetVersion: number;
}

export interface CastSettingResponse {
  draftId: string;
  draftVersion: number;
  maxCharacterCount: number;
  selectedCharacterIds: string[];
  selectedWorldviewId: string | null;
  characterItems: CastCharacter[];
  worldviewItems: WorldviewOption[];
  canProceed: boolean;
  validationMessage: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  traceId: string;
}

export interface UpdateCastSettingInput {
  characterIds: string[];
  worldviewId: string | null;
  draftVersion: number;
  confirm?: boolean;
}

export interface UpdateCastSettingResponse {
  draftId: string;
  draftVersion: number;
  selectedCharacterIds: string[];
  selectedWorldviewId: string | null;
  removedCharacterIds: string[];
  canProceed: boolean;
  nextPage: 'scene_description' | null;
  traceId: string;
}
