/**
 * Join URI parts safely, ensuring no duplicate slashes and preventing path traversal.
 */
function joinUri(...parts) {
  // 1. Join everything together to form a complete URI string
  const combined = parts.map((p, i) => (i === 0 ? p.replace(/\/$/, '') : p.replace(/^\//, ''))).join('/')

  // 2. Separate the protocol/authority from the path
  const protocolMatch = combined.match(/^([^:]+:\/\/[^/]+)(.*)$/)

  let base = ''
  let pathString = combined

  if (protocolMatch) {
    base = protocolMatch[1]
    pathString = protocolMatch[2]
  }

  // 3. Normalize the path segments safely
  const segments = pathString.split('/')
  const stack = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]

    // Skip empty segments and single dots
    if (segment === '' || segment === '.') {
      continue
    }

    // TRAVERSAL BLOCK: If '..', do NOT pop from the stack.
    // We just skip it entirely so it cannot move backward.
    if (segment === '..') {
      continue
    }

    // Only allow forward progression
    stack.push(segment)
  }

  // 4. Reconstruct the final URI
  return base + '/' + stack.join('/')
}

module.exports = { joinUri }
