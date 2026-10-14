import xlsx from 'xlsx'
import { summarizeMoStatus, buildMoWorkbook } from './moStatus.js'

const HEADER = ['Reference', 'Product', 'Part Number', 'Source', 'Description', 'Project',
  'Quantity To Produce', 'State', 'Work Orders/Work Order', 'Work Orders/Work Center', 'Work Orders/Status']

// Mirrors the Odoo export: MO header row (A–H + its first WO) then WO-only continuation rows.
const mo = (ref, wos) => wos.map(([wo, center, status], i) =>
  i === 0
    ? [ref, `P-${ref}`, `PN-${ref}`, '', 'desc', '', 5, 'In Progress', wo, center, status]
    : ['', '', '', '', '', '', '', '', wo, center, status])

function buffer(rows) {
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([HEADER, ...rows]), 'Sheet1')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

test('one row per MO, status = highest-priority work order, I–J from that work order', () => {
  const { rows, counts } = summarizeMoStatus(buffer([
    ...mo('MO/1', [['Kitting', 'K1', 'Finished'], ['OQC', 'QC', 'Waiting for components'], ['Packing', 'PK', 'Waiting for another WO']]),
    ['', '', '', '', '', '', '', '', '', '', ''], // blank spacer must be ignored
    ...mo('MO/2', [['Cut', 'C1', 'Waiting for another WO'], ['Crimp', 'CR', 'Ready'], ['Test', 'T', 'In Progress']]),
    ...mo('MO/3', [['A', 'a', 'Finished'], ['B', 'b', 'Finished']]),
    ...mo('MO/4', [['A', 'a', 'Ready'], ['B', 'b', 'Ready']]), // tie → first in sequence wins
  ]))

  expect(rows.map(r => [r[0], r[8], r[9], r[10]])).toEqual([
    ['MO/1', 'OQC', 'QC', 'Waiting for components'],
    ['MO/2', 'Test', 'T', 'In Progress'],
    ['MO/3', 'A', 'a', 'Finished'],
    ['MO/4', 'A', 'a', 'Ready'],
  ])
  expect(rows[0].slice(0, 8)).toEqual(['MO/1', 'P-MO/1', 'PN-MO/1', '', 'desc', '', 5, 'In Progress'])
  expect(counts).toEqual({ 'Waiting for components': 1, 'In Progress': 1, Finished: 1, Ready: 1 })
})

test('"Waiting for another MO" alias ranks with WO; unknown statuses rank last and are reported', () => {
  const { rows, unknownStatuses } = summarizeMoStatus(buffer([
    ...mo('MO/1', [['A', 'a', 'Cancelled'], ['B', 'b', 'Waiting for another MO']]),
    ...mo('MO/2', [['A', 'a', 'Cancelled']]),
  ]))
  expect(rows.map(r => r[10])).toEqual(['Waiting for another MO', 'Cancelled'])
  expect(unknownStatuses).toEqual(['Cancelled'])
})

test('round-trips through the generated workbook', () => {
  const { header, rows } = summarizeMoStatus(buffer(mo('MO/1', [['A', 'a', 'Ready']])))
  const back = xlsx.utils.sheet_to_json(xlsx.read(buildMoWorkbook(header, rows)).Sheets['MO Status'], { header: 1 })
  expect(back).toEqual([HEADER, rows[0]])
})

test('rejects a sheet with no MOs', () => {
  expect(() => summarizeMoStatus(buffer([['', '', '', '', '', '', '', '', 'A', 'a', 'Ready']]))).toThrow(/No Manufacturing Orders/)
})
