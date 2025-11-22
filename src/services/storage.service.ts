import { supabaseAdmin } from '@/config/supabase';
import { logger } from '@/utils/logger';

/**
 * Supabase Storage Service
 * Handles file uploads, downloads, and management in Supabase Storage
 */

const STORAGE_BUCKET = 'documents';

export interface UploadResult {
    storage_path: string;
    public_url?: string;
    file_size: number;
}

/**
 * Upload file to Supabase Storage
 */
export const uploadFile = async (
    userId: string,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string = 'application/pdf'
): Promise<UploadResult> => {
    try {
        // Create unique path: documents/{userId}/{timestamp}-{filename}
        const timestamp = Date.now();
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${userId}/${timestamp}-${sanitizedFileName}`;

        // Upload to Supabase Storage
        const { data, error } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, fileBuffer, {
                contentType: mimeType,
                upsert: false,
            });

        if (error) {
            logger.error({ error, userId, fileName }, 'Failed to upload file to storage');
            throw new Error(`Storage upload failed: ${error.message}`);
        }

        logger.info({ storagePath, userId, fileName }, 'File uploaded successfully');

        return {
            storage_path: data.path,
            file_size: fileBuffer.length,
        };
    } catch (error) {
        logger.error({ error, userId, fileName }, 'Error in uploadFile');
        throw error;
    }
};

/**
 * Get signed URL for file download (valid for 1 hour)
 */
export const getFileUrl = async (
    storagePath: string,
    expiresIn: number = 3600
): Promise<string> => {
    try {
        const { data, error } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(storagePath, expiresIn);

        if (error || !data) {
            logger.error({ error, storagePath }, 'Failed to create signed URL');
            throw new Error('Failed to get file URL');
        }

        return data.signedUrl;
    } catch (error) {
        logger.error({ error, storagePath }, 'Error in getFileUrl');
        throw error;
    }
};

/**
 * Delete file from storage
 */
export const deleteFile = async (storagePath: string): Promise<void> => {
    try {
        const { error } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .remove([storagePath]);

        if (error) {
            logger.error({ error, storagePath }, 'Failed to delete file from storage');
            throw new Error('Failed to delete file');
        }

        logger.info({ storagePath }, 'File deleted successfully');
    } catch (error) {
        logger.error({ error, storagePath }, 'Error in deleteFile');
        throw error;
    }
};

/**
 * Check if file exists in storage
 */
export const fileExists = async (storagePath: string): Promise<boolean> => {
    try {
        const { data, error } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .list(storagePath.split('/').slice(0, -1).join('/'), {
                search: storagePath.split('/').pop(),
            });

        if (error) {
            return false;
        }

        return data && data.length > 0;
    } catch (error) {
        logger.error({ error, storagePath }, 'Error checking file existence');
        return false;
    }
};
