import multer from 'multer'
import path from 'path'
import { mkdirSync } from 'fs'

const ALLOWED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                           // .xls
  'application/pdf',
  'image/png',
  'image/jpeg',
])

const IMPORT_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                           // .xls
  'text/csv',
  'text/plain', // some OS/browser combos send .csv as text/plain
  'application/csv',
  'application/octet-stream', // fallback for some CSV uploads
])

// In-memory upload for CSV/Excel imports — no disk write needed
export const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB cap for mapping files
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (IMPORT_MIMES.has(file.mimetype) || ext === '.csv' || ext === '.xlsx' || ext === '.xls') {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type. Upload a .xlsx, .xls, or .csv file.`))
    }
  },
})

const uploadDir = process.env.UPLOAD_DIR || './uploads'
mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  },
})

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`))
    }
  },
})
