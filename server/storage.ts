import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { UploadRecord } from '../src/types/files.ts';
import { sanitizeFileName, sanitizeRelativePath } from '../src/utils/fileValidation.ts';

export interface SaveFileInput {
  tempFilePath: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  relativePath?: string;
}

export interface StorageStats {
  totalFiles: number;
  totalBytes: number;
}

export interface StorageProvider {
  init(): Promise<void>;
  saveFile(input: SaveFileInput): Promise<UploadRecord>;
  listRecords(): Promise<UploadRecord[]>;
  deleteRecord(id: string): Promise<boolean>;
  getStats(): Promise<StorageStats>;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;
  private readonly filesDir: string;
  private readonly historyPath: string;

  constructor(baseDir: string = path.resolve(process.env.UPLOAD_DIR || './uploads')) {
    this.baseDir = path.resolve(baseDir);
    this.filesDir = path.join(this.baseDir, 'files');
    this.historyPath = path.join(this.baseDir, 'history.json');
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.filesDir, { recursive: true });
    await fs.mkdir(path.join(this.baseDir, '.tmp'), { recursive: true });
    try {
      await fs.access(this.historyPath);
    } catch {
      await fs.writeFile(this.historyPath, '[]', 'utf-8');
    }
  }

  public getTempDir(): string {
    return path.join(this.baseDir, '.tmp');
  }

  private assertContainedPath(targetPath: string): void {
    const resolvedBase = path.resolve(this.filesDir);
    const resolvedTarget = path.resolve(targetPath);
    if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
      throw new Error('Invalid storage path detected.');
    }
  }

  private async readHistory(): Promise<UploadRecord[]> {
    try {
      const raw = await fs.readFile(this.historyPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeHistory(records: UploadRecord[]): Promise<void> {
    await fs.writeFile(this.historyPath, JSON.stringify(records, null, 2), 'utf-8');
  }

  public async saveFile(input: SaveFileInput): Promise<UploadRecord> {
    await this.init();

    const id = crypto.randomUUID();
    const safeOriginal = sanitizeFileName(input.originalName);
    const safeStoredName = `${id.slice(0, 8)}_${safeOriginal}`;
    const destinationPath = path.join(this.filesDir, safeStoredName);

    this.assertContainedPath(destinationPath);

    await fs.copyFile(input.tempFilePath, destinationPath);
    await fs.unlink(input.tempFilePath).catch(() => undefined);

    const cleanRelPath = sanitizeRelativePath(input.relativePath) || safeOriginal;
    const parts = cleanRelPath.split('/');
    const folderName = parts.length > 1 ? parts[0] : null;

    const record: UploadRecord = {
      id,
      originalName: safeOriginal,
      safeName: safeStoredName,
      size: input.size,
      mimeType: input.mimeType,
      extension: input.extension,
      relativePath: cleanRelPath,
      folderName,
      status: 'uploaded',
      uploadedAt: new Date().toISOString(),
    };

    const history = await this.readHistory();
    const updated = [record, ...history].slice(0, 250);
    await this.writeHistory(updated);

    return record;
  }

  public async listRecords(): Promise<UploadRecord[]> {
    await this.init();
    return this.readHistory();
  }

  public async deleteRecord(id: string): Promise<boolean> {
    await this.init();
    const history = await this.readHistory();
    const target = history.find((item) => item.id === id);
    if (!target) return false;

    const filePath = path.join(this.filesDir, path.basename(target.safeName));
    this.assertContainedPath(filePath);
    await fs.unlink(filePath).catch(() => undefined);

    const remaining = history.filter((item) => item.id !== id);
    await this.writeHistory(remaining);
    return true;
  }

  public async getStats(): Promise<StorageStats> {
    const records = await this.listRecords();
    const totalBytes = records.reduce((sum, r) => sum + (r.size || 0), 0);
    return {
      totalFiles: records.length,
      totalBytes,
    };
  }
}
