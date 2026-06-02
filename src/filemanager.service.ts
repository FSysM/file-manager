import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from './prisma/prisma.service';
import { randomUUID } from 'crypto';

export type FileFolder = 'REVIEWS' | 'TEXT' | 'FILES';

@Injectable()
export class FileManagerService {
  private readonly s3: S3Client;
  private readonly s3Presign: S3Client;
  private readonly bucket: string;
  private readonly internalEndpoint: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    const useSSL = config.get<string>('MINIO_USE_SSL') === 'true';
    this.internalEndpoint = `${useSSL ? 'https' : 'http'}://${config.getOrThrow('MINIO_ENDPOINT')}:${config.getOrThrow('MINIO_PORT')}`;
    this.publicUrl = config.getOrThrow<string>('MINIO_PUBLIC_URL');
    this.bucket = config.getOrThrow('MINIO_BUCKET_NAME');

    const credentials = {
      accessKeyId: config.getOrThrow('MINIO_ROOT_USER'),
      secretAccessKey: config.getOrThrow('MINIO_ROOT_PASSWORD'),
    };

    // Used for actual S3 operations (delete, etc.) via internal network
    this.s3 = new S3Client({
      endpoint: this.internalEndpoint,
      region: 'us-east-1',
      credentials,
      forcePathStyle: true,
    });

    // Used only for presigning URLs — endpoint matches what the browser will request
    // so the Host in the signature equals what Traefik forwards to MinIO
    const publicUrlParsed = new URL(this.publicUrl);
    const publicBaseEndpoint = `${publicUrlParsed.protocol}//${publicUrlParsed.host}`;
    this.s3Presign = new S3Client({
      endpoint: publicBaseEndpoint,
      region: 'us-east-1',
      credentials,
      forcePathStyle: true,
    });
  }

  private toPublicUrl(signedUrl: string): string {
    // s3Presign generates: https://localhost/fsysm-files/{key}?...
    // We need:             https://localhost/storage/fsysm-files/{key}?...
    // (Traefik strips /storage before forwarding to MinIO, so the signed path stays valid)
    const publicUrlParsed = new URL(this.publicUrl);
    const publicBaseEndpoint = `${publicUrlParsed.protocol}//${publicUrlParsed.host}`;
    return signedUrl.replace(`${publicBaseEndpoint}/${this.bucket}`, this.publicUrl);
  }

  async getUploadUrl(submissionId: string, folder: FileFolder, filename: string, contentType: string) {
    const key = `${submissionId}/${folder.toLowerCase()}/${randomUUID()}/${filename}`;
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    const signed = await getSignedUrl(this.s3Presign, command, { expiresIn: 900 });
    return { uploadUrl: this.toPublicUrl(signed), key };
  }

  async confirmUpload(data: {
    key: string;
    filename: string;
    contentType: string;
    folder: FileFolder;
    submissionId: string;
    reviewId?: string;
    uploadedById: string;
    size?: number;
  }) {
    return this.prisma.submissionFile.create({
      data: {
        key: data.key,
        filename: data.filename,
        contentType: data.contentType,
        folder: data.folder as any,
        submissionId: data.submissionId,
        reviewId: data.reviewId,
        uploadedById: data.uploadedById,
        size: data.size,
      },
    });
  }

  async deleteFile(fileId: string, userId: string) {
    const file = await this.prisma.submissionFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    if (file.uploadedById !== userId) throw new ForbiddenException('You can only delete your own files');

    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: file.key }));
    await this.prisma.submissionFile.delete({ where: { id: fileId } });
    return file;
  }

  listSubmissionFiles(submissionId: string) {
    return this.prisma.submissionFile.findMany({
      where: { submissionId },
      orderBy: [{ folder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  listReviewFiles(reviewId: string) {
    return this.prisma.submissionFile.findMany({
      where: { reviewId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDownloadUrl(fileId: string) {
    const file = await this.prisma.submissionFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: file.key,
      ResponseContentDisposition: `attachment; filename="${file.filename}"`,
    });
    const signed = await getSignedUrl(this.s3Presign, command, { expiresIn: 300 });
    return { url: this.toPublicUrl(signed) };
  }
}
