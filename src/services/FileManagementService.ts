import fs from 'fs/promises';
import path from 'path';
import { log } from '../utils/logger';

export class FileManagementService {
  private static uploadDir = process.env.UPLOAD_DIR || './uploads';
  private static maxFileAgeDays = 30; // Keep payment proofs for 30 days

  /**
   * Initialize upload directories
   * Creates all required directories if they don't exist
   */
  static async initializeDirectories(): Promise<void> {
    const directories = [
      path.join(this.uploadDir, 'payment-proofs'),
      path.join(this.uploadDir, 'temp'),
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
        log.info(`Ensured directory exists: ${dir}`);
      } catch (error) {
        log.error(`Failed to create directory ${dir}:`, error);
        throw error;
      }
    }
  }

  /**
   * Get upload directory path
   */
  static getUploadDir(): string {
    return this.uploadDir;
  }

  /**
   * Get payment proofs directory
   */
  static getPaymentProofsDir(): string {
    return path.join(this.uploadDir, 'payment-proofs');
  }

  /**
   * Clean up old payment proofs
   * Removes files older than maxFileAgeDays
   */
  static async cleanupOldFiles(): Promise<{ deleted: number; errors: number }> {
    const proofDir = this.getPaymentProofsDir();

    try {
      // Check if directory exists
      try {
        await fs.access(proofDir);
      } catch {
        log.warn(`Payment proofs directory does not exist: ${proofDir}`);
        return { deleted: 0, errors: 0 };
      }

      const files = await fs.readdir(proofDir);
      const now = Date.now();
      const maxAge = this.maxFileAgeDays * 24 * 60 * 60 * 1000; // Convert to milliseconds

      let deleted = 0;
      let errors = 0;

      for (const file of files) {
        try {
          const filePath = path.join(proofDir, file);
          const stats = await fs.stat(filePath);

          // Check if file is older than max age
          if (now - stats.mtimeMs > maxAge) {
            await fs.unlink(filePath);
            deleted++;
            log.info(`Deleted old payment proof: ${file} (age: ${Math.floor((now - stats.mtimeMs) / (24 * 60 * 60 * 1000))} days)`);
          }
        } catch (error) {
          log.error(`Error processing file ${file}:`, error);
          errors++;
        }
      }

      log.info(`Cleanup completed: ${deleted} files deleted, ${errors} errors`);
      return { deleted, errors };
    } catch (error) {
      log.error('Error during file cleanup:', error);
      return { deleted: 0, errors: 1 };
    }
  }

  /**
   * Get file size in bytes
   */
  static async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      log.error(`Error getting file size for ${filePath}:`, error);
      return 0;
    }
  }

  /**
   * Get total directory size
   */
  static async getDirectorySize(dirPath: string): Promise<number> {
    try {
      const files = await fs.readdir(dirPath);
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch (error) {
      log.error(`Error calculating directory size for ${dirPath}:`, error);
      return 0;
    }
  }

  /**
   * Get storage statistics
   */
  static async getStorageStats(): Promise<{
    paymentProofsSize: number;
    paymentProofsCount: number;
    totalSize: number;
  }> {
    try {
      const proofDir = this.getPaymentProofsDir();

      let paymentProofsSize = 0;
      let paymentProofsCount = 0;

      try {
        paymentProofsSize = await this.getDirectorySize(proofDir);
        const files = await fs.readdir(proofDir);
        paymentProofsCount = files.length;
      } catch {
        // Directory doesn't exist yet
      }

      const totalSize = await this.getDirectorySize(this.uploadDir);

      return {
        paymentProofsSize,
        paymentProofsCount,
        totalSize,
      };
    } catch (error) {
      log.error('Error getting storage stats:', error);
      return {
        paymentProofsSize: 0,
        paymentProofsCount: 0,
        totalSize: 0,
      };
    }
  }

  /**
   * Delete specific file
   */
  static async deleteFile(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath);
      log.info(`Deleted file: ${filePath}`);
      return true;
    } catch (error) {
      log.error(`Error deleting file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Check if file exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}
