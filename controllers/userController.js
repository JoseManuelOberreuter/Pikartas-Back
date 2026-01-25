import { userService } from '../models/userModel.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/mailer.js';
import { validatePassword } from '../utils/passwordValidator.js';
import logger from '../utils/logger.js';
import { hashPassword, comparePassword } from '../utils/passwordHelper.js';
import { generateVerificationToken, generateResetToken, generateAuthToken, verifyToken } from '../utils/tokenHelper.js';
import { successResponse, errorResponse, notFoundResponse, unauthorizedResponse, serverErrorResponse } from '../utils/responseHelper.js';
import { formatUser } from '../utils/formatters.js';
import { validateRequiredFields, validateEmail, validateUserId } from '../utils/validators.js';
import { requireAdmin } from '../utils/authHelper.js';

// Register User
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ name, email, password }, ['name', 'email', 'password']);
    if (!requiredValidation.isValid) {
      return errorResponse(res, 'Todos los campos son requeridos', 400);
    }

    // Validate email format
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return errorResponse(res, emailValidation.error, 400);
    }

    // Validate password security
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return errorResponse(res, passwordValidation.message, 400);
    }

    // Check if user already exists
    const userExists = await userService.findByEmail(email);
    if (userExists) {
      return errorResponse(res, 'El usuario ya existe', 400);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate verification token
    const verificationToken = generateVerificationToken(email);

    // Create user
    const newUser = await userService.create({
      name,
      email,
      password: hashedPassword,
      isVerified: false,
      verificationToken
    });

    // Send verification email (optional - don't fail registration if email fails)
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      logger.warn('No se pudo enviar el email de verificación:', { 
        email, 
        error: emailError.message,
        note: 'El usuario fue registrado exitosamente pero el email no pudo ser enviado. Verifica las variables EMAIL_USER y EMAIL_PASS en las variables de entorno.'
      });
      // Continue with registration even if email fails
    }

    // Return success response
    const formattedUser = formatUser(newUser);
    return successResponse(res, formattedUser, 'Usuario registrado exitosamente', 201);

  } catch (error) {
    logger.error('Error en registerUser:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Resend verification email
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return errorResponse(res, emailValidation.error, 400);
    }

    // Find user by email
    const user = await userService.findByEmail(email);
    if (!user) {
      return notFoundResponse(res, 'Usuario');
    }

    // Check if account is already verified
    if (user.is_verified) {
      return errorResponse(res, 'La cuenta ya está verificada', 400);
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken(email);

    // Update token in database
    await userService.update(user.id, { verification_token: verificationToken });

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    return successResponse(res, null, 'Correo de verificación reenviado exitosamente. Revisa tu bandeja de entrada.');

  } catch (error) {
    logger.error('Error al reenviar correo de verificación:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al reenviar el correo de verificación');
  }
};

// Login User
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ email, password }, ['email', 'password']);
    if (!requiredValidation.isValid) {
      return errorResponse(res, 'Email y contraseña son requeridos', 400);
    }

    // Find user
    const user = await userService.findByEmail(email);
    if (!user) {
      return unauthorizedResponse(res, 'Credenciales inválidas');
    }

    // Verify password
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return unauthorizedResponse(res, 'Credenciales inválidas');
    }

    // Check if account is verified
    if (!user.is_verified) {
      // Generate new verification token
      const verificationToken = generateVerificationToken(email);
      
      // Update token in database
      await userService.update(user.id, { verification_token: verificationToken });
      
      // Send verification email automatically
      await sendVerificationEmail(email, verificationToken);
      
      return unauthorizedResponse(res, 'Por favor verifica tu cuenta primero. Se ha reenviado un nuevo correo de verificación.');
    }

    // Update last login
    await userService.updateLastLogin(user.id);

    // Generate JWT token
    const token = generateAuthToken(user);

    return res.status(200).json({
      success: true,
      message: 'Login exitoso',
      token: token  // Token en el nivel raíz, compatible con frontend
    });

  } catch (error) {
    logger.error('Error en loginUser:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Update User
const updateUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const userId = req.params.id;

    // Validate user ID
    const idValidation = validateUserId(userId);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    // Check if user exists
    const user = await userService.findById(idValidation.id);
    if (!user) {
      return notFoundResponse(res, 'Usuario');
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    if (email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        return errorResponse(res, emailValidation.error, 400);
      }
      updateData.email = email;
    }

    // If there's a new password, hash it
    if (password) {
      updateData.password = await hashPassword(password);
    }

    // Update user
    await userService.update(idValidation.id, updateData);

    return successResponse(res, null, 'Usuario actualizado correctamente');

  } catch (error) {
    logger.error('Error al actualizar usuario:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al actualizar usuario');
  }
};

// Update Profile (Authenticated User)
const updateProfile = async (req, res) => {
  try {
    const { name, email, password, telefono, fechaNacimiento, direccion } = req.body;
    const userId = req.user.id; // From authentication middleware

    // Find user by ID
    const user = await userService.findById(userId);
    if (!user) {
      return notFoundResponse(res, 'Usuario');
    }

    // Validate that new email is not in use by another user
    if (email && email !== user.email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        return errorResponse(res, emailValidation.error, 400);
      }

      const emailExists = await userService.findByEmail(email);
      if (emailExists) {
        return errorResponse(res, 'El email ya está en uso por otro usuario', 400);
      }
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (telefono !== undefined) updateData.telefono = telefono;
    if (fechaNacimiento !== undefined) updateData.fecha_nacimiento = fechaNacimiento;
    if (direccion !== undefined) updateData.direccion = direccion;

    // If there's a new password, validate and hash it
    if (password) {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return errorResponse(res, passwordValidation.message, 400);
      }

      updateData.password = await hashPassword(password);
    }

    // Update user
    const updatedUser = await userService.update(userId, updateData);

    // Return success response with updated data (without password)
    const formattedUser = formatUser(updatedUser);
    return successResponse(res, formattedUser, 'Perfil actualizado exitosamente');

  } catch (error) {
    logger.error('Error al actualizar perfil:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al actualizar el perfil');
  }
};

// Verify User Account with Token
const verifyUser = async (req, res) => {
  try {
    const { token } = req.params;

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(400).json({
          success: false,
          type: 'TOKEN_EXPIRED',
          error: 'El enlace de verificación ha expirado. Por favor, solicita uno nuevo.',
          message: 'El enlace de verificación ha expirado. Por favor, solicita uno nuevo.'
        });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(400).json({
          success: false,
          type: 'INVALID_TOKEN',
          error: 'El token de verificación no es válido.',
          message: 'El token de verificación no es válido.'
        });
      }
      throw error;
    }
    
    // Find user with token email
    const user = await userService.findByEmail(decoded.email);

    if (!user) {
      return res.status(404).json({
        success: false,
        type: 'USER_NOT_FOUND',
        error: 'Usuario no encontrado',
        message: 'Usuario no encontrado'
      });
    }

    if (user.is_verified) {
      const formattedUser = formatUser(user);
      // Return format expected by frontend
      return res.status(200).json({
        success: true,
        type: 'ALREADY_VERIFIED',
        message: 'La cuenta ya está verificada',
        user: formattedUser,
        data: formattedUser
      });
    }

    // Mark account as verified
    await userService.update(user.id, { 
      is_verified: true, 
      verification_token: null 
    });

    logger.info('Cuenta verificada exitosamente', { userId: user.id });

    // Get updated user data
    const updatedUser = await userService.findById(user.id);
    const formattedUser = formatUser(updatedUser);
    
    // Return format expected by frontend
    return res.status(200).json({
      success: true,
      type: 'VERIFIED',
      message: 'Cuenta verificada exitosamente',
      user: formattedUser,
      data: formattedUser
    });

  } catch (error) {
    logger.error('Error al verificar cuenta:', { message: error.message });
    return serverErrorResponse(res, error, 'Ocurrió un error al verificar la cuenta.');
  }
};

// Request Password Reset
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return errorResponse(res, emailValidation.error, 400);
    }

    const user = await userService.findByEmail(email);
    if (!user) {
      return errorResponse(res, 'No existe una cuenta con este correo.', 400);
    }

    // Generate reset token
    const resetToken = generateResetToken(user.email);

    // Send email with reset link
    await sendPasswordResetEmail(user.email, resetToken);

    return successResponse(res, null, 'Correo de recuperación enviado. Revisa tu bandeja de entrada.');

  } catch (error) {
    logger.error('Error en solicitud de recuperación:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al solicitar la recuperación de contraseña.');
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Verify JWT
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      return errorResponse(res, 'Token inválido o expirado.', 400);
    }

    // Find user by email
    const user = await userService.findByEmail(decoded.email);
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado.', 400);
    }

    // Validate new password security
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return errorResponse(res, passwordValidation.message, 400);
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update password
    await userService.update(user.id, { password: hashedPassword });

    return successResponse(res, null, 'Contraseña restablecida con éxito. Ya puedes iniciar sesión.');

  } catch (error) {
    logger.error('Error al restablecer contraseña:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al restablecer la contraseña.');
  }
};

// Delete User
const deleteUser = async (req, res) => {
  try {
    logger.info('Eliminando usuario', { userId: req.params.id });
    
    const { email, password, confirmacion } = req.body;

    // Validate confirmation
    if (!confirmacion || confirmacion.toLowerCase() !== 'eliminar') {
      return errorResponse(res, "Debe confirmar la eliminación escribiendo 'eliminar'", 400);
    }

    // Validate required fields
    const requiredValidation = validateRequiredFields({ email, password }, ['email', 'password']);
    if (!requiredValidation.isValid) {
      return errorResponse(res, 'Email y contraseña son requeridos', 400);
    }

    // Find user by email
    const user = await userService.findByEmail(email);
    if (!user) {
      return notFoundResponse(res, 'Usuario');
    }

    // Verify password is correct
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return unauthorizedResponse(res, 'Contraseña incorrecta');
    }

    // Delete user
    await userService.delete(user.id);

    logger.info('Usuario eliminado correctamente', { userId: user.id });
    return successResponse(res, null, 'Usuario eliminado con éxito');

  } catch (error) {
    logger.error('Error al eliminar usuario:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Get User Data by ID or Email
const getUserData = async (req, res) => {
  try {
    const { identifier } = req.params; // Can be ID or email

    // Try to find by ID first (check if it's a number)
    let user = null;
    if (!isNaN(identifier)) {
      const idValidation = validateUserId(identifier);
      if (idValidation.isValid) {
        user = await userService.findById(idValidation.id);
      }
    }

    // If not found by ID, search by email
    if (!user) {
      const emailValidation = validateEmail(identifier);
      if (emailValidation.isValid) {
        user = await userService.findByEmail(identifier);
      }
    }

    if (!user) {
      return notFoundResponse(res, 'Usuario');
    }

    const formattedUser = formatUser(user);
    return successResponse(res, formattedUser);

  } catch (error) {
    logger.error('Error al obtener los datos del usuario:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al obtener los datos del usuario');
  }
};

// Get All Users (Admin Only)
const getAllUsers = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    // Get all users from database (including deleted)
    const users = await userService.findAllIncludingDeleted();

    // Format response
    const usersData = users.map(user => formatUser(user));

    return successResponse(res, {
      users: usersData,
      total: usersData.length
    }, 'Lista de usuarios obtenida exitosamente');

  } catch (error) {
    logger.error('Error al obtener todos los usuarios:', { message: error.message });
    return serverErrorResponse(res, error, 'Error interno del servidor al obtener los usuarios');
  }
};

// Get User by ID (Admin Only)
const getUserById = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;

    // Validate user ID
    const idValidation = validateUserId(id);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    // Find user by ID (including deleted users for admin)
    const user = await userService.findByIdAny(idValidation.id);
    if (!user) {
      return notFoundResponse(res, 'Usuario');
    }

    const formattedUser = formatUser(user);
    return successResponse(res, formattedUser, 'Usuario obtenido exitosamente');

  } catch (error) {
    logger.error('Error al obtener el usuario:', { message: error.message });
    return serverErrorResponse(res, error, 'Error interno del servidor al obtener el usuario');
  }
};

// Update User by Admin
const updateUserByAdmin = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    const { name, email, password, role, is_verified, telefono, fecha_nacimiento, direccion } = req.body;

    // Validate user ID
    const idValidation = validateUserId(id);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    // Check if user exists
    const user = await userService.findById(idValidation.id);
    if (!user) {
      return notFoundResponse(res, 'Usuario');
    }

    // Prepare update data
    const updateData = {};
    if (name !== undefined && name !== null) updateData.name = name;
    if (email !== undefined && email !== null) {
      // Validate that new email is not in use by another user
      if (email !== user.email) {
        const emailValidation = validateEmail(email);
        if (!emailValidation.isValid) {
          return errorResponse(res, emailValidation.error, 400);
        }

        const emailExists = await userService.findByEmail(email);
        if (emailExists) {
          return errorResponse(res, 'El email ya está en uso por otro usuario', 400);
        }
        updateData.email = email;
      }
    }
    if (role !== undefined && role !== null) {
      // Validate that role is valid
      if (!['user', 'admin'].includes(role)) {
        return errorResponse(res, "El rol debe ser 'user' o 'admin'", 400);
      }
      updateData.role = role;
    }
    if (is_verified !== undefined && is_verified !== null) {
      // Ensure is_verified is a boolean
      updateData.is_verified = Boolean(is_verified);
    }
    if (telefono !== undefined) {
      // Allow null for telefono
      updateData.telefono = telefono === null || telefono === '' ? null : telefono;
    }
    if (fecha_nacimiento !== undefined) {
      // Allow null for fecha_nacimiento
      updateData.fecha_nacimiento = fecha_nacimiento === null || fecha_nacimiento === '' ? null : fecha_nacimiento;
    }
    if (direccion !== undefined) {
      // Allow null for direccion
      updateData.direccion = direccion === null || direccion === '' ? null : direccion;
    }

    // If there's a new password, validate and hash it
    if (password) {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return errorResponse(res, passwordValidation.message, 400);
      }

      updateData.password = await hashPassword(password);
    }

    // Check if there's data to update
    if (Object.keys(updateData).length === 0) {
      return errorResponse(res, 'No hay datos para actualizar', 400);
    }

    // Update user (admin operation - uses service role key)
    const updatedUser = await userService.update(idValidation.id, updateData, true);

    // Return success response with updated data (without password)
    const formattedUser = formatUser(updatedUser);
    return successResponse(res, formattedUser, 'Usuario actualizado exitosamente');

  } catch (error) {
    logger.error('Error al actualizar usuario:', { 
      message: error.message,
      stack: error.stack,
      error: error
    });
    return serverErrorResponse(res, error, 'Error interno del servidor al actualizar el usuario');
  }
};

// Delete User by Admin
const deleteUserByAdmin = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;

    // Validate user ID
    const idValidation = validateUserId(id);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    // Check if user exists (including deleted)
    const user = await userService.findByIdAny(idValidation.id);
    if (!user) {
      return notFoundResponse(res, 'Usuario');
    }

    // Check if user is already deleted
    if (user.deleted_at) {
      return errorResponse(res, 'El usuario ya está eliminado', 400);
    }

    // Prevent admin from deleting themselves
    if (req.user && req.user.id === idValidation.id) {
      return errorResponse(res, 'No puedes eliminar tu propia cuenta', 400);
    }

    // Delete user (soft delete)
    await userService.delete(idValidation.id);

    logger.info('Usuario eliminado por administrador (soft delete)', { userId: idValidation.id });
    return successResponse(res, null, 'Usuario eliminado exitosamente');

  } catch (error) {
    logger.error('Error al eliminar usuario:', { message: error.message });
    return serverErrorResponse(res, error, 'Error interno del servidor al eliminar el usuario');
  }
};

// Restore User by Admin
const restoreUserByAdmin = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;

    // Validate user ID
    const idValidation = validateUserId(id);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    // Check if user exists (including deleted)
    const user = await userService.findByIdAny(idValidation.id);
    if (!user) {
      return notFoundResponse(res, 'Usuario');
    }

    // Check if user is deleted
    if (!user.deleted_at) {
      return errorResponse(res, 'El usuario no está eliminado', 400);
    }

    // Restore user (restore soft delete)
    const restoredUser = await userService.restore(idValidation.id);

    logger.info('Usuario restaurado por administrador', { userId: idValidation.id });
    const formattedUser = formatUser(restoredUser);
    return successResponse(res, formattedUser, 'Usuario restaurado exitosamente');

  } catch (error) {
    logger.error('Error al restaurar usuario:', { message: error.message });
    return serverErrorResponse(res, error, 'Error interno del servidor al restaurar el usuario');
  }
};

export { 
  registerUser, 
  loginUser, 
  updateUser, 
  updateProfile, 
  verifyUser, 
  resendVerificationEmail,
  requestPasswordReset, 
  resetPassword, 
  deleteUser, 
  getUserData, 
  getAllUsers,
  getUserById,
  updateUserByAdmin,
  deleteUserByAdmin,
  restoreUserByAdmin
};
