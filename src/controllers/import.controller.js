const ImportService = require('../services/catalog/import.service');

class ImportController {
    static async importFromLink(req, res, next) {
        try {
            const { url } = req.body;
            if (!url) {
                return res.status(400).json({ success: false, message: 'URL is required.' });
            }

            const extractedData = await ImportService.extractFromLink(url, req.tenantId);

            res.status(200).json({
                success: true,
                message: 'Menu extracted successfully from link.',
                data: extractedData
            });
        } catch (err) {
            next(err);
        }
    }

    static async importFromPdf(req, res, next) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No PDF file uploaded.' });
            }

            const extractedData = await ImportService.extractFromPdf(req.file.path, req.tenantId);

            res.status(200).json({
                success: true,
                message: 'Menu extracted successfully from PDF.',
                data: extractedData
            });
        } catch (err) {
            next(err);
        }
    }

    static async importFromPhotos(req, res, next) {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ success: false, message: 'No photo files uploaded.' });
            }

            const filePaths = req.files.map((f) => f.path);
            const extractedData = await ImportService.extractFromPhotos(filePaths, req.tenantId);

            res.status(200).json({
                success: true,
                message: 'Menu extracted successfully from photos.',
                data: extractedData
            });
        } catch (err) {
            next(err);
        }
    }

    static async importFromSpreadsheet(req, res, next) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No spreadsheet file uploaded.' });
            }

            const extractedData = await ImportService.extractFromSpreadsheet(req.file.path, req.tenantId);

            res.status(200).json({
                success: true,
                message: 'Menu extracted successfully from spreadsheet.',
                data: extractedData
            });
        } catch (err) {
            next(err);
        }
    }

    static async saveImportedMenu(req, res, next) {
        try {
            const { menuName, description, categories } = req.body;
            if (!categories || !Array.isArray(categories) || categories.length === 0) {
                return res.status(400).json({ success: false, message: 'No categories or dishes to save.' });
            }

            const result = await ImportService.saveImportedMenu(req.tenantId, {
                menuName,
                description,
                categories
            });

            res.status(201).json({
                success: true,
                message: 'Menu saved successfully as draft.',
                data: result
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = ImportController;
