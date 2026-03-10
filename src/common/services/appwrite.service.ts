import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Storage, ID } from 'node-appwrite';
import 'multer';

@Injectable()
export class AppwriteService {
  private readonly logger = new Logger(AppwriteService.name);
  private client: Client | null = null;
  private storage: Storage | null = null;
  private readonly bucketId: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('APPWRITE_ENDPOINT');
    const projectId = this.configService.get<string>('APPWRITE_PROJECT_ID');
    const apiKey = this.configService.get<string>('APPWRITE_API_KEY');
    this.bucketId = this.configService.get<string>('APPWRITE_BUCKET_ID', 'carepass-files');

    if (endpoint && projectId && apiKey) {
      this.client = new Client()
        .setEndpoint(endpoint)
        .setProject(projectId)
        .setKey(apiKey);
      this.storage = new Storage(this.client);
      this.logger.log('Appwrite storage service initialized');
    } else {
      this.logger.warn('Appwrite credentials not set — file uploads will use local fallback');
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<{ fileId: string; url: string }> {
    const fileId = ID.unique();

    if (!this.storage) {
      // Fallback: return a placeholder URL
      const url = `/uploads/${folder}/${fileId}-${file.originalname}`;
      this.logger.warn(`Appwrite not configured — using placeholder: ${url}`);
      return { fileId, url };
    }

    try {
      // node-appwrite v14 accepts a File-like object or Blob
      const uint8 = new Uint8Array(file.buffer);
      const blob = new Blob([uint8], { type: file.mimetype });
      const uploadFile = new File([blob], file.originalname, { type: file.mimetype });

      const result = await this.storage.createFile(
        this.bucketId,
        fileId,
        uploadFile,
      );

      const endpoint = this.configService.get<string>('APPWRITE_ENDPOINT');
      const projectId = this.configService.get<string>('APPWRITE_PROJECT_ID');
      const url = `${endpoint}/storage/buckets/${this.bucketId}/files/${result.$id}/view?project=${projectId}`;

      this.logger.log(`File uploaded: ${result.$id}`);
      return { fileId: result.$id, url };
    } catch (error) {
      this.logger.error(`File upload failed: ${error}`);
      throw error;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.storage) {
      this.logger.warn(`Appwrite not configured — skip delete for ${fileId}`);
      return;
    }

    try {
      await this.storage.deleteFile(this.bucketId, fileId);
      this.logger.log(`File deleted: ${fileId}`);
    } catch (error) {
      this.logger.error(`File delete failed: ${error}`);
    }
  }
}
