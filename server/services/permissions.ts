export const administratorPermissions = [
  'post:*',
  'comment:*',
  'settings:*',
  'integration:*',
  'user:*',
  'maintenance:*'
] as const

export type Permission = (typeof administratorPermissions)[number]

export function administratorHasPermission(permission: Permission): boolean {
  return administratorPermissions.includes(permission)
}
