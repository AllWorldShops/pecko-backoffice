import xlsx from 'xlsx'
import { buildGrValueReport, buildGrValueWorkbook, unitFactor, metresPerUnit, EXTRA_HEADERS } from './grValue.js'

const REC_HEADER = ['Reference', 'Contact', 'Status', 'Source Document', 'Date of Transfer', 'Packing Slip / DO No',
  'Operations/Product/Internal Reference', 'Operations/Product/Name', 'Operations/Quantity', 'Operations/Product/Unit of Measure']
const PO_HEADER = ['Order Reference', 'Pecko Part Number', 'Customer Part No', 'Manufacturer', 'Currency', 'Unit Price', 'Quantity', 'Unit of Measure']
const DATE = { t: 'n', v: 46343.4388, z: 'yyyy\\-mm\\-dd hh:mm:ss' }

function buffer(header, rows) {
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([header, ...rows]), 'Sheet1')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
const rec = (ref, po, part, qty, uom) => [ref, 'Supplier', 'Done', po, DATE, 'DO/1', part, 'name', qty, uom]
const more = (part, qty, uom) => ['', '', '', '', '', '', part, 'name', qty, uom]

const RECEIPTS = buffer(REC_HEADER, [
  rec('REC/1', 'POM/1', 'P-USD', 10, 'pcs'),
  more('P-MYR', 100, 'pcs'), //                  continuation row → still POM/1
  rec('REC/2', 'POM/2', 'CABLE-ROLL', 40, 'm'), // PO priced per 20 m roll
  more('CABLE-FT', 10, 'm'), //                   PO priced per ft
  more('BOX', 2, 'set'), //                       PO in pcs → can't convert
  rec('REC/3', 'POM/9', 'P-USD', 5, 'pcs'), //    PO not in the PO file
])
const PO_LINES = buffer(PO_HEADER, [
  ['POM/1', 'P-USD', '', '', 'USD', 2.5, 10, 'pcs'],
  ['POM/1', '', '', '', 'USD', 0, 0, ''], // note/section line
  ['POM/1', 'P-MYR', '', '', 'MYR', 4.4, 100, 'Units'],
  ['POM/2', 'CABLE-ROLL', '', '', 'MYR', 100, 2, 'r20 - Roll - 20m'],
  ['POM/2', 'CABLE-FT', '', '', 'USD', 0.3048, 40, 'ft'],
  ['POM/2', 'BOX', '', '', 'USD', 7, 2, 'pcs'],
])

test('unit helpers: plain, packaged and imperial lengths; incompatible units', () => {
  expect(metresPerUnit('r1h=100 MTR')).toBe(100)
  expect(metresPerUnit('r20 - Roll - 20m')).toBe(20)
  expect(metresPerUnit('ft')).toBe(0.3048)
  expect(metresPerUnit('pcs')).toBeNull()
  expect(unitFactor('pcs', 'Units')).toEqual({ factor: 1, converted: false })
  expect(unitFactor('m', 'r20 - Roll - 20m')).toEqual({ factor: 1 / 20, converted: true })
  expect(unitFactor('set', 'pcs')).toEqual({ factor: null })
})

test('matches on PO + part (carrying the PO down continuation rows), converts units and currency', () => {
  const r = buildGrValueReport(RECEIPTS, PO_LINES, { MYR: 4.4 })
  const byPart = Object.fromEntries(r.lines.map(l => [`${l.po} ${l.part}`, l]))

  expect(r.currencies).toEqual(['MYR', 'USD'])
  expect(r.missingRates).toEqual([])
  expect(byPart['POM/1 P-USD']).toMatchObject({ value: 25, usd: 25, rate: 1, flags: [] })
  expect(byPart['POM/1 P-MYR']).toMatchObject({ value: 440, usd: 100, rate: 4.4 })
  // 40 m from a MYR 100 / 20 m roll = MYR 200 = USD 45.45
  expect(byPart['POM/2 CABLE-ROLL']).toMatchObject({ unitPrice: 5, value: 200, usd: 45.45 })
  expect(byPart['POM/2 CABLE-ROLL'].flags[0]).toMatch(/Unit converted/)
  // 10 m at USD 0.3048/ft = USD 10
  expect(byPart['POM/2 CABLE-FT']).toMatchObject({ value: 10, usd: 10 })
  expect(byPart['POM/2 BOX'].usd).toBeUndefined()
  expect(byPart['POM/2 BOX'].flags[0]).toMatch(/Unit mismatch/)
  expect(byPart['POM/9 P-USD'].flags).toEqual(['No PO price found'])

  expect(r.counts).toEqual({ lines: 6, priced: 4, noMatch: 1, unitConverted: 2, unitMismatch: 1, noRate: 0 })
  expect(r.totalUsd).toBe(180.45)
  expect(r.byCurrency.MYR).toEqual({ lines: 2, value: 640, usd: 145.45, rate: 4.4 })
})

test('without a rate the MYR lines are valued in MYR but left out of the USD total', () => {
  const r = buildGrValueReport(RECEIPTS, PO_LINES, {})
  expect(r.missingRates).toEqual(['MYR'])
  expect(r.counts.noRate).toBe(2)
  expect(r.totalUsd).toBe(35)
})

test('workbook keeps the receipt columns as uploaded and appends value columns + total', () => {
  const r = buildGrValueReport(RECEIPTS, PO_LINES, { MYR: 4.4 })
  const wb = xlsx.read(buildGrValueWorkbook(r), { cellNF: true })
  const rows = xlsx.utils.sheet_to_json(wb.Sheets['GR Value'], { header: 1, defval: '' })
  expect(rows[0]).toEqual([...REC_HEADER, ...EXTRA_HEADERS])
  expect(wb.Sheets['GR Value'].E2).toMatchObject({ t: 'n', v: 46343.4388 }) // date untouched
  expect(rows[2].slice(10, 17)).toEqual(['MYR', 4.4, 'Units', 4.4, 440, 4.4, 100])
  expect(rows.at(-1).slice(-3, -1)).toEqual(['Total (USD)', 180.45])
  expect(wb.SheetNames).toEqual(['GR Value', 'Rates'])
})

test('clear errors when the files are swapped or wrong', () => {
  expect(() => buildGrValueReport(PO_LINES, RECEIPTS)).toThrow(/receipts file is missing columns: "Source Document"/)
  expect(() => buildGrValueReport(RECEIPTS, RECEIPTS)).toThrow(/PO lines file is missing columns: "Order Reference"/)
})
