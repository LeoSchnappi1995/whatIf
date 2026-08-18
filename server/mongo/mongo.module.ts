import { Global, Module } from '@nestjs/common';
import { MongoClient, type Collection } from 'mongodb';

export const MONGO = Symbol('MONGO');

export interface WhatifMongo {
  users: Collection;              // 复用记账账号（ai_jizhang.users）
  characters: Collection;
  characterAssets: Collection;
  worldviews: Collection;
  storyDrafts: Collection;
  draftCharacters: Collection;
  stories: Collection;
  storyBranches: Collection;
  scenes: Collection;
  videoTasks: Collection;
  invitations: Collection;
  authorizationSnapshots: Collection;
  publications: Collection;
  idempotencyRecords: Collection;
}

@Global()
@Module({
  providers: [
    {
      provide: MONGO,
      useFactory: async (): Promise<WhatifMongo> => {
        const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
        const BIZ_DB = process.env.MONGO_DB || 'whatif';
        const USERS_DB = process.env.USERS_DB || 'ai_jizhang';
        const client = new MongoClient(MONGO_URL);
        await client.connect();
        const biz = client.db(BIZ_DB);
        const usersDb = client.db(USERS_DB);
        const mongo: WhatifMongo = {
          users: usersDb.collection('users'),
          characters: biz.collection('whatif_characters'),
          characterAssets: biz.collection('whatif_character_assets'),
          worldviews: biz.collection('whatif_worldviews'),
          storyDrafts: biz.collection('whatif_story_drafts'),
          draftCharacters: biz.collection('whatif_draft_characters'),
          stories: biz.collection('whatif_stories'),
          storyBranches: biz.collection('whatif_story_branches'),
          scenes: biz.collection('whatif_scenes'),
          videoTasks: biz.collection('whatif_video_tasks'),
          invitations: biz.collection('whatif_invitations'),
          authorizationSnapshots: biz.collection('whatif_authorization_snapshots'),
          publications: biz.collection('whatif_publications'),
          idempotencyRecords: biz.collection('whatif_idempotency_records'),
        };
        return mongo;
      },
    },
  ],
  exports: [MONGO],
})
export class MongoModule {}
