// MO Status (PM): collapses an Odoo Manufacturing Order export into one row per MO.
//
// Export shape: an MO's header row fills the MO columns (Production Cell, Reference,
// Source, Product, … dates); its Work Orders follow on continuation rows that fill only
// the three Work Order columns. The MO's current status is the highest-priority Work
// Order status among all of its lines.
//
// Columns are located by HEADER NAME, not position, so column order/count can change
// (the export grew from A–K to A–Q with Production Cell first) without breaking this.
import xlsx from 'xlsx'

// Highest priority first. Odoo's label is "Waiting for another WO"; "…another MO" is
// accepted as an alias since that's how it gets said out loud.
export const PRIORITY = ['In Progress', 'Ready', 'Waiting for components', 'Waiting for another WO', 'Finished']
const ALIASES = { 'waiting for another mo': 'waiting for another wo' }

const HEADERS = {
  reference: 'Reference', // a non-empty Reference starts a new MO
  workOrder: 'Work Orders/Work Order',
  workCenter: 'Work Orders/Work Center',
  status: 'Work Orders/Status',
}

const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
// Display text: Excel's own formatted text (dates as 2026-07-20, 10.00), else the raw value.
const text = cell => (cell == null ? '' : String(cell.w ?? cell.v ?? '').trim())

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
  // cellNF keeps each cell's number format so dates/quantities are written back unchanged.
  const wb = xlsx.read(buffer, { type: 'buffer', cellNF: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws?.['!ref']) throw httpError('The sheet is empty.')
  const range = xlsx.utils.decode_range(ws['!ref'])
  const cellAt = (r, c) => ws[xlsx.utils.encode_cell({ r, c })]

  // Header row, trimmed of trailing unnamed columns.
  let header = []
  for (let c = range.s.c; c <= range.e.c; c++) header.push(text(cellAt(range.s.r, c)))
  while (header.length && !header[header.length - 1]) header.pop()

  const col = Object.fromEntries(Object.entries(HEADERS).map(([k, name]) => [k, header.findIndex(h => norm(h) === norm(name))]))
  const missing = ['reference', 'status'].filter(k => col[k] === -1).map(k => `"${HEADERS[k]}"`)
  if (missing.length) throw httpError(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(' and ')}. Check the first row is the Odoo export header.`)

  const width = header.length
  const mos = []
  let current = null
  let lines = 0

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cells = Array.from({ length: width }, (_, i) => cellAt(r, range.s.c + i))
    if (cells.every(c => !text(c))) continue
    lines++
    if (text(cells[col.reference])) {
      current = { cells, best: null }
      mos.push(current)
    }
    if (!current || !text(cells[col.status])) continue // stray lines before the first MO / no status
    // Strict "<" keeps the first Work Order in sequence when several share the top status.
    if (!current.best || rank(text(cells[col.status])) < rank(text(current.best[col.status]))) current.best = cells
  }

  if (!mos.length) throw httpError('No Manufacturing Orders found — the "Reference" column is empty on every row.')

  // Output = the MO data columns exactly as on the MO's header row (A–N in the current
  // layout) + the status column holding the winning status (Q). The per-line Work Order
  // and Work Center columns (O, P) are dropped — after collapsing they describe one line,
  // not the MO.
  const dropped = new Set([col.workOrder, col.workCenter].filter(i => i !== -1))
  const keep = header.map((_, i) => i).filter(i => !dropped.has(i))
  const unknown = new Set()
  const counts = {}
  const cellRows = mos.map(({ cells, best }) => {
    const status = best ? text(best[col.status]) : ''
    if (status && rank(status) === PRIORITY.length) unknown.add(status)
    const key = status || 'No status'
    counts[key] = (counts[key] || 0) + 1
    return keep.map(i => (i === col.status ? (best || cells)[i] : cells[i]))
  })

  return {
    header: keep.map(i => header[i]),
    rows: cellRows.map(row => row.map(text)), // display strings for the UI
    cellRows, // original cell objects (types + number formats) for the download
    statusCol: keep.indexOf(col.status),
    counts,
    unknownStatuses: [...unknown],
    workOrderLines: lines,
  }
}

// Writes the original cell objects back, so dates stay real dates and quantities keep
// their number format — the download opens in Excel exactly like the Odoo export.
export function buildMoWorkbook(header, cellRows) {
  const data = cellRows.map(row => row.map(c => (c ? { t: c.t, v: c.v, ...(c.z ? { z: c.z } : {}) } : null)))
  const ws = xlsx.utils.aoa_to_sheet([header, ...data])
  ws['!cols'] = header.map((h, i) => ({
    wch: Math.min(45, Math.max(10, h.length, ...cellRows.map(r => text(r[i]).length)) + 2),
  }))
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'MO Status')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
