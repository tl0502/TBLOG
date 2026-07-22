export interface AdminContentCounts {
  publishedArticles: number
  drafts: number
  categories: number
  tags: number
  pendingComments: number
}

export interface AdminReadRepository {
  getContentCounts(): Promise<AdminContentCounts>
}
