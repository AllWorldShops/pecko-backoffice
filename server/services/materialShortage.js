// Material Shortage Report (PM): combines an Odoo MO export with the Inventory → Internal
// Transfer (MO picking) export into one report per MO: which component parts each MO
// needs (Demand), how much is reserved (Stock Moves/Quantity), and the shortage
// (Demand − Reserved, never below 0).
//
// Transfer shape: a transfer's first row fills Reference/Source Document/…; the rest of
// its stock moves follow on rows that fill only the Stock Moves/* columns, so the MO is
// carried forward from the last row with a Reference. Columns are located by HEADER NAME.
import xlsx from 'xlsx'
import ExcelJS from 'exceljs'
import { PassThrough } from 'stream'

// Each field lists the header names it may appear under (first match wins).
const MO_HEADERS = {
  mo: ['Reference'],
  source: ['Source'],
  customerPo: ['Customer PO No'],
  product: ['Product'],
  custPart: ['Part Number'],
  description: ['Description'],
  qty: ['Quantity To Produce'],
  state: ['State'],
}
const TRANSFER_HEADERS = {
  reference: ['Reference'],
  mo: ['Source Document'],
  position: ['Stock Moves/Position'],
  part: ['Stock Moves/Product/Internal Reference'],
  custPart: ['Stock Moves/Product/MPN/Customer/Supplier Part No'],
  description: ['Stock Moves/Product/Description'],
  demand: ['Stock Moves/Demand', 'Demand'],
  reserved: ['Stock Moves/Quantity', 'Quantity'],
  uom: ['Stock Moves/Product/Unit of Measure', 'Stock Moves/Unit of Measure'],
}

const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const text = cell => (cell == null ? '' : String(cell.v ?? '').trim())
const num = cell => (typeof cell?.v === 'number' ? cell.v : Number(String(cell?.v ?? '').replace(/,/g, '')) || 0)
const round = n => Math.round(n * 10000) / 10000 // quantities: keep up to 4 dp (metres etc.)

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

// Dense mode + no formatted text keeps memory down: the transfer export is ~100k rows.
function readSheet(buffer, label, wanted, required) {
  const wb = xlsx.read(buffer, { type: 'buffer', dense: true, cellText: false, cellHTML: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws?.['!ref']) throw httpError(`The ${label} file is empty.`)
  const range = xlsx.utils.decode_range(ws['!ref'])
  const data = ws['!data'] || ws // SheetJS 0.18 keeps dense rows on the sheet itself
  const cellAt = (r, c) => data[r]?.[c]

  const header = []
  for (let c = range.s.c; c <= range.e.c; c++) header.push(norm(text(cellAt(range.s.r, c))))
  const col = Object.fromEntries(Object.entries(wanted).map(([k, names]) => {
    const i = names.map(n => header.indexOf(norm(n))).find(i => i !== -1)
    return [k, i ?? -1]
  }))
  const missing = required.filter(k => col[k] === -1).map(k => `"${wanted[k][0]}"`)
  if (missing.length) {
    throw httpError(`The ${label} file is missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Check you uploaded the right file and its first row is the Odoo export header.`)
  }

  const get = (cells, k) => (col[k] === -1 ? undefined : cells[col[k]])
  const rows = []
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cells = Array.from({ length: header.length }, (_, i) => cellAt(r, range.s.c + i))
    if (cells.some(c => text(c))) rows.push(k => get(cells, k))
  }
  return rows
}

// "PM/MO/123" — or a combined origin like "OP/00001,PM/MO/123" → the MO token.
function moFromSource(source) {
  const parts = source.split(',').map(s => s.trim())
  return parts.find(p => /\/MO\//i.test(p)) || ''
}

export function buildShortageReport(moBuffer, transferBuffer) {
  const moRows = readSheet(moBuffer, 'MO report', MO_HEADERS, ['mo', 'product'])
  const trRows = readSheet(transferBuffer, 'internal transfer', TRANSFER_HEADERS, ['mo', 'part', 'demand', 'reserved'])

  // MOs in the order of the MO report (first occurrence wins if an MO repeats).
  const mos = new Map()
  for (const get of moRows) {
    const mo = text(get('mo'))
    if (!mo || mos.has(norm(mo))) continue
    mos.set(norm(mo), {
      mo, source: text(get('source')), customerPo: text(get('customerPo')), product: text(get('product')),
      custPart: text(get('custPart')), description: text(get('description')), qty: num(get('qty')),
      state: text(get('state')), lines: [],
    })
  }

  // Component lines, carrying the transfer's reference + MO down its continuation rows.
  let reference = ''
  let moKey = ''
  const unknownMos = new Set() // transfers for MOs that aren't in the MO report (closed/other)
  for (const get of trRows) {
    if (text(get('reference'))) {
      reference = text(get('reference'))
      moKey = norm(moFromSource(text(get('mo'))))
    }
    const part = text(get('part'))
    if (!part || !moKey) continue // section/note rows, returns, transfers not tied to an MO
    const mo = mos.get(moKey)
    if (!mo) { unknownMos.add(moKey); continue }
    const demand = num(get('demand'))
    const reserved = num(get('reserved'))
    mo.lines.push({
      reference, position: text(get('position')), part, custPart: text(get('custPart')),
      description: text(get('description')), uom: text(get('uom')),
      demand: round(demand), reserved: round(reserved), shortage: round(Math.max(0, demand - reserved)),
    })
  }

  // Per-MO status + the cross-MO parts summary (purchasing view): demand/reserved/shortage
  // totalled over all of a part's lines; only parts short on at least one MO are listed.
  const parts = new Map()
  const counts = { mos: mos.size, shortMos: 0, reservedMos: 0, noLinesMos: 0, lines: 0, shortLines: 0 }
  const report = [...mos.values()].map(mo => {
    let shortLines = 0
    for (const l of mo.lines) {
      const key = norm(l.part)
      if (!parts.has(key)) parts.set(key, { part: l.part, custPart: l.custPart, description: l.description, uom: l.uom, demand: 0, reserved: 0, shortage: 0, mos: [] })
      const p = parts.get(key)
      p.demand = round(p.demand + l.demand)
      p.reserved = round(p.reserved + l.reserved)
      if (l.shortage > 0) {
        shortLines++
        p.shortage = round(p.shortage + l.shortage)
        if (p.mos[p.mos.length - 1] !== mo.mo) p.mos.push(mo.mo) // lines arrive MO by MO
      }
    }
    counts.lines += mo.lines.length
    counts.shortLines += shortLines
    if (!mo.lines.length) counts.noLinesMos++
    else if (shortLines) counts.shortMos++
    else counts.reservedMos++
    return { ...mo, shortLines, status: !mo.lines.length ? 'no-lines' : shortLines ? 'short' : 'reserved' }
  })

  return {
    mos: report,
    parts: [...parts.values()].filter(p => p.shortage > 0).sort((a, b) => b.mos.length - a.mos.length || b.shortage - a.shortage),
    counts,
    unknownMos: unknownMos.size,
  }
}

// Compact form for the browser (the real transfer export is ~100k lines): component
// details and transfer refs are sent once in lookup lists and lines point at them by index.
//   mos[i]        = [mo, state, source, customerPo, product, custPart, description, qty, status, shortLines, lines]
//   lines[j]      = [componentIdx, refIdx, position, demand, reserved]   (shortage = demand − reserved, ≥ 0)
//   components[k] = [part, custPart, description, uom]
//   shortParts[n] = [componentIdx, demand, reserved, shortage, moCount]
export function compactReport(report) {
  const components = []
  const refs = []
  const componentIdx = new Map()
  const refIdx = new Map()
  const indexOf = (map, list, key, value) => {
    if (!map.has(key)) { map.set(key, list.length); list.push(value) }
    return map.get(key)
  }
  const component = l => indexOf(componentIdx, components, norm(l.part), [l.part, l.custPart, l.description, l.uom])
  return {
    counts: report.counts,
    unknownMos: report.unknownMos,
    mos: report.mos.map(m => [m.mo, m.state, m.source, m.customerPo, m.product, m.custPart, m.description, m.qty, m.status, m.shortLines,
      m.lines.map(l => [component(l), indexOf(refIdx, refs, l.reference, l.reference), l.position, l.demand, l.reserved])]),
    shortParts: report.parts.map(p => [component(p), p.demand, p.reserved, p.shortage, p.mos.length]),
    components,
    refs,
  }
}

export const STATUS_LABEL = { short: 'Short', reserved: 'Fully reserved', 'no-lines': 'No transfer lines' }

const DETAIL_COLUMNS = [
  ['MO', 'mo', 16], ['MO State', 'state', 12], ['Source', 'source', 22], ['Customer PO No', 'customerPo', 18],
  ['MO Product (Pecko P/N)', 'product', 24], ['MO Customer P/N', 'custPart', 24], ['MO Description', 'description', 34],
  ['Qty To Produce', 'qty', 10], ['Transfer Ref', 'reference', 28], ['Line', 'position', 6],
  ['Component Pecko P/N', 'part', 24], ['Component Customer P/N', 'linePart', 24], ['Component Description', 'lineDescription', 36],
  ['UoM', 'uom', 7], ['Demand', 'demand', 10], ['Reserved', 'reserved', 10], ['Shortage', 'shortage', 10], ['Status', 'status', 18],
]

// Sheet 1 "Material Shortage": one row per component line, MO columns repeated on every row
// so the sheet can be filtered; the first row of each MO is bold, short lines are red.
// Sheet 2 "Parts Short": each short component totalled across MOs, with the MOs needing it.
// Uses ExcelJS's streaming writer: ~100k styled rows would otherwise need >1 GB of memory.
const EXCEL_CELL_MAX = 32767

function moList(mos) {
  const all = mos.join(', ')
  if (all.length <= EXCEL_CELL_MAX) return all
  let out = ''
  let n = 0
  for (const mo of mos) {
    if (out.length + mo.length + 40 > EXCEL_CELL_MAX) break
    out += (n ? ', ' : '') + mo
    n++
  }
  return `${out} … (+${mos.length - n} more)`
}

export async function buildShortageWorkbook(report) {
  const out = new PassThrough()
  const chunks = []
  out.on('data', c => chunks.push(c))
  const done = new Promise((resolve, reject) => { out.on('end', resolve); out.on('error', reject) })

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: true })
  const ws = wb.addWorksheet('Material Shortage', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = DETAIL_COLUMNS.map(([header, key, width]) => ({ header, key, width }))
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: DETAIL_COLUMNS.length } }
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).commit()
  const SHORT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E1' } }
  const NOLINE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4D6' } }

  for (const mo of report.mos) {
    const head = { mo: mo.mo, state: mo.state, source: mo.source, customerPo: mo.customerPo, product: mo.product, custPart: mo.custPart, description: mo.description, qty: mo.qty }
    if (!mo.lines.length) {
      const row = ws.addRow({ ...head, status: STATUS_LABEL['no-lines'] })
      row.font = { bold: true }
      row.fill = NOLINE_FILL
      row.commit()
      continue
    }
    mo.lines.forEach((l, i) => {
      const row = ws.addRow({
        ...head, reference: l.reference, position: l.position, part: l.part, linePart: l.custPart, lineDescription: l.description,
        uom: l.uom, demand: l.demand, reserved: l.reserved, shortage: l.shortage, status: l.shortage > 0 ? 'SHORT' : 'OK',
      })
      if (i === 0) row.font = { bold: true }
      if (l.shortage > 0) {
        row.fill = SHORT_FILL
        row.getCell('shortage').font = { bold: true, color: { argb: 'FFC0392B' } }
      }
      row.commit()
    })
  }
  ws.commit()

  const ps = wb.addWorksheet('Parts Short', { views: [{ state: 'frozen', ySplit: 1 }] })
  ps.columns = [
    { header: 'Pecko P/N', key: 'part', width: 24 }, { header: 'Customer P/N', key: 'custPart', width: 24 },
    { header: 'Description', key: 'description', width: 36 }, { header: 'UoM', key: 'uom', width: 7 },
    { header: 'Total Demand', key: 'demand', width: 12 }, { header: 'Total Reserved', key: 'reserved', width: 12 },
    { header: 'Total Shortage', key: 'shortage', width: 12 }, { header: 'MOs Short', key: 'moCount', width: 10 },
    { header: 'MOs', key: 'mos', width: 60 },
  ]
  ps.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } }
  ps.getRow(1).font = { bold: true }
  ps.getRow(1).commit()
  for (const p of report.parts) ps.addRow({ ...p, moCount: p.mos.length, mos: moList(p.mos) }).commit()
  ps.commit()

  await wb.commit()
  await done
  return Buffer.concat(chunks)
}
