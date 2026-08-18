import { Injectable } from '@nestjs/common';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

/** 本地磁盘文件存储（替代平台 FileService） */
@Injectable()
export class FilesService {
  constructor() {
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  async upload(
    buffer: Buffer,
    opts?: { fileName?: string; contentType?: string },
  ): Promise<{ filePath: string; url: string }> {
    const fileName = opts?.fileName || `${randomUUID()}.bin`;
    writeFileSync(join(UPLOAD_DIR, fileName), buffer);
    const filePath = `uploads/${fileName}`;
    return { filePath, url: `${PUBLIC_BASE}/${filePath}` };
  }

  async createSignedUrl(path: string, _expiresSec?: number): Promise<string> {
    if (/^https?:\/\//.test(path)) return path;
    return `${PUBLIC_BASE}/${path.replace(/^\/+/, '')}`;
  }

  static uploadDir(): string {
    return UPLOAD_DIR;
  }
}
