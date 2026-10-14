// MO Status (PM): collapses an Odoo Manufacturing Order export into one row per MO.
//
// Export shape: an MO's header row fills A–H (Reference … State); its Work Orders follow
// on continuation rows that fill only I–K (Work Order, Work Center, Status). The MO's
// current status is the highest-priority Work Order status among all of its lines.
import xlsx from 'xlsx'

// Highest priority first. Odoo's label is "Waiting for another WO"; "…another MO" is
// accepted as an alias since that's how it gets said out loud.
export const PRIORITY = ['In Progress', 'Ready', 'Waiting for components', 'Waiting for another WO', 'Finished']
const ALIASES = { 'waiting for another mo': 'waiting for another wo' }

const COLS = 11 // A–K
const WO_NAME = 8, WO_CENTER = 9, STATUS = 10 // I, J, K

const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const blank = v => String(v ?? '').trim() === ''

// Lower is more important; anything unrecognised ranks below "Finished".
function rank(status) {
  const n = ALIASES[norm(status)] || norm(status)
  const i = PRIORITY.findIndex(p => p.toLowerCase() === n)
  return i === -1 ? PRIORITY.length : i
}

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

export function summarizeMoStatus(buffer) {
  const wb = xlsx.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (grid.length < 2) throw httpError('The sheet has no data rows.')

  const header = Array.from({ length: COLS }, (_, i) => String(grid[0][i] ?? '').trim())
  const mos = []
  let current = null

  for (const raw of grid.slice(1)) {
    const cells = Array.from({ length: COLS }, (_, i) => raw[i] ?? '')
    if (cells.every(blank)) continue
    if (!blank(cells[0])) {
      current = { cells, best: null }
      mos.push(current)
    }
    if (!current || blank(cells[STATUS])) continue // stray lines before the first MO / no status
    // Strict "<" keeps the first Work Order in sequence when several share the top status.
    if (!current.best || rank(cells[STATUS]) < rank(current.best[STATUS])) current.best = cells
  }

  if (!mos.length) throw httpError('No Manufacturing Orders found — column A (Reference) is empty on every row.')

  const unknown = new Set()
  const counts = {}
  const rows = mos.map(({ cells, best }) => {
    const status = best ? String(best[STATUS]).trim() : ''
    if (status && rank(status) === PRIORITY.length) unknown.add(status)
    const key = status || 'No status'
    counts[key] = (counts[key] || 0) + 1
    // A–H from the MO header row; I–J from the Work Order that holds the winning status.
    return [...cells.slice(0, WO_NAME), (best || cells)[WO_NAME], (best || cells)[WO_CENTER], status]
  })

  return { header, rows, counts, unknownStatuses: [...unknown], workOrderLines: grid.length - 1 }
}

export function buildMoWorkbook(header, rows) {
  const ws = xlsx.utils.aoa_to_sheet([header, ...rows])
  ws['!cols'] = header.map((h, i) => ({
    wch: Math.min(45, Math.max(10, h.length, ...rows.map(r => String(r[i] ?? '').length)) + 2),
  }))
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'MO Status')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
