const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');

class S3Service {
    static getCredentials() {
        const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
        const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
        const bucketName = process.env.S3_BUCKET_NAME || process.env.AWS_BUCKET_NAME;

        return { accessKeyId, secretAccessKey, region, bucketName };
    }

    static isConfigured() {
        const { accessKeyId, secretAccessKey, bucketName } = this.getCredentials();
        return Boolean(accessKeyId && secretAccessKey && bucketName);
    }

    static getClient() {
        if (this._client) return this._client;

        const { accessKeyId, secretAccessKey, region } = this.getCredentials();
        if (!accessKeyId || !secretAccessKey) {
            return null;
        }

        this._client = new S3Client({
            region,
            credentials: {
                accessKeyId,
                secretAccessKey
            }
        });

        return this._client;
    }

    /**
     * Upload a file to AWS S3.
     * @param {Object} file - Multer file object or custom buffer object
     * @param {String} [folder='dishes'] - S3 subfolder prefix
     * @returns {Promise<{ key: string, url: string }>}
     */
    static async uploadFile(file, folder = 'dishes') {
        const { bucketName, region } = this.getCredentials();
        const client = this.getClient();

        if (!client || !bucketName) {
            throw new Error('AWS S3 is not configured. Missing S3_ACCESS_KEY, S3_SECRET_KEY, or S3_BUCKET_NAME.');
        }

        const ext = path.extname(file.originalname || file.filename || '').toLowerCase() || '.jpg';
        const safeBase = path.basename(file.originalname || file.filename || 'dish', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const key = `${folder}/${safeBase}-${uniqueSuffix}${ext}`;

        let bodyBuffer = file.buffer;
        if (!bodyBuffer && file.path && fs.existsSync(file.path)) {
            bodyBuffer = fs.readFileSync(file.path);
        }

        if (!bodyBuffer) {
            throw new Error('File content buffer is missing for S3 upload.');
        }

        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.pdf': 'application/pdf'
        };
        const contentType = file.mimetype || mimeTypes[ext] || 'application/octet-stream';

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: bodyBuffer,
            ContentType: contentType
        });

        await client.send(command);

        // Standard S3 public URL format
        const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

        return { key, url };
    }

    /**
     * Delete a file from AWS S3.
     * @param {String} key - S3 object key or full S3 URL
     */
    static async deleteFile(keyOrUrl) {
        if (!keyOrUrl) return;
        const { bucketName } = this.getCredentials();
        const client = this.getClient();
        if (!client || !bucketName) return;

        let key = keyOrUrl;
        if (keyOrUrl.startsWith('http')) {
            try {
                const parsed = new URL(keyOrUrl);
                key = parsed.pathname.replace(/^\//, '');
            } catch {
                // Keep key as is
            }
        }

        try {
            const command = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: key
            });
            await client.send(command);
        } catch (err) {
            console.warn('Failed to delete S3 file:', err.message);
        }
    }
}

module.exports = S3Service;
