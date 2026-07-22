export const processingStateValues = ['pending', 'processed', 'failed'] as const

export type ProcessingState = (typeof processingStateValues)[number]
