/** Parse JSON with the comments and trailing commas accepted by JSONC files. */
export function parseJsonc(source) {
  let withoutComments = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (inString) {
      withoutComments += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      withoutComments += char
    } else if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      withoutComments += '\n'
    } else if (char === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 1
      withoutComments += ' '
    } else {
      withoutComments += char
    }
  }

  let withoutTrailingCommas = ''
  inString = false
  escaped = false
  for (let index = 0; index < withoutComments.length; index += 1) {
    const char = withoutComments[index]
    if (inString) {
      withoutTrailingCommas += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      withoutTrailingCommas += char
      continue
    }
    if (char === ',') {
      let lookahead = index + 1
      while (/\s/.test(withoutComments[lookahead] ?? '')) lookahead += 1
      if (withoutComments[lookahead] === '}' || withoutComments[lookahead] === ']') continue
    }
    withoutTrailingCommas += char
  }

  return JSON.parse(withoutTrailingCommas)
}
