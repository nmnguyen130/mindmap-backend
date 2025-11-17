import { app } from './app'
import { env } from '@/config/env'
import { logger } from '@/core/utils/logger'

app.listen(env.port, () => {
  logger.info({ port: env.port }, 'API server running')
})
