// GR Value Report (PM): prices an Odoo receipts export using an Odoo PO-lines export.
//
// Receipts never carry a value, so each receipt line is matched to its PO line on
// (Source Document = Order Reference) + (Internal Reference = Pecko Part Number), and
// valued as received qty × PO unit price, converted to the receipt's unit of measure
// and then to the report currency (USD) with user-entered exchange rates.
//
// Receipt shape: a receipt's header row fills Reference/Contact/Status/Source Document/…;
// further products of the same receipt follow on rows that fill only the Operations/*
// columns, so the Source Document is carried forward from the last Reference row.
// Columns are located by HEADER NAME, not position.
import xlsx from 'xlsx'

export const REPORT_CURRENCY = 'USD'

const RECEIPT_HEADERS = {
  reference: 'Reference',
  po: 'Source Document',
  part: 'Operations/Product/Internal Reference',
  qty: 'Operations/Quantity',
  uom: 'Operations/Product/Unit of Measure',
}
const PO_HEADERS = {
  po: 'Order Reference',
  part: 'Pecko Part Number',
  currency: 'Currency',
  price: 'Unit Price',
  uom: 'Unit of Measure',
}

const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const text = cell => (cell == null ? '' : String(cell.w ?? cell.v ?? '').trim())
const num = cell => (typeof cell?.v === 'number' ? cell.v : Number(String(cell?.v ?? '').replace(/,/g, '')) || 0)
const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

// Metres in one unit of `uom`, or null if it isn't a length unit. Handles plain units
// (m, ft) and Odoo's packaging units that state their length ("r20 - Roll - 20m",
// "r1h=100 MTR").
export function metresPerUnit(uom) {
  const u = norm(uom)
  if (['m', 'mtr', 'mtrs', 'meter', 'meters', 'metre', 'metres'].includes(u)) return 1
  if (['ft', 'feet', 'foot'].includes(u)) return 0.3048
  if (['km'].includes(u)) return 1000
  if (['cm'].includes(u)) return 0.01
  if (['mm'].includes(u)) return 0.001
  const m = u.match(/(\d+(?:\.\d+)?)\s*(m|mtr|mtrs|meters?|metres?)\b/)
  return m ? Number(m[1]) : null
}

const COUNT_ALIASES = { pc: 'pcs', piece: 'pcs', pieces: 'pcs', unit: 'pcs', units: 'pcs', ea: 'pcs', each: 'pcs' }
const countUnit = uom => COUNT_ALIASES[norm(uom)] || norm(uom)

// Factor to turn a price per PO unit into a price per receipt unit.
// → { factor, converted } or { factor: null } when the units can't be reconciled.
export function unitFactor(receiptUom, poUom) {
  if (!norm(poUom) || countUnit(receiptUom) === countUnit(poUom)) return { factor: 1, converted: false }
  const r = metresPerUnit(receiptUom)
  const p = metresPerUnit(poUom)
  if (r && p) return { factor: r / p, converted: r !== p }
  return { factor: null }
}

function readSheet(buffer, label, wanted, required) {
  const wb = xlsx.read(buffer, { type: 'buffer', cellNF: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws?.['!ref']) throw httpError(`The ${label} file is empty.`)
  const range = xlsx.utils.decode_range(ws['!ref'])
  const cellAt = (r, c) => ws[xlsx.utils.encode_cell({ r, c })]

  const header = []
  for (let c = range.s.c; c <= range.e.c; c++) header.push(text(cellAt(range.s.r, c)))
  while (header.length && !header[header.length - 1]) header.pop()

  const col = Object.fromEntries(Object.entries(wanted).map(([k, name]) => [k, header.findIndex(h => norm(h) === norm(name))]))
  const missing = required.filter(k => col[k] === -1).map(k => `"${wanted[k]}"`)
  if (missing.length) {
    throw httpError(`The ${label} file is missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Check you uploaded the right file and its first row is the Odoo export header.`)
  }

  const rows = []
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cells = Array.from({ length: header.length }, (_, i) => cellAt(r, range.s.c + i))
    if (cells.some(c => text(c))) rows.push(cells)
  }
  return { header, col, rows }
}

// rates: { MYR: 4.4, SGD: 1.35 } meaning 1 USD = <rate> <currency>.
export function buildGrValueReport(receiptsBuffer, poLinesBuffer, rates = {}) {
  const rec = readSheet(receiptsBuffer, 'receipts', RECEIPT_HEADERS, ['po', 'part', 'qty'])
  const po = readSheet(poLinesBuffer, 'PO lines', PO_HEADERS, ['po', 'part', 'currency', 'price'])

  // PO line index on PO number + part. Blank-part lines (notes/sections) are skipped.
  const index = new Map()
  for (const cells of po.rows) {
    const part = text(cells[po.col.part])
    if (!part) continue
    const key = `${norm(text(cells[po.col.po]))}|${norm(part)}`
    if (!index.has(key)) index.set(key, [])
    index.get(key).push({
      currency: text(cells[po.col.currency]).toUpperCase() || REPORT_CURRENCY,
      price: num(cells[po.col.price]),
      uom: po.col.uom === -1 ? '' : text(cells[po.col.uom]),
    })
  }

  const currencies = [...new Set([...index.values()].flat().map(l => l.currency))].sort()
  const rateFor = cur => (cur === REPORT_CURRENCY ? 1 : Number(rates[cur]) > 0 ? Number(rates[cur]) : null)
  const missingRates = currencies.filter(c => !rateFor(c))

  let poNumber = ''
  const counts = { lines: 0, priced: 0, noMatch: 0, unitConverted: 0, unitMismatch: 0, noRate: 0 }
  const byCurrency = {}
  let totalUsd = 0

  const lines = rec.rows.map(cells => {
    if (rec.col.reference !== -1 && text(cells[rec.col.reference])) poNumber = text(cells[rec.col.po])
    else if (text(cells[rec.col.po])) poNumber = text(cells[rec.col.po])
    const part = text(cells[rec.col.part])
    const qty = num(cells[rec.col.qty])
    const uom = rec.col.uom === -1 ? '' : text(cells[rec.col.uom])
    const out = { cells, po: poNumber, part, qty, uom, flags: [] }
    if (!part) return out // a header-only row with no product
    counts.lines++

    const matches = index.get(`${norm(poNumber)}|${norm(part)}`)
    if (!matches) {
      counts.noMatch++
      out.flags.push('No PO price found')
      return out
    }
    const line = matches[0]
    if (matches.length > 1) out.flags.push(`${matches.length} PO lines for this part — used the first`)
    Object.assign(out, { currency: line.currency, poPrice: line.price, poUom: line.uom })

    const { factor, converted } = unitFactor(uom, line.uom)
    if (factor == null) {
      counts.unitMismatch++
      out.flags.push(`Unit mismatch (received ${uom || '?'}, PO ${line.uom}) — not priced`)
      return out
    }
    if (converted) {
      counts.unitConverted++
      out.flags.push(`Unit converted: PO price per ${line.uom} → per ${uom}`)
    }
    out.unitPrice = line.price * factor
    out.value = round(qty * out.unitPrice)
    byCurrency[line.currency] = byCurrency[line.currency] || { value: 0, usd: 0, lines: 0 }
    byCurrency[line.currency].value += out.value
    byCurrency[line.currency].lines++

    const rate = rateFor(line.currency)
    if (!rate) {
      counts.noRate++
      out.flags.push(`No exchange rate for ${line.currency}`)
      return out
    }
    out.rate = rate
    out.usd = round(out.value / rate)
    byCurrency[line.currency].usd += out.usd
    totalUsd += out.usd
    counts.priced++
    return out
  })

  return {
    receiptHeader: rec.header,
    lines,
    currencies,
    missingRates,
    counts,
    byCurrency: Object.fromEntries(Object.entries(byCurrency).map(([c, v]) => [c, { lines: v.lines, value: round(v.value), usd: round(v.usd), rate: rateFor(c) }])),
    totalUsd: round(totalUsd),
  }
}

export const EXTRA_HEADERS = ['PO Currency', 'PO Unit Price', 'PO Unit', 'Unit Price (per received unit)',
  'GR Value (PO currency)', `Exchange Rate (1 ${REPORT_CURRENCY} =)`, `GR Value (${REPORT_CURRENCY})`, 'Remarks']

// The receipts sheet exactly as uploaded (original cells, so dates/quantities keep their
// formats) + the value columns, a total row, and a Rates sheet showing what was used.
export function buildGrValueWorkbook(report) {
  const money = z => v => (v == null ? null : { t: 'n', v, z })
  const m2 = money('#,##0.00')
  const m4 = money('#,##0.0000')
  const s = v => (v ? { t: 's', v } : null)

  const header = [...report.receiptHeader, ...EXTRA_HEADERS]
  const data = report.lines.map(l => [
    ...l.cells.map(c => (c ? { t: c.t, v: c.v, ...(c.z ? { z: c.z } : {}) } : null)),
    s(l.currency), m4(l.poPrice), s(l.poUom), m4(l.unitPrice), m2(l.value), m4(l.rate), m2(l.usd), s(l.flags.join('; ')),
  ])
  const totalRow = Array(header.length).fill(null)
  totalRow[header.length - 3] = { t: 's', v: `Total (${REPORT_CURRENCY})` }
  totalRow[header.length - 2] = m2(report.totalUsd)

  const ws = xlsx.utils.aoa_to_sheet([header, ...data, [], totalRow])
  ws['!cols'] = header.map((h, i) => ({
    wch: Math.min(50, Math.max(10, h.length, ...data.map(r => String(r[i]?.v ?? '').length)) + 2),
  }))

  const rateRows = [['Currency', `Rate (1 ${REPORT_CURRENCY} =)`, 'Lines priced', 'GR Value (PO currency)', `GR Value (${REPORT_CURRENCY})`],
    ...Object.entries(report.byCurrency).map(([c, v]) => [c, v.rate ?? 'missing', v.lines, v.value, v.usd])]
  const rates = xlsx.utils.aoa_to_sheet(rateRows)
  rates['!cols'] = rateRows[0].map(h => ({ wch: h.length + 4 }))

  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'GR Value')
  xlsx.utils.book_append_sheet(wb, rates, 'Rates')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
