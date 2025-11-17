import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { apiRateLimit } from './api/middlewares/rateLimit'
import api from './api/routes'
import { errorHandler } from './api/middlewares/error'
import { env, assertEnv } from './config/env'
import { logger } from './utils/logger'
import path from 'node:path'

assertEnv()

export const app = express()

app.use(helmet())
app.use(cors({ origin: env.corsOrigin }))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(apiRateLimit)

// OpenAPI docs JSON
app.get('/api/docs/openapi.json', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'src', 'api', 'docs', 'openapi.json'))
})

// Routes
app.use('/api', api)

// Health
app.get('/health', (_req, res) => res.json({ ok: true }))

// Errors
app.use(errorHandler)

process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'))
process.on('uncaughtException', (err) => logger.error({ err }, 'uncaughtException'))
