const ImportService = require('../services/catalog/import.service');
const S3Service = require('../services/storage/s3.service');
const fs = require('fs');

class UploadController {
    static async uploadImage(req, res, next) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No image file uploaded.' });
            }

            // If AWS S3 is configured, upload directly to S3
            if (S3Service.isConfigured()) {
                try {
                    const { url, key } = await S3Service.uploadFile(req.file, 'dishes');

                    // Clean up local temp file
                    if (req.file.path && fs.existsSync(req.file.path)) {
                        fs.unlink(req.file.path, () => {});
                    }

                    return res.status(200).json({
                        success: true,
                        message: 'Image uploaded to AWS S3 successfully',
                        data: {
                            filename: key,
                            url: url,
                            storage: 's3'
                        }
                    });
                } catch (s3Err) {
                    console.error('AWS S3 upload failed, falling back to local storage:', s3Err.message);
                }
            }

            // Local disk fallback
            const backendLink = process.env.BACKEND_LINK || 'http://localhost:4000';
            const fileUrl = `${backendLink.replace(/\/$/, '')}/uploads/${req.file.filename}`;

            res.status(200).json({
                success: true,
                message: 'Image uploaded successfully',
                data: {
                    filename: req.file.filename,
                    url: fileUrl,
                    storage: 'local'
                }
            });
        } catch (err) {
            next(err);
        }
    }

    static async importCatalog(req, res, next) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No catalog file uploaded.' });
            }

            const { catalogId } = req.body;
            if (!catalogId) {
                return res.status(400).json({ success: false, message: 'catalogId is required in request body.' });
            }

            const result = await ImportService.importCatalogFile(req.tenantId, catalogId, req.file.path, req.file.originalname);

            res.status(200).json({
                success: true,
                message: 'Catalog imported successfully as draft items for review.',
                data: result
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = UploadController;
