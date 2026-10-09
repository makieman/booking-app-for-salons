import { v2 as cloudinary } from 'cloudinary';
import multerStorageCloudinary from 'multer-storage-cloudinary';
import multer from 'multer';

const CloudinaryStorage = (multerStorageCloudinary as any).CloudinaryStorage || multerStorageCloudinary;

// Cloudinary supports either a single CLOUDINARY_URL or separate credentials.
if (process.env.CLOUDINARY_URL) {
  // Automatically configured by Cloudinary SDK from CLOUDINARY_URL
} else if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.warn('⚠️  Neither CLOUDINARY_URL nor CLOUDINARY_API_KEY/SECRET is set in environment variables. Image uploads will fail.');
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
