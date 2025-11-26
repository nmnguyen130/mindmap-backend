import multer from 'multer';
import { ValidationError } from '@/utils/errors';

// Multer configuration for file uploads
const storage = multer.memoryStorage();

// File filter to accept only PDFs
const fileFilter = (
    req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new ValidationError('Only PDF files are allowed'));
    }
};

// Upload middleware configuration
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

// Single file upload middleware for 'file' field
export const uploadSinglePdf = upload.single('file');
