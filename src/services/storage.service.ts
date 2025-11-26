import { supabaseAdmin } from '@/config/supabase';
import { logger } from '@/utils/logger';

/**
 * Supabase Storage Service
 * 
 * **IMPORTANT**: This service uses `supabaseAdmin` (service role) because:
 * 1. Supabase Storage operations require service role authentication
 * 2. Storage buckets use their own bucket policies, NOT Row Level Security (RLS)
 * 3. File uploads/downloads need to bypass RLS to access the storage bucket directly
 * 
 * This is an exception to the general rule of using authenticated clients.
 * All other database queries should use `createSupabaseClient(accessToken)`.
 */

const STORAGE_BUCKET = 'documents';

export interface UploadResult {
    id: string;
    path: string;
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
            id: data.id,
            path: data.path,
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
