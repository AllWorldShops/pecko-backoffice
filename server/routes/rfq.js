import { Router } from 'express'
import express from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/adminOnly.js'
import { requireCompany } from '../middleware/companyOnly.js'
import { importUpload } from '../middleware/upload.js'
import { saveRfqSnapshot } from '../services/rfqStore.js'
import { syncRfqFromGraph, isGraphConfigured } from '../services/rfqGraphSync.js'
import { logger } from '../lib/logger.js'

const router = Router()

// Sync accepts two callers:
//  - a logged-in user clicking "Sync Now" (multipart file upload, JWT auth)
//  - the Power Automate daily flow (raw .xlsx bytes + shared secret header, no JWT)
function rfqSyncAuth(req, res, next) {
  const secret = process.env.RFQ_SYNC_SECRET
  const provided = req.get('x-rfq-secret')
  if (secret && provided && provided === secret) {
    req.syncSource = 'webhook'
    return next()
  }
  req.syncSource = 'upload'
  return requireAuth(req, res, next)
}

// Raw parser for the webhook path; multipart requests pass straight through untouched.
const rawXlsx = express.raw({
  type: ['application/octet-stream', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  limit: '25mb',
})

router.post('/sync', rfqSyncAuth, rawXlsx, importUpload.single('file'), async (req, res, next) => {
  try {
    const buffer = req.file?.buffer || (Buffer.isBuffer(req.body) && req.body.length ? req.body : null)
    if (!buffer) return res.status(400).json({ error: 'No file received' })
    const { stats, syncedAt } = await saveRfqSnapshot(buffer, req.syncSource)
    logger.info(`RFQ sync (${req.syncSource}): ${stats.total} rows, ${stats.pendingReview} pending review`)
    res.json({ success: true, stats, syncedAt })
  } catch (err) {
    logger.error('RFQ sync failed:', err)
    next(err)
  }
})

// Admin-triggered pull straight from the source file via Microsoft Graph (same path the 10pm job uses).
// Lets an admin test the scheduled sync on demand once the Graph credentials are configured.
router.post('/sync/graph', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isGraphConfigured()) {
      return res.status(400).json({ error: 'Source sync is not configured on the server (missing Graph credentials)' })
    }
    const { stats, syncedAt } = await syncRfqFromGraph('manual')
    res.json({ success: true, stats, syncedAt })
  } catch (err) {
    logger.error('RFQ Graph sync failed:', err)
    next(err)
  }
})

// Status ordering for display: action-required first.
const STATUS_RANK = { PENDING_REVIEW: 0, OTHER: 1, NONE: 2, COMPLETED: 3 }

router.get('/projects', requireAuth, requireCompany('PM'), async (req, res, next) => {
  try {
    const { status, customer, q } = req.query
    const where = {}
    if (status) where.status = String(status)
    if (customer) where.customer = String(customer)

    // ponytail: ~900 rows — fetch matching set and do free-text filter + custom sort in JS.
    // If this ever grows past a few thousand rows, push search/sort into SQL.
    let rows = await prisma.rfqProject.findMany({ where })
    if (q) {
      const needle = String(q).toLowerCase()
      rows = rows.filter(r =>
        r.projectId.toLowerCase().includes(needle) ||
        r.customer.toLowerCase().includes(needle) ||
        r.notes.toLowerCase().includes(needle)
      )
    }
    rows.sort((a, b) => {
      const s = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
      if (s !== 0) return s
      const ad = a.rfqDueDate ? new Date(a.rfqDueDate).getTime() : Infinity
      const bd = b.rfqDueDate ? new Date(b.rfqDueDate).getTime() : Infinity
      if (ad !== bd) return ad - bd
      return a.rowNumber - b.rowNumber
    })
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/stats', requireAuth, requireCompany('PM'), async (req, res, next) => {
  try {
    const [lastSync, all] = await Promise.all([
      prisma.rfqSync.findFirst({ orderBy: { syncedAt: 'desc' } }),
      prisma.rfqProject.findMany({ select: { customer: true, projectType: true, status: true } }),
    ])
    const counts = { total: all.length, completed: 0, pendingReview: 0, other: 0, none: 0 }
    for (const r of all) {
      if (r.status === 'COMPLETED') counts.completed++
      else if (r.status === 'PENDING_REVIEW') counts.pendingReview++
      else if (r.status === 'OTHER') counts.other++
      else counts.none++
    }
    const customers = [...new Set(all.map(r => r.customer).filter(Boolean))].sort()
    const projectTypes = [...new Set(all.map(r => r.projectType).filter(Boolean))].sort()
    res.json({
      counts,
      customers,
      projectTypes,
      lastSyncedAt: lastSync?.syncedAt ?? null,
      lastSource: lastSync?.source ?? null,
    })
  } catch (err) { next(err) }
})

export default router
