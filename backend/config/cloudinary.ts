import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Cloudinary automatically picks up process.env.CLOUDINARY_URL or process.env.CLOUDINARY_API_KEY configurations.
// But we will explicitly check to avoid silent failures.
const cloudinaryUrl = process.env.CLOUDINARY_URL;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
if (!cloudinaryUrl && !cloudinaryApiKey) {
  console.warn('⚠️  Neither CLOUDINARY_URL nor CLOUDINARY_API_KEY is set in environment variables. Image uploads will fail.');
}

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req: any, _file: any) => {
    return {
      folder: 'salon_branding',
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'ico'],
      // We keep the original filename prefix or field name + timestamp to avoid collisions
      public_id: `${req.tenant?.slug || 'tenant'}_${_file.fieldname}_${Date.now()}`,
    };
  },
});

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});
