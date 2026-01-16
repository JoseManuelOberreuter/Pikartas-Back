// utils/imageHelper.js
// Helper functions for image operations with Supabase Storage

import { supabaseAdmin } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import logger from './logger.js';

const BUCKET_NAME = 'pikartas-bucket';

/**
 * Upload an image to Supabase Storage
 * @param {object} file - Multer file object
 * @returns {Promise<string>} - Public URL of the uploaded image
 * @throws {Error} - If upload fails
 */
export const uploadImage = async (file) => {
  const fileName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
  const filePath = fileName;

  try {
    // Validate that supabaseAdmin is available
    if (!supabaseAdmin) {
      logger.error('supabaseAdmin is not available - SUPABASE_SERVICE_ROLE_KEY may not be configured');
      throw new Error('Service role key not configured. Image upload is disabled.');
    }
    
    // Upload file to Supabase Storage (admin operation - uses service role key)
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600'
      });

    if (error) {
      throw new Error(`Error subiendo imagen: ${error.message}`);
    }

    // Get public URL
    const { data: publicData } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);
    
    return publicData.publicUrl;
    
  } catch (error) {
    logger.error('Error en uploadImage:', { message: error.message });
    throw error;
  }
};

/**
 * Delete an image from Supabase Storage
 * @param {string} imageUrl - Public URL of the image to delete
 * @returns {Promise<void>}
 */
export const deleteImage = async (imageUrl) => {
  try {
    // Validate that supabaseAdmin is available
    if (!supabaseAdmin) {
      logger.error('supabaseAdmin is not available - SUPABASE_SERVICE_ROLE_KEY may not be configured');
      throw new Error('Service role key not configured. Image deletion is disabled.');
    }
    
    // Extract file path from URL
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/');
    const fileName = pathParts[pathParts.length - 1];
    
    // Delete file from Supabase Storage (admin operation - uses service role key)
    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove([fileName]);

    if (error) {
      logger.error('Error eliminando imagen:', { message: error.message });
      throw error;
    }
    
  } catch (error) {
    logger.error('Error eliminando imagen:', { message: error.message });
    throw error;
  }
};

