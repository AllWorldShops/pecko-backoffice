import { Router } from 'express'
import path from 'path'
import { existsSync } from 'fs'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params

  // Sanitise — allow only safe characters
  if (!/^[\w-]+$/.test(jobId) || !/^[\w.-]+\.xlsx$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid download path' })
  }

  const filePath = path.join(process.env.UPLOAD_DIR || './uploads', 'output', jobId, filename)
  if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' })

  res.download(filePath, filename)
})

export default router
