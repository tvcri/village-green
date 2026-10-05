import { formatLocalDateTime } from './dateUtils.js'

export function withLocalDateTimeColumns(rows, keys) {
  return rows.map(row => {
    const formatted = { ...row }
    for (const key of keys) {
      if (key in formatted) formatted[key] = formatLocalDateTime(formatted[key])
    }
    return formatted
  })
}

export function toCsv(rows, columns) {
  if (!rows || rows.length === 0) {
    return columns.map(col => col.header).join(',')
  }

  const headers = columns.map(col => escapeCsvValue(col.header)).join(',')
  const lines = rows.map(row => {
    return columns
      .map(col => {
        const value = row[col.key]
        return escapeCsvValue(value === null || value === undefined ? '' : String(value))
      })
      .join(',')
  })

  return [headers, ...lines].join('\n')
}

function escapeCsvValue(value) {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

// Number format that renders a 1/0 flag as a checkmark in Google Sheets while
// keeping the underlying value numeric, so SUM() still counts the column.
// Ignored by toCsv(), which reads only `header` and `key`.
const FLAG_NUMBER_FORMAT = { type: 'NUMBER', pattern: '[=1]"✓";[=0]"";General' }

/**
 * Build one flag column per distinct value found in a multi-value field.
 *
 * Mirrors the export to the table state that produced it: the column set is
 * derived from the rows passed in, so a filtered export carries only the
 * values its rows actually hold.
 *
 * Note: centering these columns is not possible here. spreadsheets.create
 * honors numberFormat and textFormat in rowData but drops
 * horizontalAlignment, which needs an explicit `fields` mask and so a
 * separate batchUpdate/repeatCell call after the sheet exists.
 *
 * @param {Array<object>} rows - the rows being exported
 * @param {string} key - row property holding an array of values
 * @returns {{columns: Array<{header, key, numberFormat}>, values: string[]}}
 */
export function buildFlagColumns(rows, key) {
  const distinct = new Set()
  for (const row of rows ?? []) {
    for (const value of row?.[key] ?? []) distinct.add(value)
  }
  const values = [...distinct].sort((a, b) => a.localeCompare(b))
  return {
    values,
    columns: values.map(value => ({
      header: value,
      key: `${key}:${value}`,
      numberFormat: FLAG_NUMBER_FORMAT
    }))
  }
}

/**
 * A single boolean column: the row value is 1/0, shown as a checkmark in Sheets.
 */
export function flagColumn(header, key) {
  return { header, key, numberFormat: FLAG_NUMBER_FORMAT }
}

/**
 * Add a 1/0 property per flag column to a row, keyed to match buildFlagColumns().
 */
export function withFlagValues(row, key, values) {
  const held = new Set(row?.[key] ?? [])
  const flags = {}
  for (const value of values) flags[`${key}:${value}`] = held.has(value) ? 1 : 0
  return flags
}
