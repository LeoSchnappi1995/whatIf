import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

import type {
  CreateStoryDraftResponse,
  WhatifHomeResponse,
  WhatifWorksResponse,
} from '@/pages/WhatifHome/types';
import type {
  CastSettingResponse,
  UpdateCastSettingInput,
  UpdateCastSettingResponse,
} from '@/pages/CastSetting/types';

export async function getWhatifHome(): Promise<WhatifHomeResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/whatif/home',
      method: 'GET',
    });
    return response.data as WhatifHomeResponse;
  } catch (error) {
    logger.error('获取 Whatif 首页失败', error);
    throw error;
  }
}

export async function getWhatifWorks(
  cursor: string,
  pageSize = 6,
): Promise<WhatifWorksResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/whatif/works',
      method: 'GET',
      params: { cursor, pageSize },
    });
    return response.data as WhatifWorksResponse;
  } catch (error) {
    logger.error('获取热门 Whatif 失败', error);
    throw error;
  }
}

export async function createStoryDraft(input?: {
  source?: 'home_create' | 'work_remake';
  workId?: string;
}): Promise<CreateStoryDraftResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/story-drafts',
      method: 'POST',
      data: input ?? { source: 'home_create' },
    });
    return response.data as CreateStoryDraftResponse;
  } catch (error) {
    logger.error('创建故事草稿失败', error);
    throw error;
  }
}

export async function getCastSetting(draftId: string): Promise<CastSettingResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/story-drafts/${draftId}/cast-setting`,
      method: 'GET',
    });
    return response.data as CastSettingResponse;
  } catch (error) {
    logger.error('获取角色与世界观失败', error);
    throw error;
  }
}

export async function updateCastSetting(
  draftId: string,
  input: UpdateCastSettingInput,
): Promise<UpdateCastSettingResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/story-drafts/${draftId}/cast-setting`,
      method: 'PUT',
      data: input,
    });
    return response.data as UpdateCastSettingResponse;
  } catch (error) {
    logger.error('保存角色与世界观失败', error);
    throw error;
  }
}
