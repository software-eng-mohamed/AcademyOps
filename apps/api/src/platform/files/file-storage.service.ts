import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FileAsset } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type StoredFile = {
  storageKey: string;
  sizeBytes: bigint;
};

@Injectable()
export class FileStorageService {
  private readonly client?: S3Client;
  private readonly bucket?: string;
  private readonly localRoot: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const endpoint = config.get<string>('R2_ENDPOINT');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = config.get<string>('R2_BUCKET');
    if (endpoint && accessKeyId && secretAccessKey && bucket) {
      this.client = new S3Client({
        endpoint,
        region: 'auto',
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.bucket = bucket;
    }
    this.localRoot = resolve(
      config.get<string>('PRIVATE_FILE_STORAGE_ROOT') ??
        resolve(process.cwd(), '../../work/private-files'),
    );
  }

  async putPrivate(
    storageKey: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<StoredFile> {
    if (this.client && this.bucket) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: bytes,
          ContentType: contentType,
          CacheControl: 'private, no-store',
        }),
      );
      return { storageKey, sizeBytes: BigInt(bytes.byteLength) };
    }

    const target = this.safeLocalPath(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { storageKey, sizeBytes: BigInt(bytes.byteLength) };
  }

  async deletePrivate(storageKey: string): Promise<void> {
    if (this.client && this.bucket) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      return;
    }
    await rm(this.safeLocalPath(storageKey), { force: true });
  }

  async createDownloadUrl(asset: FileAsset, ttlSeconds = 300) {
    if (asset.classification !== 'PRIVATE' || asset.scanStatus !== 'CLEAN') {
      throw this.notFound();
    }
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    if (this.client && this.bucket) {
      const url = await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: asset.storageKey,
          ResponseContentType: asset.contentType,
          ResponseContentDisposition: `attachment; filename="${this.downloadName(asset)}"`,
        }),
        { expiresIn: ttlSeconds },
      );
      return { url, expiresAt: expiresAt.toISOString() };
    }

    const expires = Math.floor(expiresAt.getTime() / 1000);
    const signature = this.sign(asset.id, expires);
    const base = this.config.getOrThrow<string>('WEB_ORIGIN').replace(/\/$/, '');
    return {
      url: `${base}/api/v1/files/${asset.id}/content?expires=${expires}&signature=${signature}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async localContent(fileAssetId: string, expiresRaw: string, signature: string) {
    if (this.client) throw this.notFound();
    const expires = Number(expiresRaw);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !Number.isSafeInteger(expires) ||
      expires < nowSeconds ||
      expires > nowSeconds + 600 ||
      !signature ||
      !this.safeSignature(fileAssetId, expires, signature)
    ) {
      throw this.notFound();
    }
    const asset = await this.prisma.fileAsset.findUnique({ where: { id: fileAssetId } });
    if (!asset || asset.classification !== 'PRIVATE' || asset.scanStatus !== 'CLEAN') {
      throw this.notFound();
    }
    const path = this.safeLocalPath(asset.storageKey);
    try {
      const details = await stat(path);
      if (!details.isFile() || details.size !== Number(asset.sizeBytes)) throw this.notFound();
    } catch {
      throw this.notFound();
    }
    return new StreamableFile(createReadStream(path), {
      type: asset.contentType,
      disposition: `attachment; filename="${this.downloadName(asset)}"`,
      length: Number(asset.sizeBytes),
    });
  }

  private safeLocalPath(storageKey: string): string {
    const path = resolve(this.localRoot, storageKey);
    if (path !== this.localRoot && !path.startsWith(`${this.localRoot}${sep}`)) {
      throw new Error('Invalid private storage key');
    }
    return path;
  }

  private sign(fileAssetId: string, expires: number): string {
    return createHmac('sha256', this.config.getOrThrow<string>('FILE_SIGNING_SECRET'))
      .update(`file:${fileAssetId}:${expires}`)
      .digest('base64url');
  }

  private safeSignature(fileAssetId: string, expires: number, signature: string): boolean {
    const expected = Buffer.from(this.sign(fileAssetId, expires));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private downloadName(asset: FileAsset): string {
    const extension = asset.contentType.startsWith('application/pdf')
      ? 'pdf'
      : asset.contentType.startsWith('text/csv')
        ? 'csv'
        : 'bin';
    return `${asset.id}.${extension}`;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'FILE_NOT_FOUND',
      messageKey: 'files.notFound',
    });
  }
}
