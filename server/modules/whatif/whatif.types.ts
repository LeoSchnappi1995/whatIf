export type StatusCardType =
  | 'no_character'
  | 'existing_character'
  | 'character_created'
  | 'pending_invitation'
  | 'video_generating'
  | 'collaboration_ready'
  | 'story_resumable'
  | 'video_failed';

export interface CharacterSummary {
  id: string;
  name: string;
  avatarUrl: string;
  ownerType: 'self' | 'friend' | 'official';
}

export interface HomeStatusCard {
  type: StatusCardType;
  eyebrow?: string;
  title: string;
  description: string;
  actionLabel: string;
  secondaryLabel: string;
  progress?: number;
  storyId?: string;
  taskId?: string;
  characters: CharacterSummary[];
}

export interface WhatifWork {
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  authorName: string;
  avatarUrl: string;
  likeCount: number;
  durationSeconds: number;
}

export type CharacterSourceType = 'self' | 'custom' | 'seedance_asset' | 'friend' | 'official';

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

export interface CastDraftState {
  draftId: string;
  draftVersion: number;
  characterIds: string[];
  worldviewId: string | null;
  updatedAt: string;
}
