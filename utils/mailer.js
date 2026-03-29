import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Verify SMTP connection (for startup health check).
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export const verifyEmailConnection = async () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return { ok: false, error: 'EMAIL_USER or EMAIL_PASS not set' };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
};

// Centralized branding configuration for all outgoing emails
const getLogoUrl = () => {
  if (process.env.BRAND_LOGO_URL) {
    return process.env.BRAND_LOGO_URL;
  }
  if (process.env.FRONTEND_URL) {
    return `${process.env.FRONTEND_URL}/assets/img/logo.png`;
  }
  return 'https://via.placeholder.com/180x180?text=Pikartas';
};

const brandConfig = {
  name: process.env.BRAND_NAME || 'Pikartas',
  logoUrl: getLogoUrl(),
  supportEmail: process.env.BRAND_SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@example.com',
  primaryColor: process.env.BRAND_PRIMARY_COLOR || '#FDB31C', // Amarillo Pikartas (acentos; no como texto principal sobre amarillo)
  secondaryColor: process.env.BRAND_SECONDARY_COLOR || '#010101', // Negro Pikartas
  tertiaryColor: process.env.BRAND_TERTIARY_COLOR || '#FFFFFF', // Blanco (botones, contrastes)
  quaternaryColor: process.env.BRAND_QUATERNARY_COLOR || '#FF0000', // Rojo Pikartas
  accentColor: process.env.BRAND_ACCENT_COLOR || '#FFD54F', // Amarillo claro Pikartas
  textColor: process.env.BRAND_TEXT_COLOR || '#010101', // Texto principal sobre fondos claros
  mutedTextColor: process.env.BRAND_MUTED_TEXT_COLOR || 'rgba(1, 1, 1, 0.62)',
  backgroundColor: process.env.BRAND_BACKGROUND_COLOR || '#FDB31C', // Fondo correo (amarillo marca)
  cardBackgroundColor: process.env.BRAND_CARD_BACKGROUND_COLOR || '#FFFFFF',
  footerText: process.env.BRAND_FOOTER_TEXT || '© 2024 Pikartas - Tu tienda de cartas Pokémon de confianza'
};

const buildBrandedEmail = ({ title, subtitle, bodyHtml }) => `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${brandConfig.name}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${brandConfig.backgroundColor}; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: ${brandConfig.backgroundColor}; padding: 40px 24px;">
      <!-- Logo Section - Matching Home Hero Style -->
      <div style="text-align: center; margin-bottom: 40px;">
        <img src="${brandConfig.logoUrl}" alt="${brandConfig.name}" style="height: 180px; width: auto; max-width: 100%; object-fit: contain; display: block; margin: 0 auto; filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.18));" />
      </div>
      
      <!-- Content Section -->
      <div style="background: ${brandConfig.cardBackgroundColor}; padding: 32px; border-radius: 16px; border: 1px solid rgba(1, 1, 1, 0.1);">
        ${subtitle ? `<p style="color: ${brandConfig.secondaryColor}; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 0; font-weight: 600;">${subtitle}</p>` : ''}
        <h1 style="color: ${brandConfig.textColor}; font-size: 28px; margin: 0 0 24px 0; line-height: 1.4; font-weight: 700;">${title}</h1>
        <div style="color: ${brandConfig.textColor};">
          ${bodyHtml}
        </div>
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; font-size: 12px; color: ${brandConfig.mutedTextColor}; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(1, 1, 1, 0.15);">
        <p style="margin: 8px 0;">¿Necesitas ayuda? Escríbenos a <a href="mailto:${brandConfig.supportEmail}" style="color: ${brandConfig.secondaryColor}; text-decoration: underline; font-weight: 600;">${brandConfig.supportEmail}</a></p>
        <p style="margin: 8px 0;">${brandConfig.footerText}</p>
      </div>
    </div>
  </body>
  </html>
`;

const sendVerificationEmail = async (email, token) => {
  // Enlace apunta al frontend que manejará la verificación
  // Usar FRONTEND_URL del .env (obligatorio en producción)
  if (!process.env.FRONTEND_URL) {
    throw new Error('FRONTEND_URL no está configurado en las variables de entorno');
  }
  const frontendUrl = process.env.FRONTEND_URL;
  const verificationLink = `${frontendUrl}/verify-email?token=${token}`;

  const bodyHtml = `
    <p style="font-size: 18px; margin-bottom: 20px; line-height: 1.6; color: ${brandConfig.textColor};">
      Gracias por registrarte en <strong style="color: ${brandConfig.secondaryColor};">${brandConfig.name}</strong>.
    </p>
    <p style="font-size: 18px; margin-bottom: 20px; line-height: 1.6; color: ${brandConfig.textColor};">
      Para activar tu cuenta y comenzar a comprar, confirma tu correo haciendo clic en el botón de abajo:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationLink}"
         style="display:inline-block;padding:16px 32px;background:${brandConfig.tertiaryColor};color:${brandConfig.secondaryColor};border:2px solid ${brandConfig.tertiaryColor};border-radius:50px;text-decoration:none;font-weight:600;font-size:16px;min-width:180px;">
        Confirmar mi Cuenta
      </a>
    </div>
    <p style="font-size: 14px; color: ${brandConfig.mutedTextColor}; line-height: 1.6;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
      <a href="${verificationLink}" style="color: ${brandConfig.secondaryColor}; word-break: break-all; text-decoration: none;">${verificationLink}</a>
    </p>
    <p style="font-size: 14px; color: ${brandConfig.mutedTextColor}; margin-top: 20px; line-height: 1.6;">
      Si no creaste esta cuenta, puedes ignorar este correo.
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Confirma tu cuenta en ${brandConfig.name}`,
    html: buildBrandedEmail({
      title: '¡Bienvenido! 🚀',
      subtitle: 'Confirma tu cuenta',
      bodyHtml
    })
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

// 📌 Enviar correo de recuperación de contraseña
const sendPasswordResetEmail = async (email, token) => {
  // Usar FRONTEND_URL del .env (obligatorio en producción)
  if (!process.env.FRONTEND_URL) {
    throw new Error('FRONTEND_URL no está configurado en las variables de entorno');
  }
  const frontendUrl = process.env.FRONTEND_URL;
  const resetLink = `${frontendUrl}/resetpassword?token=${token}`;

  const bodyHtml = `
    <p style="font-size: 18px; margin-bottom: 20px; line-height: 1.6; color: ${brandConfig.textColor};">
      Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong style="color: ${brandConfig.secondaryColor};">${brandConfig.name}</strong>.
    </p>
    <p style="font-size: 18px; margin-bottom: 20px; line-height: 1.6; color: ${brandConfig.textColor};">
      Para continuar con el proceso de recuperación, haz clic en el botón de abajo:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" 
         style="display:inline-block;padding:16px 32px;background:${brandConfig.tertiaryColor};color:${brandConfig.secondaryColor};border:2px solid ${brandConfig.tertiaryColor};border-radius:50px;text-decoration:none;font-weight:600;font-size:16px;min-width:180px;">
        Restablecer Contraseña
      </a>
    </div>
    <p style="font-size: 14px; color: ${brandConfig.mutedTextColor}; line-height: 1.6;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${resetLink}" style="color: ${brandConfig.secondaryColor}; word-break: break-all; text-decoration: none;">${resetLink}</a>
    </p>
    <p style="font-size: 14px; color: ${brandConfig.textColor}; margin-top: 20px; padding: 16px; background: rgba(253, 179, 28, 0.2); border: 1px solid ${brandConfig.primaryColor}; border-radius: 12px; line-height: 1.6;">
      ⚠️ <strong>Importante:</strong> Este enlace es válido por 1 hora solamente.
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER, 
    to: email,
    subject: `Recuperación de Contraseña - ${brandConfig.name}`,
    html: buildBrandedEmail({
      title: 'Recuperación de Contraseña',
      subtitle: 'Protegemos tu cuenta',
      bodyHtml
    })
  };

  try {
    const info = await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

// 📌 Enviar correo de contacto desde formulario
const sendContactEmail = async (name, email, subject, message) => {
  if (!process.env.EMAIL_USER) {
    throw new Error('EMAIL_USER no está configurado en las variables de entorno');
  }

  const bodyHtml = `
    <p style="font-size: 18px; margin-bottom: 20px; line-height: 1.6; color: ${brandConfig.textColor};">
      Has recibido un nuevo mensaje de contacto desde el sitio web.
    </p>
    <div style="background: rgba(1, 1, 1, 0.04); padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(1, 1, 1, 0.08);">
      <p style="margin: 10px 0; color: ${brandConfig.textColor};"><strong style="color: ${brandConfig.secondaryColor};">Nombre:</strong> ${name}</p>
      <p style="margin: 10px 0; color: ${brandConfig.textColor};"><strong style="color: ${brandConfig.secondaryColor};">Email:</strong> <a href="mailto:${email}" style="color: ${brandConfig.secondaryColor}; text-decoration: none;">${email}</a></p>
      <p style="margin: 10px 0; color: ${brandConfig.textColor};"><strong style="color: ${brandConfig.secondaryColor};">Asunto:</strong> ${subject}</p>
    </div>
    <div style="background: rgba(1, 1, 1, 0.04); padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(1, 1, 1, 0.08);">
      <p style="margin: 0 0 10px 0; color: ${brandConfig.secondaryColor}; font-weight: 600;"><strong>Mensaje:</strong></p>
      <p style="margin: 0; white-space: pre-wrap; line-height: 1.6; color: ${brandConfig.textColor};">${message}</p>
    </div>
    <p style="font-size: 14px; color: ${brandConfig.mutedTextColor}; line-height: 1.6;">
      Puedes responder directamente a este correo para contactar a ${name}.
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    replyTo: email,
    subject: `Contacto desde ${brandConfig.name}: ${subject}`,
    html: buildBrandedEmail({
      title: 'Nuevo mensaje de contacto',
      subtitle: 'Formulario del sitio',
      bodyHtml
    })
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

const sendContactAcknowledgementEmail = async (name, email, subject, message) => {
  const bodyHtml = `
    <p style="font-size: 18px; margin-bottom: 20px; line-height: 1.6; color: ${brandConfig.textColor};">
      Hola ${name.split(' ')[0] || name}, gracias por contactarte con <strong style="color: ${brandConfig.secondaryColor};">${brandConfig.name}</strong>.
    </p>
    <p style="font-size: 18px; margin-bottom: 20px; line-height: 1.6; color: ${brandConfig.textColor};">
      Hemos recibido tu mensaje y nuestro equipo te responderá lo antes posible.
    </p>
    <div style="background: rgba(1, 1, 1, 0.04); padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(1, 1, 1, 0.08);">
      <p style="margin: 10px 0; color: ${brandConfig.textColor};"><strong style="color: ${brandConfig.secondaryColor};">Asunto:</strong> ${subject}</p>
      <p style="margin: 0 0 10px 0; color: ${brandConfig.secondaryColor}; font-weight: 600;"><strong>Mensaje enviado:</strong></p>
      <p style="margin: 0; white-space: pre-wrap; line-height: 1.6; color: ${brandConfig.textColor};">${message}</p>
    </div>
    <p style="font-size: 14px; color: ${brandConfig.mutedTextColor}; line-height: 1.6;">
      Si necesitas actualizar tu solicitud, responde a este correo o escríbenos a <a href="mailto:${brandConfig.supportEmail}" style="color: ${brandConfig.secondaryColor}; text-decoration: none; font-weight: 600;">${brandConfig.supportEmail}</a>.
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Gracias por contactarnos - ${brandConfig.name}`,
    html: buildBrandedEmail({
      title: '¡Gracias por tu mensaje!',
      subtitle: 'Hemos recibido tu solicitud',
      bodyHtml
    })
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

// Send payment confirmation email
const sendPaymentConfirmationEmail = async (email, orderNumber, orderId, totalAmount, authorizationCode, paymentStatus) => {
  if (!process.env.EMAIL_USER) {
    throw new Error('EMAIL_USER no está configurado en las variables de entorno');
  }

  // Format amount as Chilean peso (CLP) with format $50.000
  const formatAmount = (amount) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount).replace('CLP', '').trim();
  };

  const formattedAmount = formatAmount(totalAmount);
  const paymentStatusLabel = paymentStatus === 'paid' ? 'Pagado' : paymentStatus;

  const bodyHtml = `
    <p style="font-size: 20px; font-weight: bold; color: ${brandConfig.secondaryColor}; margin-bottom: 24px; text-align: center;">
      Tu pago ha sido procesado correctamente ✅
    </p>
    <div style="background: rgba(1, 1, 1, 0.04); padding: 24px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(1, 1, 1, 0.08); border-left: 4px solid ${brandConfig.primaryColor};">
      <h3 style="color: ${brandConfig.secondaryColor}; margin-top: 0; margin-bottom: 20px; font-size: 20px;">Detalles del Pedido</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid rgba(1, 1, 1, 0.1);">
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor}; width: 40%;">Número de Orden:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor};">${orderNumber}</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(1, 1, 1, 0.1);">
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor};">ID de Orden:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor};">${orderId}</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(1, 1, 1, 0.1);">
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor};">Monto Total:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor}; font-size: 20px; font-weight: bold;">${formattedAmount}</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(1, 1, 1, 0.1);">
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor};">Código de Autorización:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor};">${authorizationCode || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor};">Estado del Pago:</td>
          <td style="padding: 12px 0; color: ${brandConfig.secondaryColor}; font-weight: bold;">${paymentStatusLabel}</td>
        </tr>
      </table>
    </div>
    <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 24px; line-height: 1.6;">
      Gracias por tu compra. Te notificaremos cuando tu pedido sea enviado.
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `¡Pago Exitoso! - Orden ${orderNumber}`,
    html: buildBrandedEmail({
      title: '¡Pago Exitoso!',
      subtitle: 'Confirmación de pago',
      bodyHtml
    })
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

// Send payment failed/cancelled email
const sendPaymentFailedEmail = async (email, orderNumber, orderId) => {
  if (!process.env.EMAIL_USER) {
    throw new Error('EMAIL_USER no está configurado en las variables de entorno');
  }

  if (!process.env.FRONTEND_URL) {
    throw new Error('FRONTEND_URL no está configurado en las variables de entorno');
  }

  const contactUrl = `${process.env.FRONTEND_URL}/contact`;

  const bodyHtml = `
    <p style="font-size: 20px; font-weight: bold; color: ${brandConfig.quaternaryColor}; margin-bottom: 24px; text-align: center;">
      Problema con tu pago ⚠️
    </p>
    <div style="background: rgba(1, 1, 1, 0.04); padding: 24px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(1, 1, 1, 0.08); border-left: 4px solid ${brandConfig.quaternaryColor};">
      <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 0; line-height: 1.6;">
        Hemos detectado un problema con el pago de tu orden <strong style="color: ${brandConfig.secondaryColor};">${orderNumber}</strong>.
      </p>
      <p style="font-size: 18px; color: ${brandConfig.textColor}; line-height: 1.6;">
        Si tuviste problemas con el pago, contacta directamente con nosotros en nuestra página web en el menú de contacto.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${contactUrl}" style="display: inline-block; background: ${brandConfig.tertiaryColor}; color: ${brandConfig.secondaryColor}; padding: 16px 32px; text-decoration: none; border: 2px solid ${brandConfig.tertiaryColor}; border-radius: 50px; font-weight: 600; font-size: 16px; min-width: 180px;">
          Ir a Contacto
        </a>
      </div>
      <div style="background: rgba(1, 1, 1, 0.03); padding: 16px; border-radius: 8px; margin-top: 20px; border: 1px solid rgba(1, 1, 1, 0.07);">
        <p style="margin: 0; font-size: 14px; color: rgba(1, 1, 1, 0.72); line-height: 1.6;">
          <strong style="color: ${brandConfig.secondaryColor};">Número de Orden:</strong> ${orderNumber}<br>
          <strong style="color: ${brandConfig.secondaryColor};">ID de Orden:</strong> ${orderId}
        </p>
      </div>
    </div>
    <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 24px; line-height: 1.6;">
      Estamos aquí para ayudarte. Si tienes alguna pregunta, no dudes en contactarnos.
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Problema con el pago - Orden ${orderNumber}`,
    html: buildBrandedEmail({
      title: 'Problema con el pago',
      subtitle: 'Necesitamos tu ayuda',
      bodyHtml
    })
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

// Send order processing email
const sendOrderProcessingEmail = async (email, orderNumber, orderId, customerName) => {
  if (!process.env.EMAIL_USER) {
    throw new Error('EMAIL_USER no está configurado en las variables de entorno');
  }

  const firstName = customerName ? customerName.split(' ')[0] : 'Cliente';

  const bodyHtml = `
    <p style="font-size: 20px; font-weight: bold; color: ${brandConfig.secondaryColor}; margin-bottom: 24px; text-align: center;">
      ¡Tu pedido está siendo procesado! ⚙️
    </p>
    <div style="background: rgba(1, 1, 1, 0.04); padding: 24px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(1, 1, 1, 0.08); border-left: 4px solid ${brandConfig.primaryColor};">
      <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 0; line-height: 1.6;">
        Hola ${firstName},
      </p>
      <p style="font-size: 18px; color: ${brandConfig.textColor}; line-height: 1.6;">
        Te informamos que tu pedido <strong style="color: ${brandConfig.secondaryColor};">${orderNumber}</strong> ya está siendo procesado y preparado para su envío.
      </p>
      <p style="font-size: 18px; color: ${brandConfig.textColor}; line-height: 1.6;">
        Nuestro equipo está trabajando para preparar tu pedido con el mayor cuidado. Te notificaremos cuando sea enviado.
      </p>
      <div style="background: rgba(1, 1, 1, 0.03); padding: 16px; border-radius: 8px; margin-top: 20px; border: 1px solid rgba(1, 1, 1, 0.07);">
        <p style="margin: 0; font-size: 14px; color: rgba(1, 1, 1, 0.72); line-height: 1.6;">
          <strong style="color: ${brandConfig.secondaryColor};">Número de Orden:</strong> ${orderNumber}<br>
          <strong style="color: ${brandConfig.secondaryColor};">ID de Orden:</strong> ${orderId}
        </p>
      </div>
    </div>
    <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 24px; line-height: 1.6;">
      Gracias por tu paciencia. ¡Tu pedido estará en camino pronto!
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Tu pedido está siendo procesado - Orden ${orderNumber}`,
    html: buildBrandedEmail({
      title: 'Pedido en Proceso',
      subtitle: 'Preparando tu compra',
      bodyHtml
    })
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

// Send order shipped email
const sendOrderShippedEmail = async (email, orderNumber, orderId, customerName) => {
  if (!process.env.EMAIL_USER) {
    throw new Error('EMAIL_USER no está configurado en las variables de entorno');
  }

  const firstName = customerName ? customerName.split(' ')[0] : 'Cliente';

  const bodyHtml = `
    <p style="font-size: 20px; font-weight: bold; color: ${brandConfig.secondaryColor}; margin-bottom: 24px; text-align: center;">
      ¡Tu pedido ha sido enviado! 🚚
    </p>
    <div style="background: rgba(1, 1, 1, 0.04); padding: 24px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(1, 1, 1, 0.08); border-left: 4px solid ${brandConfig.primaryColor};">
      <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 0; line-height: 1.6;">
        Hola ${firstName},
      </p>
      <p style="font-size: 18px; color: ${brandConfig.textColor}; line-height: 1.6;">
        ¡Excelentes noticias! Tu pedido <strong style="color: ${brandConfig.secondaryColor};">${orderNumber}</strong> ha sido enviado y está en camino.
      </p>
      <p style="font-size: 18px; color: ${brandConfig.textColor}; line-height: 1.6;">
        Pronto recibirás tu compra. Te recomendamos estar atento para recibir tu pedido.
      </p>
      <div style="background: rgba(1, 1, 1, 0.03); padding: 16px; border-radius: 8px; margin-top: 20px; border: 1px solid rgba(1, 1, 1, 0.07);">
        <p style="margin: 0; font-size: 14px; color: rgba(1, 1, 1, 0.72); line-height: 1.6;">
          <strong style="color: ${brandConfig.secondaryColor};">Número de Orden:</strong> ${orderNumber}<br>
          <strong style="color: ${brandConfig.secondaryColor};">ID de Orden:</strong> ${orderId}
        </p>
      </div>
    </div>
    <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 24px; line-height: 1.6;">
      Si tienes alguna pregunta sobre tu envío, no dudes en contactarnos.
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `¡Tu pedido ha sido enviado! - Orden ${orderNumber}`,
    html: buildBrandedEmail({
      title: 'Pedido Enviado',
      subtitle: 'En camino a tu hogar',
      bodyHtml
    })
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

// Send order delivered email
const sendOrderDeliveredEmail = async (email, orderNumber, orderId, customerName) => {
  if (!process.env.EMAIL_USER) {
    throw new Error('EMAIL_USER no está configurado en las variables de entorno');
  }

  if (!process.env.FRONTEND_URL) {
    throw new Error('FRONTEND_URL no está configurado en las variables de entorno');
  }

  const firstName = customerName ? customerName.split(' ')[0] : 'Cliente';
  const shopUrl = `${process.env.FRONTEND_URL}/shop`;

  const bodyHtml = `
    <p style="font-size: 20px; font-weight: bold; color: ${brandConfig.secondaryColor}; margin-bottom: 24px; text-align: center;">
      ¡Tu pedido ha sido entregado! 📦
    </p>
    <div style="background: rgba(1, 1, 1, 0.04); padding: 24px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(1, 1, 1, 0.08); border-left: 4px solid ${brandConfig.primaryColor};">
      <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 0; line-height: 1.6;">
        Hola ${firstName},
      </p>
      <p style="font-size: 18px; color: ${brandConfig.textColor}; line-height: 1.6;">
        ¡Esperamos que hayas recibido tu pedido <strong style="color: ${brandConfig.secondaryColor};">${orderNumber}</strong> en perfectas condiciones!
      </p>
      <p style="font-size: 18px; color: ${brandConfig.textColor}; line-height: 1.6;">
        ¿Cómo fue tu experiencia? Nos encantaría saber qué tal te pareció todo. Si tienes alguna pregunta o comentario, no dudes en contactarnos.
      </p>
      <div style="background: rgba(1, 1, 1, 0.03); padding: 16px; border-radius: 8px; margin-top: 20px; border: 1px solid rgba(1, 1, 1, 0.07);">
        <p style="margin: 0; font-size: 14px; color: rgba(1, 1, 1, 0.72); line-height: 1.6;">
          <strong style="color: ${brandConfig.secondaryColor};">Número de Orden:</strong> ${orderNumber}<br>
          <strong style="color: ${brandConfig.secondaryColor};">ID de Orden:</strong> ${orderId}
        </p>
      </div>
    </div>
    <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 24px; margin-bottom: 24px; line-height: 1.6;">
      ¡Esperamos verte nuevamente! Te invitamos a seguir comprando con nosotros y descubrir más productos increíbles.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${shopUrl}" style="display: inline-block; background: ${brandConfig.tertiaryColor}; color: ${brandConfig.secondaryColor}; padding: 16px 32px; text-decoration: none; border: 2px solid ${brandConfig.tertiaryColor}; border-radius: 50px; font-weight: 600; font-size: 16px; min-width: 180px;">
        Ver Productos
      </a>
    </div>
    <p style="font-size: 14px; color: ${brandConfig.mutedTextColor}; margin-top: 20px; text-align: center; line-height: 1.6;">
      Gracias por confiar en nosotros. ¡Esperamos verte pronto!
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `¡Tu pedido ha sido entregado! - Orden ${orderNumber}`,
    html: buildBrandedEmail({
      title: 'Pedido Entregado',
      subtitle: 'Gracias por tu compra',
      bodyHtml
    })
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

// Send payment notification to admin
const sendPaymentNotificationToAdmin = async (orderNumber, orderId, customerName, customerEmail, totalAmount, authorizationCode) => {
  if (!process.env.EMAIL_USER) {
    throw new Error('EMAIL_USER no está configurado en las variables de entorno');
  }

  // Format amount as Chilean peso (CLP) with format $50.000
  const formatAmount = (amount) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount).replace('CLP', '').trim();
  };

  const formattedAmount = formatAmount(totalAmount);

  const bodyHtml = `
    <p style="font-size: 20px; font-weight: bold; color: ${brandConfig.secondaryColor}; margin-bottom: 24px; text-align: center;">
      Nueva Orden Pagada 💰
    </p>
    <div style="background: rgba(1, 1, 1, 0.04); padding: 24px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(1, 1, 1, 0.08); border-left: 4px solid ${brandConfig.primaryColor};">
      <h3 style="color: ${brandConfig.secondaryColor}; margin-top: 0; margin-bottom: 20px; font-size: 20px;">Detalles de la Orden</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid rgba(1, 1, 1, 0.1);">
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor}; width: 40%;">Número de Orden:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor};">${orderNumber}</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(1, 1, 1, 0.1);">
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor};">ID de Orden:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor};">${orderId}</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(1, 1, 1, 0.1);">
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor};">Cliente:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor};">${customerName || 'N/A'}</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(1, 1, 1, 0.1);">
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor};">Email del Cliente:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor};"><a href="mailto:${customerEmail}" style="color: ${brandConfig.secondaryColor}; text-decoration: none;">${customerEmail}</a></td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(1, 1, 1, 0.1);">
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor};">Monto Total:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor}; font-size: 20px; font-weight: bold;">${formattedAmount}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; font-weight: 600; color: ${brandConfig.secondaryColor};">Código de Autorización:</td>
          <td style="padding: 12px 0; color: ${brandConfig.textColor};">${authorizationCode || 'N/A'}</td>
        </tr>
      </table>
    </div>
    <p style="font-size: 18px; color: ${brandConfig.textColor}; margin-top: 24px; line-height: 1.6;">
      El cliente ha completado el pago exitosamente. La orden está lista para ser procesada.
    </p>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: `Nueva Orden Pagada - ${orderNumber}`,
    html: buildBrandedEmail({
      title: 'Nueva Orden Pagada',
      subtitle: 'Notificación de pago recibido',
      bodyHtml
    })
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

export { sendVerificationEmail, sendPasswordResetEmail, sendContactEmail, sendContactAcknowledgementEmail, sendPaymentConfirmationEmail, sendPaymentFailedEmail, sendOrderProcessingEmail, sendOrderShippedEmail, sendOrderDeliveredEmail, sendPaymentNotificationToAdmin };
