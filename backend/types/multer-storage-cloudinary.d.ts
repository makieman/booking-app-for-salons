declare module 'multer-storage-cloudinary' {
  import { StorageEngine } from 'multer';
  import { v2 as cloudinary } from 'cloudinary';

  export interface CloudinaryStorageOptions {
    cloudinary: typeof cloudinary;
    params?:
      | Record<string, any>
      | ((req: any, file: any) => Promise<Record<string, any>> | Record<string, any>);
  }

  export class CloudinaryStorage implements StorageEngine {
    constructor(options: CloudinaryStorageOptions);
    _handleFile(req: any, file: any, cb: (error?: any, info?: any) => void): void;
    _removeFile(req: any, file: any, cb: (error?: any) => void): void;
  }

  export default CloudinaryStorage;
}
