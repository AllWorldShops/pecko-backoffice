import xlsx from 'xlsx'
import { summarizeMoStatus, buildMoWorkbook } from './moStatus.js'

// Current Odoo export layout (A–Q): Production Cell comes first, Reference is column C.
const HEADER = ['Production Cell', 'Order Sequence', 'Reference', 'Source', 'Product', 'Part Number',
  'Description', 'Project', 'Product Unit of Measure', 'Quantity To Produce', 'State', 'Store Start Date',
  'Start Date P1', 'Start Date P2', 'Work Orders/Work Order', 'Work Orders/Work Center', 'Work Orders/Status']
const DATE = { t: 'n', v: 46223, z: 'yyyy\\-mm\\-dd' } // 2026-07-20 as Odoo writes it
const QTY = { t: 'n', v: 10, z: '#,##0.00' }

// MO header row fills A–N + its first WO in O–Q; continuation rows fill only O–Q.
const mo = (ref, wos) => wos.map(([wo, center, status], i) =>
  i === 0
    ? ['CELL 4', '', ref, 'PM/SO/1', `P-${ref}`, `PN-${ref}`, 'desc', 'AMAT', 'pcs', QTY, 'In Progress', DATE, DATE, DATE, wo, center, status]
    : [...Array(14).fill(''), wo, center, status])

function buffer(rows, header = HEADER) {
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([header, ...rows]), 'Sheet1')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

test('one row per MO (split on Reference, not column A); output = A–N + O–Q from the winning WO line', () => {
  const { header, rows, counts, statusCol, workOrderLines } = summarizeMoStatus(buffer([
    ...mo('MO/1', [['Kitting', 'K1', 'Finished'], ['Crimp', 'CR', 'In Progress'], ['Pack', 'PK', 'Waiting for another WO']]),
    Array(17).fill(''), // blank spacer must be ignored
    ...mo('MO/2', [['Cut', 'C1', 'Waiting for another WO'], ['OQC', 'QC', 'Waiting for components'], ['Test', 'T', 'Ready']]),
    ...mo('MO/3', [['A', 'a', 'Finished'], ['B', 'b', 'Finished']]),
    ...mo('MO/4', [['A', 'a', 'Ready'], ['B', 'b', 'Ready']]), // tie → first in sequence wins
  ]))

  expect(header).toEqual(HEADER)
  expect(statusCol).toBe(16)
  expect(workOrderLines).toBe(10)
  expect(rows.map(r => [r[2], ...r.slice(14)])).toEqual([
    ['MO/1', 'Crimp', 'CR', 'In Progress'],
    ['MO/2', 'Test', 'T', 'Ready'],
    ['MO/3', 'A', 'a', 'Finished'],
    ['MO/4', 'A', 'a', 'Ready'],
  ])
  // A–N exactly as on the MO's header row, with dates/quantities shown as Excel formats them.
  expect(rows[0]).toEqual(['CELL 4', '', 'MO/1', 'PM/SO/1', 'P-MO/1', 'PN-MO/1', 'desc', 'AMAT',
    'pcs', '10.00', 'In Progress', '2026-07-20', '2026-07-20', '2026-07-20', 'Crimp', 'CR', 'In Progress'])
  expect(counts).toEqual({ 'In Progress': 1, Ready: 2, Finished: 1 })
})

test('download keeps dates as real dates and quantities as numbers with their format', () => {
  const { header, cellRows } = summarizeMoStatus(buffer(mo('MO/1', [['A', 'a', 'Ready']])))
  const ws = xlsx.read(buildMoWorkbook(header, cellRows), { cellNF: true }).Sheets['MO Status']
  expect(xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' })[0]).toEqual(HEADER)
  expect(ws['!ref']).toBe('A1:Q2')
  expect(ws.J2).toMatchObject({ t: 'n', v: 10, z: '#,##0.00' })
  expect(ws.L2).toMatchObject({ t: 'n', v: 46223, w: '2026-07-20' })
  expect(ws.C2.v).toBe('MO/1')
  expect([ws.O2.v, ws.P2.v, ws.Q2.v]).toEqual(['A', 'a', 'Ready'])
})

test('still reads the older A–K layout (Reference in column A)', () => {
  const old = ['Reference', 'Product', 'State', 'Work Orders/Work Order', 'Work Orders/Work Center', 'Work Orders/Status']
  const { rows } = summarizeMoStatus(buffer([
    ['MO/9', 'P', 'In Progress', 'Kit', 'K', 'Finished'],
    ['', '', '', 'OQC', 'QC', 'Waiting for components'],
  ], old))
  expect(rows).toEqual([['MO/9', 'P', 'In Progress', 'OQC', 'QC', 'Waiting for components']])
})

test('"Waiting for another MO" alias ranks with WO; unknown statuses rank last and are reported', () => {
  const { rows, unknownStatuses } = summarizeMoStatus(buffer([
    ...mo('MO/1', [['A', 'a', 'Cancelled'], ['B', 'b', 'Waiting for another MO']]),
    ...mo('MO/2', [['A', 'a', 'Cancelled']]),
  ]))
  expect(rows.map(r => r[16])).toEqual(['Waiting for another MO', 'Cancelled'])
  expect(unknownStatuses).toEqual(['Cancelled'])
})

test('clear errors for a wrong sheet or one with no MOs', () => {
  expect(() => summarizeMoStatus(buffer([['x', 'y']], ['Foo', 'Bar']))).toThrow(/Missing required columns: "Reference" and "Work Orders\/Status"/)
  expect(() => summarizeMoStatus(buffer([[...Array(14).fill(''), 'A', 'a', 'Ready']]))).toThrow(/No Manufacturing Orders/)
})
