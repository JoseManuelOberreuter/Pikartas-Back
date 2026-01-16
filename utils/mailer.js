import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Centralized branding configuration for all outgoing emails
const brandConfig = {
  name: process.env.BRAND_NAME || 'Pikartas',
  logoUrl: process.env.BRAND_LOGO_URL || 'https://via.placeholder.com/140x40?text=Pikartas',
  supportEmail: process.env.BRAND_SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@example.com',
  primaryColor: process.env.BRAND_PRIMARY_COLOR || '#FDB31C', // Amarillo Pikartas
  secondaryColor: process.env.BRAND_SECONDARY_COLOR || '#FF0000', // Rojo Pikartas
  accentColor: process.env.BRAND_ACCENT_COLOR || '#FFD54F', // Amarillo claro Pikartas
  textColor: process.env.BRAND_TEXT_COLOR || '#010101', // Negro Pikartas
  footerText: process.env.BRAND_FOOTER_TEXT || '© 2024 Pikartas - Tu tienda de cartas Pokémon de confianza'
};

const buildBrandedEmail = ({ title, subtitle, bodyHtml }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: ${brandConfig.textColor};">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="${brandConfig.logoUrl}" alt="${brandConfig.name}" style="max-height: 48px; margin-bottom: 12px;" />
      <h1 style="color: ${brandConfig.primaryColor}; margin: 0;">${brandConfig.name}</h1>
      ${subtitle ? `<p style="color: ${brandConfig.secondaryColor}; margin: 8px 0 0;">${subtitle}</p>` : ''}
    </div>
    <div style="background: ${brandConfig.accentColor}1A; padding: 24px; border-radius: 12px;">
      <h2 style="color: ${brandConfig.primaryColor}; margin-top: 0;">${title}</h2>
      ${bodyHtml}
    </div>
    <div style="text-align: center; font-size: 12px; color: #888; margin-top: 24px;">
      <p style="margin: 4px 0;">¿Necesitas ayuda? Escríbenos a <a href="mailto:${brandConfig.supportEmail}" style="color: ${brandConfig.primaryColor};">${brandConfig.supportEmail}</a></p>
      <p style="margin: 4px 0;">${brandConfig.footerText}</p>
    </div>
  </div>
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
    <p style="font-size: 16px; margin-bottom: 20px;">
      Gracias por registrarte en <strong>${brandConfig.name}</strong>.
    </p>
    <p style="font-size: 16px; margin-bottom: 20px;">
      Para activar tu cuenta y comenzar a comprar, confirma tu correo haciendo clic en el botón de abajo:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationLink}"
         style="display:inline-block;padding:15px 30px;background:${brandConfig.primaryColor};color:white;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
        Confirmar mi Cuenta
      </a>
    </div>
    <p style="font-size: 14px; color: #555;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
      <a href="${verificationLink}" style="color: ${brandConfig.primaryColor}; word-break: break-all;">${verificationLink}</a>
    </p>
    <p style="font-size: 14px; color: #888; margin-top: 20px;">
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
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>${brandConfig.name}</strong>.
    </p>
    <p style="font-size: 16px; margin-bottom: 20px;">
      Para continuar con el proceso de recuperación, haz clic en el botón de abajo:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" 
         style="display:inline-block;padding:15px 30px;background:${brandConfig.secondaryColor};color:white;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
        Restablecer Contraseña
      </a>
    </div>
    <p style="font-size: 14px; color: #555;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${resetLink}" style="color: ${brandConfig.secondaryColor}; word-break: break-all;">${resetLink}</a>
    </p>
    <p style="font-size: 14px; color: #e74c3c; margin-top: 20px; padding: 10px; background: #ffeaa7; border-radius: 5px;">
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
    <p style="font-size: 16px; margin-bottom: 15px;">
      Has recibido un nuevo mensaje de contacto desde el sitio web.
    </p>
    <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 10px 0;"><strong>Nombre:</strong> ${name}</p>
      <p style="margin: 10px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
      <p style="margin: 10px 0;"><strong>Asunto:</strong> ${subject}</p>
    </div>
    <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Mensaje:</strong></p>
      <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${message}</p>
    </div>
    <p style="font-size: 14px; color: #666;">
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
    <p style="font-size: 16px; margin-bottom: 15px;">
      Hola ${name.split(' ')[0] || name}, gracias por contactarte con <strong>${brandConfig.name}</strong>.
    </p>
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hemos recibido tu mensaje y nuestro equipo te responderá lo antes posible.
    </p>
    <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 10px 0;"><strong>Asunto:</strong> ${subject}</p>
      <p style="margin: 0 0 10px 0;"><strong>Mensaje enviado:</strong></p>
      <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${message}</p>
    </div>
    <p style="font-size: 14px; color: #555;">
      Si necesitas actualizar tu solicitud, responde a este correo o escríbenos a <a href="mailto:${brandConfig.supportEmail}" style="color: ${brandConfig.primaryColor};">${brandConfig.supportEmail}</a>.
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
    <p style="font-size: 18px; font-weight: bold; color: ${brandConfig.secondaryColor}; margin-bottom: 20px; text-align: center;">
      Tu pago ha sido procesado correctamente
    </p>
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${brandConfig.secondaryColor};">
      <h3 style="color: ${brandConfig.primaryColor}; margin-top: 0; margin-bottom: 20px;">Detalles del Pedido</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor}; width: 40%;">Número de Orden:</td>
          <td style="padding: 10px 0; color: #333;">${orderNumber}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor};">ID de Orden:</td>
          <td style="padding: 10px 0; color: #333;">${orderId}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor};">Monto Total:</td>
          <td style="padding: 10px 0; color: #333; font-size: 18px; font-weight: bold;">${formattedAmount}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor};">Código de Autorización:</td>
          <td style="padding: 10px 0; color: #333;">${authorizationCode || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor};">Estado del Pago:</td>
          <td style="padding: 10px 0; color: ${brandConfig.secondaryColor}; font-weight: bold;">${paymentStatusLabel}</td>
        </tr>
      </table>
    </div>
    <p style="font-size: 16px; color: #555; margin-top: 20px;">
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
    <p style="font-size: 18px; font-weight: bold; color: ${brandConfig.primaryColor}; margin-bottom: 20px; text-align: center;">
      Problema con tu pago
    </p>
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
      <p style="font-size: 16px; color: #333; margin-top: 0;">
        Hemos detectado un problema con el pago de tu orden <strong>${orderNumber}</strong>.
      </p>
      <p style="font-size: 16px; color: #333;">
        Si tuviste problemas con el pago, contacta directamente con nosotros en nuestra página web en el menú de contacto.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${contactUrl}" style="display: inline-block; background: ${brandConfig.primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
          Ir a Contacto
        </a>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 20px;">
        <p style="margin: 0; font-size: 14px; color: #666;">
          <strong>Número de Orden:</strong> ${orderNumber}<br>
          <strong>ID de Orden:</strong> ${orderId}
        </p>
      </div>
    </div>
    <p style="font-size: 16px; color: #555; margin-top: 20px;">
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
    <p style="font-size: 18px; font-weight: bold; color: ${brandConfig.secondaryColor}; margin-bottom: 20px; text-align: center;">
      ¡Tu pedido está siendo procesado!
    </p>
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${brandConfig.secondaryColor};">
      <p style="font-size: 16px; color: #333; margin-top: 0;">
        Hola ${firstName},
      </p>
      <p style="font-size: 16px; color: #333;">
        Te informamos que tu pedido <strong>${orderNumber}</strong> ya está siendo procesado y preparado para su envío.
      </p>
      <p style="font-size: 16px; color: #333;">
        Nuestro equipo está trabajando para preparar tu pedido con el mayor cuidado. Te notificaremos cuando sea enviado.
      </p>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 20px;">
        <p style="margin: 0; font-size: 14px; color: #666;">
          <strong>Número de Orden:</strong> ${orderNumber}<br>
          <strong>ID de Orden:</strong> ${orderId}
        </p>
      </div>
    </div>
    <p style="font-size: 16px; color: #555; margin-top: 20px;">
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
    <p style="font-size: 18px; font-weight: bold; color: ${brandConfig.secondaryColor}; margin-bottom: 20px; text-align: center;">
      ¡Tu pedido ha sido enviado! 🚚
    </p>
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${brandConfig.secondaryColor};">
      <p style="font-size: 16px; color: #333; margin-top: 0;">
        Hola ${firstName},
      </p>
      <p style="font-size: 16px; color: #333;">
        ¡Excelentes noticias! Tu pedido <strong>${orderNumber}</strong> ha sido enviado y está en camino.
      </p>
      <p style="font-size: 16px; color: #333;">
        Pronto recibirás tu compra. Te recomendamos estar atento para recibir tu pedido.
      </p>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 20px;">
        <p style="margin: 0; font-size: 14px; color: #666;">
          <strong>Número de Orden:</strong> ${orderNumber}<br>
          <strong>ID de Orden:</strong> ${orderId}
        </p>
      </div>
    </div>
    <p style="font-size: 16px; color: #555; margin-top: 20px;">
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
    <p style="font-size: 18px; font-weight: bold; color: ${brandConfig.secondaryColor}; margin-bottom: 20px; text-align: center;">
      ¡Tu pedido ha sido entregado! 📦
    </p>
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${brandConfig.secondaryColor};">
      <p style="font-size: 16px; color: #333; margin-top: 0;">
        Hola ${firstName},
      </p>
      <p style="font-size: 16px; color: #333;">
        ¡Esperamos que hayas recibido tu pedido <strong>${orderNumber}</strong> en perfectas condiciones!
      </p>
      <p style="font-size: 16px; color: #333;">
        ¿Cómo fue tu experiencia? Nos encantaría saber qué tal te pareció todo. Si tienes alguna pregunta o comentario, no dudes en contactarnos.
      </p>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 20px;">
        <p style="margin: 0; font-size: 14px; color: #666;">
          <strong>Número de Orden:</strong> ${orderNumber}<br>
          <strong>ID de Orden:</strong> ${orderId}
        </p>
      </div>
    </div>
    <p style="font-size: 16px; color: #555; margin-top: 20px; margin-bottom: 20px;">
      ¡Esperamos verte nuevamente! Te invitamos a seguir comprando con nosotros y descubrir más productos increíbles.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${shopUrl}" style="display: inline-block; background: ${brandConfig.primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
        Ver Productos
      </a>
    </div>
    <p style="font-size: 14px; color: #888; margin-top: 20px; text-align: center;">
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
    <p style="font-size: 18px; font-weight: bold; color: ${brandConfig.primaryColor}; margin-bottom: 20px; text-align: center;">
      Nueva Orden Pagada
    </p>
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${brandConfig.secondaryColor};">
      <h3 style="color: ${brandConfig.primaryColor}; margin-top: 0; margin-bottom: 20px;">Detalles de la Orden</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor}; width: 40%;">Número de Orden:</td>
          <td style="padding: 10px 0; color: #333;">${orderNumber}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor};">ID de Orden:</td>
          <td style="padding: 10px 0; color: #333;">${orderId}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor};">Cliente:</td>
          <td style="padding: 10px 0; color: #333;">${customerName || 'N/A'}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor};">Email del Cliente:</td>
          <td style="padding: 10px 0; color: #333;"><a href="mailto:${customerEmail}">${customerEmail}</a></td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor};">Monto Total:</td>
          <td style="padding: 10px 0; color: #333; font-size: 18px; font-weight: bold;">${formattedAmount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-weight: bold; color: ${brandConfig.textColor};">Código de Autorización:</td>
          <td style="padding: 10px 0; color: #333;">${authorizationCode || 'N/A'}</td>
        </tr>
      </table>
    </div>
    <p style="font-size: 16px; color: #555; margin-top: 20px;">
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
