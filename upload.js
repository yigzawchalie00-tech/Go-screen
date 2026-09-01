const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// CV upload — PDFs and images allowed, stored in a separate folder
const cvStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'gov-screening/cvs',
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
    resource_type: 'auto',
  },
});

const uploadCV = multer({
  storage: cvStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for CVs
});

// Organization photo upload — images only, stored in a separate folder
const orgPhotoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'gov-screening/org-photos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    resource_type: 'image',
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
  },
});

const uploadOrgPhoto = multer({
  storage: orgPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max for org photos
});

module.exports = { uploadCV, uploadOrgPhoto, cloudinary };
