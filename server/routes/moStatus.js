import { Router } from 'express'
import path from 'path'
import { requireAuth } from '../middleware/auth.js'
import { requireCompany } from '../middleware/companyOnly.js'
import { importUpload } from '../middleware/upload.js'
import { summarizeMoStatus, buildMoWorkbook } from '../services/moStatus.js'

const router = Router()
router.use(requireAuth, requireCompany('PM'))

// POST /api/mo-status/process — multipart `file` (Odoo MO export).
// Stateless: returns the collapsed rows for display plus the cleaned .xlsx (base64)
// for download, so nothing is written to disk or the DB.
router.post('/process', importUpload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received' })
    const result = summarizeMoStatus(req.file.buffer)
    const file = buildMoWorkbook(result.header, result.rows)
    res.json({
      ...result,
      filename: `${path.parse(req.file.originalname).name}-mo-status.xlsx`,
      fileBase64: file.toString('base64'),
    })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

export default router
