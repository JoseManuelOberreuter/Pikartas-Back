/**
 * Startup health checks: verify availability of all backend services.
 * Results are logged so you can confirm everything is ready.
 */

import { verifyEmailConnection } from './mailer.js';

const OK = '✅';
const FAIL = '❌';

/**
 * Run all non-DB service checks (DB is already verified by connectDB before this runs).
 * @returns {Promise<{ email: { ok: boolean, error?: string }, jwt: boolean, frontendUrl: boolean, transbank: string }>}
 */
export async function runStartupHealthChecks() {
  const [emailResult] = await Promise.all([
    verifyEmailConnection()
  ]);

  const jwtConfigured = Boolean(process.env.JWT_SECRET);
  const frontendUrlConfigured = Boolean(process.env.FRONTEND_URL?.trim());
  const transbankEnv = process.env.TRANSBANK_ENVIRONMENT || 'integration';
  const transbankConfigured = transbankEnv === 'production'
    ? Boolean(process.env.TRANSBANK_API_KEY && process.env.TRANSBANK_COMMERCE_CODE)
    : true; // integration mode works with SDK defaults

  return {
    email: emailResult,
    jwt: jwtConfigured,
    frontendUrl: frontendUrlConfigured,
    transbank: transbankConfigured ? transbankEnv : 'not_configured'
  };
}

/**
 * Log startup availability report (always to console so it's visible in any environment).
 * @param {object} report - Result from runStartupHealthChecks()
 * @param {boolean} supabaseOk - Whether DB connection succeeded
 */
export function logStartupReport(report, supabaseOk) {
  const lines = [
    '',
    '---------- Servicios al inicio ----------',
    `  Supabase (DB)     ${supabaseOk ? OK : FAIL} ${supabaseOk ? 'Disponible' : 'Error de conexión'}`,
    `  Email (SMTP)      ${report.email?.ok ? OK : FAIL} ${report.email?.ok ? 'Disponible' : (report.email?.error || 'No configurado')}`,
    `  JWT_SECRET        ${report.jwt ? OK : FAIL} ${report.jwt ? 'Configurado' : 'No configurado'}`,
    `  FRONTEND_URL      ${report.frontendUrl ? OK : FAIL} ${report.frontendUrl ? 'Configurado' : 'No configurado'}`,
    `  Transbank         ${report.transbank !== 'not_configured' ? OK : FAIL} ${report.transbank === 'integration' ? 'Integración' : report.transbank === 'production' ? 'Producción' : 'No configurado'}`,
    '----------------------------------------',
    ''
  ];
  console.log(lines.join('\n'));
}
