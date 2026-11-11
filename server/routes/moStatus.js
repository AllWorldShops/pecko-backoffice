import { Router } from 'express'
import path from 'path'
import { requireAuth } from '../middleware/auth.js'
import { requireCompany } from '../middleware/companyOnly.js'
import { requireAdmin } from '../middleware/adminOnly.js'
import { importUpload } from '../middleware/upload.js'
import { summarizeMoStatus, buildMoWorkbook } from '../services/moStatus.js'
import { logMoImport, getMoStats } from '../services/moStatusAnalytics.js'

const router = Router()
router.use(requireAuth, requireCompany('PM'))

// POST /api/mo-status/process — multipart `file` (Odoo MO export).
// Stateless: returns the collapsed rows for display plus the cleaned .xlsx (base64)
// for download, so nothing is written to disk or the DB.
router.post('/process', importUpload.single('file'), async (req, res, next) => {
  const log = { userId: req.user.id, username: req.user.username, filename: req.file?.originalname || '' }
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received' })
    const { cellRows, ...result } = summarizeMoStatus(req.file.buffer)
    const file = buildMoWorkbook(result.header, cellRows)
    await logMoImport({ ...log, workOrderLines: result.workOrderLines, moCount: result.rows.length, success: true })
    res.json({
      ...result,
      filename: `${path.parse(req.file.originalname).name}-mo-status.xlsx`,
      fileBase64: file.toString('base64'),
    })
  } catch (err) {
    await logMoImport({ ...log, success: false, error: err.message }).catch(() => {})
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// GET /api/mo-status/stats — usage analytics for the MO Status dashboard (admins only)
router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    res.json(await getMoStats())
  } catch (err) {
    next(err)
  }
})

export default router
