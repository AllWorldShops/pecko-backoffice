import { Router } from 'express'
import path from 'path'
import { requireAuth } from '../middleware/auth.js'
import { requireCompany } from '../middleware/companyOnly.js'
import { importUpload } from '../middleware/upload.js'
import { buildGrValueReport, buildGrValueWorkbook } from '../services/grValue.js'

const router = Router()
router.use(requireAuth, requireCompany('PM'))

// POST /api/gr-value/process — multipart `receipts` + `poLines` (Odoo exports) and
// `rates` (JSON, e.g. {"MYR":4.4} = 1 USD → 4.4 MYR). Stateless: the client re-posts
// both files whenever the rates change, so nothing is stored.
router.post('/process', importUpload.fields([{ name: 'receipts', maxCount: 1 }, { name: 'poLines', maxCount: 1 }]), (req, res, next) => {
  try {
    const receipts = req.files?.receipts?.[0]
    const poLines = req.files?.poLines?.[0]
    if (!receipts || !poLines) return res.status(400).json({ error: 'Upload both the receipts file and the PO lines file.' })
    let rates = {}
    try {
      rates = JSON.parse(req.body.rates || '{}')
    } catch {
      return res.status(400).json({ error: 'Invalid exchange rates.' })
    }

    const report = buildGrValueReport(receipts.buffer, poLines.buffer, rates)
    const file = buildGrValueWorkbook(report)
    const { lines, receiptHeader, ...summary } = report
    res.json({
      ...summary,
      header: receiptHeader,
      // display rows: the original receipt cells as text + the computed fields
      rows: lines.map(l => ({
        cells: l.cells.map(c => (c == null ? '' : String(c.w ?? c.v ?? ''))),
        currency: l.currency, poPrice: l.poPrice, poUom: l.poUom, unitPrice: l.unitPrice,
        value: l.value, rate: l.rate, usd: l.usd, flags: l.flags,
      })),
      filename: `${path.parse(receipts.originalname).name}-gr-value.xlsx`,
      fileBase64: file.toString('base64'),
    })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

export default router
