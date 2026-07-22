/**
 * The system "未分类" (Uncategorized) category.
 *
 * Seeded by migration `0002_seed_uncategorized`. Every article references a real
 * category: posts saved without an explicit category fall back to this id, and
 * deleting any other category reassigns its posts here. It is an `is_system`
 * category and cannot be deleted.
 */
export const UNCATEGORIZED_CATEGORY_ID = 'cat-uncategorized'
export const UNCATEGORIZED_SLUG = 'uncategorized'
export const UNCATEGORIZED_NAME = '未分类'
