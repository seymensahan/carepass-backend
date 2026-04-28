import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import 'multer';

/**
 * Cloudinary-backed storage service.
 *
 * Same `uploadFile` / `deleteFile` interface as the previous AppwriteService,
 * so callers (lab-results, users, institutions) don't need to change anything
 * other than the constructor injection.
 *
 * Returned URLs are public CDN URLs (https://res.cloudinary.com/...) — no
 * signed URL or auth token needed. Patient mobile, doctor mobile, and the web
 * app can all open them directly.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log(`Cloudinary storage initialized (cloud: ${cloudName})`);
    } else {
      this.logger.warn(
        'Cloudinary credentials not set — file uploads will use placeholder URLs',
      );
    }
  }

  /**
   * Upload a multipart file to Cloudinary.
   *
   * @param file   the multer file (buffer-based)
   * @param folder logical folder inside the Cloudinary library
   *               (e.g. "lab-results", "avatars", "institution-documents")
   * @returns      `{ fileId, url }` — fileId is Cloudinary's public_id, used to delete later
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<{ fileId: string; url: string }> {
    if (!this.isConfigured) {
      // Same fallback behaviour as the old AppwriteService — never crash the
      // request, return a placeholder URL the UI can still render (won't open).
      const placeholderId = `local-${Date.now()}`;
      const url = `/uploads/${folder}/${placeholderId}-${file.originalname}`;
      this.logger.warn(`Cloudinary not configured — placeholder URL: ${url}`);
      return { fileId: placeholderId, url };
    }

    try {
      const result = await this.uploadBuffer(file, `carypass/${folder}`);
      this.logger.log(`File uploaded: ${result.public_id}`);
      return { fileId: result.public_id, url: result.secure_url };
    } catch (error) {
      this.logger.error(`Cloudinary upload failed: ${error}`);
      const placeholderId = `failed-${Date.now()}`;
      const url = `/uploads/${folder}/${placeholderId}-${file.originalname}`;
      this.logger.warn(`Falling back to placeholder URL: ${url}`);
      return { fileId: placeholderId, url };
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn(`Cloudinary not configured — skip delete for ${fileId}`);
      return;
    }

    try {
      await cloudinary.uploader.destroy(fileId, { invalidate: true });
      this.logger.log(`File deleted: ${fileId}`);
    } catch (error) {
      this.logger.error(`Cloudinary delete failed: ${error}`);
    }
  }

  /**
   * Cloudinary's `upload_stream` accepts a buffer via stream pipe — this is
   * the only way to upload from a multer in-memory file without first writing
   * it to disk.
   */
  private uploadBuffer(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          // `auto` lets Cloudinary handle pdf, jpg, png, etc. automatically
          resource_type: 'auto',
          // Use the original filename in the public_id for friendlier URLs,
          // but Cloudinary appends a random suffix for uniqueness.
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Empty upload result'));
            return;
          }
          resolve(result);
        },
      );
      stream.end(file.buffer);
    });
  }
}
