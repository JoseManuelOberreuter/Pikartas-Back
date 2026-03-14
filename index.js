import dotenv from 'dotenv';
dotenv.config(); // Cargar variables de entorno

import connectDB from './database.js';
import app from './server.js';
import logger from './utils/logger.js';
import { runStartupHealthChecks, logStartupReport } from './utils/startupHealthCheck.js';

const PORT = process.env.PORT || 4005; // Puerto del servidor

const startMessage = `
🚀 Servidor Pikartas iniciado 🚀
-------------------------------
`;

logger.info(startMessage);

// Connect DB first, then run availability checks and log, then start server
connectDB().then(async () => {
  const report = await runStartupHealthChecks();
  logStartupReport(report, true);

  app.listen(PORT, () => {
    logger.info(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    logger.info(`📚 Documentación Swagger disponible en: http://localhost:${PORT}/api-docs`);
    
    // Conditional Transbank environment message (safe to log)
    const environment = process.env.TRANSBANK_ENVIRONMENT || 'integration';
    if (environment === 'integration') {
      logger.info('💳 Usando credenciales de integración de Transbank');
    } else {
      logger.info('💳 Usando credenciales de producción de Transbank');
    }
  });
}).catch(err => {
  logger.error("Error al conectar a la base de datos:", err);
  process.exit(1); // Detiene la ejecución si la conexión falla
});
