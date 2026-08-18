import axios from 'axios';

const logger = { error: (...a: unknown[]) => console.error(...a), info: (...a: unknown[]) => console.log(...a) };

/** 请求封装：baseURL 取部署子路径（window.BASE_PATH） */
function axiosForBackend(cfg: Record<string, unknown>): Promise<{ data: unknown }> {
  const baseURL = typeof window !== 'undefined' ? (window as any).BASE_PATH || '/' : '/';
  return axios.request({ baseURL, ...cfg });
}

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

const WHATIF_USER_KEY = 'whatif-anonymous-user-id';

function whatifHeaders(extra?: Record<string, string>) {
  let userId = localStorage.getItem(WHATIF_USER_KEY);
  if (!userId) {
    userId = `web_${crypto.randomUUID()}`;
    localStorage.setItem(WHATIF_USER_KEY, userId);
  }
  return { 'x-demo-user-id': userId, ...extra };
}

export async function getWhatifHome(): Promise<WhatifHomeResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/whatif/home',
      method: 'GET',
      headers: whatifHeaders(),
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
      headers: whatifHeaders(),
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
  mode?: 'create' | 'remix';
  templateId?: string;
  sourceWorkId?: string;
  idempotencyKey?: string;
}): Promise<CreateStoryDraftResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/story-drafts',
      method: 'POST',
      data: input ?? { source: 'home_create' },
      headers: whatifHeaders(),
    });
    return response.data as CreateStoryDraftResponse;
  } catch (error) {
    logger.error('创建故事草稿失败', error);
    throw error;
  }
}

export async function whatifRequest<T>(
  url: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
    data?: unknown;
    params?: Record<string, unknown>;
    timeoutMs?: number;
  },
): Promise<T> {
  try {
    const response = await axiosForBackend({
      url,
      method: options?.method ?? 'GET',
      data: options?.data,
      params: options?.params,
      headers: whatifHeaders(),
      timeout: options?.timeoutMs,
    });
    return response.data as T;
  } catch (error) {
    logger.error(`Whatif API 请求失败：${url}`, error);
    throw error;
  }
}

export async function uploadWhatifImage(file: File): Promise<{ filePath: string; url: string; traceId: string }> {
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await axiosForBackend({
      url: '/api/uploads/images',
      method: 'POST',
      data: form,
      headers: whatifHeaders({ 'Content-Type': 'multipart/form-data' }),
    });
    return response.data as { filePath: string; url: string; traceId: string };
  } catch (error) {
    logger.error('上传 Whatif 图片失败', error);
    throw error;
  }
}

export async function getCastSetting(draftId: string): Promise<CastSettingResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/story-drafts/${draftId}/cast-setting`,
      method: 'GET',
      headers: whatifHeaders(),
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
      headers: whatifHeaders(),
    });
    return response.data as UpdateCastSettingResponse;
  } catch (error) {
    logger.error('保存角色与世界观失败', error);
    throw error;
  }
}
