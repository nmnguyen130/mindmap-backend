import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '@/config/env';
import { generalLimiter } from '@/middlewares/rateLimiter';
import { errorHandler } from '@/middlewares/errorHandler';
import { logger } from '@/utils/logger';

// Import routes
import authRoutes from '@/modules/auth/routes';
import ragRoutes from '@/modules/rag/routes';
import conversationRoutes from '@/modules/conversations/routes';
import mindmapRoutes from '@/modules/mindmaps/routes';

export const createApp = (): Application => {
    const app = express();

    // Security middleware
    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));

    // CORS
    app.use(cors({
        origin: env.NODE_ENV === 'production'
            ? ['https://your-frontend-domain.com']
            : ['http://localhost:3000', 'http://localhost:19006'],
        credentials: true,
    }));

    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    app.use(generalLimiter);

    // Health check
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // API routes
    app.use('/api/auth', authRoutes);
    app.use('/api', ragRoutes);
    app.use('/api/conversations', conversationRoutes);
    app.use('/api/mindmaps', mindmapRoutes);

    // 404 handler
    app.use((req, res) => {
        res.status(404).json({
            success: false,
            error: {
                message: 'Route not found',
                code: 'NOT_FOUND',
            },
        });
    });

    // Error handler (must be last)
    app.use(errorHandler);

    logger.info('Express app configured');

    return app;
};
