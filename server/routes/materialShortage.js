import { Router } from 'express'
import path from 'path'
import zlib from 'zlib'
import { requireAuth } from '../middleware/auth.js'
import { requireCompany } from '../middleware/companyOnly.js'
import { requireAdmin } from '../middleware/adminOnly.js'
import { largeImportUpload } from '../middleware/upload.js'
import { buildShortageReport, buildShortageWorkbook, compactReport } from '../services/materialShortage.js'
import { logShortageRun, getShortageStats } from '../services/materialShortageAnalytics.js'

const router = Router()
router.use(requireAuth, requireCompany('PM'))

const uploadBoth = largeImportUpload.fields([{ name: 'mo', maxCount: 1 }, { name: 'transfer', maxCount: 1 }])

function filesOf(req) {
  const mo = req.files?.mo?.[0]
  const transfer = req.files?.transfer?.[0]
  if (!mo || !transfer) {
    const err = new Error('Upload both the MO report and the internal transfer report.')
    err.status = 400
    throw err
  }
  return { mo, transfer }
}

// POST /api/material-shortage/process — multipart `mo` (Odoo MO export) + `transfer`
// (Inventory → Internal Transfer export). Stateless; returns the compact report for display
// (see compactReport), gzipped because a full export is ~100k component lines.
router.post('/process', uploadBoth, async (req, res, next) => {
  const log = {
    userId: req.user.id, username: req.user.username,
    moFile: req.files?.mo?.[0]?.originalname || '', transferFile: req.files?.transfer?.[0]?.originalname || '',
  }
  try {
    const { mo, transfer } = filesOf(req)
    const report = buildShortageReport(mo.buffer, transfer.buffer)
    const c = report.counts
    await logShortageRun({ ...log, moCount: c.mos, lineCount: c.lines, shortMos: c.shortMos, shortLines: c.shortLines, success: true })

    const json = JSON.stringify(compactReport(report))
    res.type('application/json')
    if (req.acceptsEncodings('gzip')) {
      res.set('Content-Encoding', 'gzip')
      return res.send(zlib.gzipSync(json))
    }
    res.send(json)
  } catch (err) {
    if (req.files?.mo && req.files?.transfer) await logShortageRun({ ...log, success: false, error: err.message }).catch(() => {})
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// POST /api/material-shortage/download — same two files → the styled .xlsx. Built on demand
// (not with /process) because the full workbook is ~10 MB; not logged as a separate run.
router.post('/download', uploadBoth, async (req, res, next) => {
  try {
    const { mo, transfer } = filesOf(req)
    const file = await buildShortageWorkbook(buildShortageReport(mo.buffer, transfer.buffer))
    const name = `${path.parse(transfer.originalname).name}-material-shortage.xlsx`
    res.set('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`)
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(file)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// GET /api/material-shortage/stats — usage analytics for the dashboard (admins only)
router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    res.json(await getShortageStats())
  } catch (err) {
    next(err)
  }
})

export default router
