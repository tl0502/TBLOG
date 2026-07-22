import { readGeneratedMigrationSql } from '../test-utils/migrations'

export { readGeneratedMigrationSql }

export function expectSqlToContainIndex(sql: string, indexName: string): void {
  const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase()
  const normalizedIndexName = indexName.toLowerCase()

  expect(normalizedSql).toMatch(
    new RegExp(`create\\s+(unique\\s+)?index\\s+[\`"]?${normalizedIndexName}[\`"]?`)
  )
}

export function expectSqlToContainTable(sql: string, tableName: string): void {
  const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase()
  const normalizedTableName = tableName.toLowerCase()

  expect(normalizedSql).toMatch(
    new RegExp(`create\\s+table\\s+[\`"]?${normalizedTableName}[\`"]?`)
  )
}
