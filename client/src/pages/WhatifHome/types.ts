export type StatusCardType =
  | 'no_character'
  | 'existing_character'
  | 'character_created'
  | 'pending_invitation'
  | 'video_generating'
  | 'collaboration_ready'
  | 'story_resumable'
  | 'video_failed';

export interface HeroContent {
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  videoUrl?: string;
  durationSeconds: number;
}

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
  actionLabel?: string;
  secondaryLabel?: string;
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

export interface WhatifHomeResponse {
  hero: HeroContent;
  statusCard: HomeStatusCard;
  works: WhatifWork[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface WhatifWorksResponse {
  works: WhatifWork[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateStoryDraftResponse {
  draftId: string;
  nextPage: 'cast_setting';
  createdAt: string;
}
