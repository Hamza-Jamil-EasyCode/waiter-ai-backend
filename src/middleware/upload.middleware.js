const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsFolder = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsFolder)) {
    fs.mkdirSync(uploadsFolder, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsFolder);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname).toLowerCase();
        const safeBasename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${safeBasename}-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.csv', '.xlsx', '.xls', '.pdf', '.docx', '.doc'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Allowed formats: ${allowedExtensions.join(', ')}`), false);
    }
};

const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10); // 10MB default

const upload = multer({
    storage: storage,
    limits: { fileSize: maxSize },
    fileFilter: fileFilter
});

module.exports = upload;
