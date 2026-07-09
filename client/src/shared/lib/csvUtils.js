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
