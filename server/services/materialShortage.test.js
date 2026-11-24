import xlsx from 'xlsx'
import { buildShortageReport, buildShortageWorkbook, compactReport } from './materialShortage.js'

const MO_HEADER = ['Reference', 'Source', 'Customer PO No', 'Product', 'Part Number', 'Description', 'Quantity To Produce', 'State']
const TR_HEADER = ['Date of Transfer', 'Contact', 'Reference', 'Source Document', 'Customer PO No', 'Stock Moves/Position',
  'Stock Moves/Product/Internal Reference', 'Stock Moves/Product/MPN/Customer/Supplier Part No', 'Stock Moves/Product/Description',
  'Stock Moves/Demand', 'Stock Moves/Quantity', 'Stock Moves/Product/Unit of Measure']

function buffer(header, rows) {
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([header, ...rows]), 'Sheet1')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
const pick = (ref, source, pos, part, demand, reserved) => ['', 'Pecko', ref, source, '', pos, part, `C-${part}`, `desc ${part}`, demand, reserved, 'pcs']
const more = (pos, part, demand, reserved) => ['', '', '', '', '', pos, part, `C-${part}`, `desc ${part}`, demand, reserved, 'pcs']

const MOS = buffer(MO_HEADER, [
  ['PM/MO/1', 'PM/SO/1', 'PO-1', 'FG-1', 'CUST-1', 'Harness 1', 4, 'Confirmed'],
  ['PM/MO/2', 'PM/SO/2', '', 'FG-2', 'CUST-2', 'Harness 2', 2, 'In Progress'],
  ['PM/MO/3', '', '', 'FG-3', 'CUST-3', 'Harness 3', 1, 'Confirmed'], // no transfer lines
])
const TRANSFERS = buffer(TR_HEADER, [
  pick('PICK/1', 'PM/MO/1', 10, 'A', 10, 4), //            short 6
  more(20, 'B', 5, 5), //                                    fully reserved (continuation → MO/1)
  more(30, 'C', 2, 3), //                                    over-reserved → shortage 0, not negative
  pick('PICK/2', 'OP/0007,PM/MO/2', 10, 'B', 6, 6), //    combined origin → MO/2, fully reserved
  pick('PICK/9', 'Return of PICK/1', 0, 'A', 3, 0), //    return, not an MO → ignored
  pick('PICK/8', 'PM/MO/99', 10, 'A', 1, 0), //           MO not in the MO report → counted, ignored
  pick('PICK/3', 'PM/MO/2', 20, 'A', 1, 0), //            second transfer for MO/2 → short 1
])

test('joins transfer lines to MOs (continuation rows, combined origins) and computes shortage', () => {
  const r = buildShortageReport(MOS, TRANSFERS)
  const [mo1, mo2, mo3] = r.mos

  expect(mo1).toMatchObject({ mo: 'PM/MO/1', product: 'FG-1', custPart: 'CUST-1', status: 'short', shortLines: 1 })
  expect(mo1.lines.map(l => [l.reference, l.part, l.demand, l.reserved, l.shortage])).toEqual([
    ['PICK/1', 'A', 10, 4, 6], ['PICK/1', 'B', 5, 5, 0], ['PICK/1', 'C', 2, 3, 0],
  ])
  expect(mo2.lines.map(l => [l.reference, l.part, l.shortage])).toEqual([['PICK/2', 'B', 0], ['PICK/3', 'A', 1]])
  expect(mo2.status).toBe('short')
  expect(mo3).toMatchObject({ status: 'no-lines', lines: [] })

  expect(r.counts).toEqual({ mos: 3, shortMos: 2, reservedMos: 0, noLinesMos: 1, lines: 5, shortLines: 2 })
  expect(r.unknownMos).toBe(1)
  // only short parts listed; demand/reserved totalled over all of the part's lines
  expect(r.parts).toEqual([
    { part: 'A', custPart: 'C-A', description: 'desc A', uom: 'pcs', demand: 11, reserved: 4, shortage: 7, mos: ['PM/MO/1', 'PM/MO/2'] },
  ])
})

test('compact payload points lines at shared component + ref lists', () => {
  const c = compactReport(buildShortageReport(MOS, TRANSFERS))
  const [, , , , product, , , qty, status, shortLines, lines] = c.mos[0]
  expect([product, qty, status, shortLines]).toEqual(['FG-1', 4, 'short', 1])
  const [compIdx, refIdx, position, demand, reserved] = lines[0]
  expect([c.components[compIdx][0], c.refs[refIdx], position, demand, reserved]).toEqual(['A', 'PICK/1', '10', 10, 4])
  expect(c.shortParts).toEqual([[compIdx, 11, 4, 7, 2]])
})

test('workbook: one row per component line + a row for MOs without lines; Parts Short sheet', async () => {
  const wb = xlsx.read(await buildShortageWorkbook(buildShortageReport(MOS, TRANSFERS)))
  expect(wb.SheetNames).toEqual(['Material Shortage', 'Parts Short'])
  const rows = xlsx.utils.sheet_to_json(wb.Sheets['Material Shortage'], { header: 1, defval: '' })
  expect(rows).toHaveLength(1 + 5 + 1)
  expect(rows[1].slice(0, 1).concat(rows[1].slice(10))).toEqual(['PM/MO/1', 'A', 'C-A', 'desc A', 'pcs', 10, 4, 6, 'SHORT'])
  expect(rows[6].at(-1)).toBe('No transfer lines')
  const parts = xlsx.utils.sheet_to_json(wb.Sheets['Parts Short'], { header: 1, defval: '' })
  expect(parts[1]).toEqual(['A', 'C-A', 'desc A', 'pcs', 11, 4, 7, 2, 'PM/MO/1, PM/MO/2'])
})

test('clear error when Demand is missing or the files are swapped', () => {
  const noDemand = buffer(TR_HEADER.filter(h => h !== 'Stock Moves/Demand'), [])
  expect(() => buildShortageReport(MOS, noDemand)).toThrow(/internal transfer file is missing column: "Stock Moves\/Demand"/)
  expect(() => buildShortageReport(TRANSFERS, MOS)).toThrow(/MO report file is missing column: "Product"/)
})
