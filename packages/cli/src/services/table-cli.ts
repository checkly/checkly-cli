import chalk from 'chalk'

export class TableCli<T extends Record<string, any>> {
  private drawSeparator (columnCount: number): string {
    const separator = Array(columnCount)
      .fill('-'.repeat(30))
      .join(' | ')
    return `      ${chalk.grey(separator)}`
  }

  private drawTableRow (row: T, columns: Array<keyof T>, ind: number): string[] {
    const output: string[] = []
    const rowData = columns.map((col) => String(row[col]).padEnd(30))
    output.push(
      `      ${
        ind % 2 ? chalk.hex('#a1a1a1')(rowData[0]) : chalk.hex('#ffffff')(rowData[0])
      } ${chalk.grey('|')} ${rowData
        .slice(1)
        .map((col, i) =>
          i === rowData.length - 2 ? chalk.green(col) : chalk.grey(col),
        )
        .join(` ${chalk.grey('|')} `)}`,
    )
    output.push(this.drawSeparator(columns.length))
    return output
  }

  public drawTable (
    rows: T[],
    columns: Array<keyof T>,
    columnHeaders: string[],
  ): string[] {
    const output: string[] = []

    // Header
    output.push(
      `      ${columnHeaders
        .map((header) => header.padEnd(30))
        .join(` ${chalk.grey('|')} `)}`,
    )

    // separator
    output.push(this.drawSeparator(columnHeaders.length))

    // Rows
    rows.forEach((row, index) => {
      output.push(...this.drawTableRow(row, columns, index))
    })

    return output
  }
}
