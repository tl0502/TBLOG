import { getRequestHeader, readMultipartFormData, setResponseStatus } from 'h3'
import { DomainError } from '../../../../domain/domain-error'
import {
  MAX_MEDIA_ALT_TEXT_BYTES,
  MAX_MEDIA_MULTIPART_BYTES
} from '../../../../services/media-service'
import { createMediaServiceForEvent } from '../../../../services/media-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'

function validationError(message: string) {
  return new DomainError('validation_failed', message, 422)
}

function parseContentLength(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const length = Number(value)
  return Number.isSafeInteger(length) && length > 0 ? length : null
}

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const contentLength = parseContentLength(getRequestHeader(event, 'content-length'))
    // h3 buffers multipart bodies. Requiring a bounded Content-Length rejects chunked/unknown-size
    // uploads before buffering and keeps memory use within the configured media limit.
    if (contentLength === null) throw validationError('A bounded Content-Length is required')
    if (contentLength > MAX_MEDIA_MULTIPART_BYTES) throw validationError('Media upload is too large')

    const parts = await readMultipartFormData(event)
    if (!parts || parts.length === 0 || parts.length > 2) {
      throw validationError('Media upload must contain only one file and optional alt text')
    }
    if (parts.some((part) => part.name !== 'file' && part.name !== 'altText')) {
      throw validationError('Unexpected media upload field')
    }
    if (parts.some((part) => part.name === 'altText' && part.filename)) {
      throw validationError('Image alt text must be a text field')
    }
    const files = parts.filter((part) => part.name === 'file')
    const alternatives = parts.filter((part) => part.name === 'altText' && !part.filename)
    if (files.length !== 1) throw validationError('One image file is required')
    if (alternatives.length > 1) throw validationError('At most one alt text field is allowed')
    const file = files[0]
    const alt = alternatives[0]
    if (!file?.filename || !file.type) {
      throw validationError('One image file is required')
    }
    if (alt && alt.data.byteLength > MAX_MEDIA_ALT_TEXT_BYTES) throw validationError('Image alt text is too long')

    let altText: string | undefined
    if (alt) {
      try {
        altText = new TextDecoder('utf-8', { fatal: true }).decode(alt.data)
      } catch {
        throw validationError('Image alt text must be valid UTF-8')
      }
    }

    const result = await createMediaServiceForEvent(event).upload(
      {
        filename: file.filename,
        contentType: file.type,
        bytes: file.data,
        altText
      },
      current.permissions
    )
    setResponseStatus(event, 201)
    return ok(result)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
