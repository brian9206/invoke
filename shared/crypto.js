'use strict'

const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

/**
 * Get the encryption key from environment variable.
 * Accepts hex (64 chars) or base64 (44 chars) encoded 32-byte key.
 */
function getKey() {
  const raw = process.env.SQL_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('SQL_ENCRYPTION_KEY environment variable is required')
  }
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  const buf = Buffer.from(raw, 'base64')
  if (buf.length === 32) {
    return buf
  }
  throw new Error('SQL_ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44 base64 chars)')
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * @param {string} plaintext
 * @returns {string} JSON string containing base64-encoded iv, tag, and ciphertext
 */
function encrypt(plaintext) {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64')
  })
}

/**
 * Decrypt ciphertext encrypted with encrypt().
 * @param {string} encryptedJson - JSON string from encrypt()
 * @returns {string} Original plaintext
 */
function decrypt(encryptedJson) {
  const key = getKey()
  const { iv, tag, ciphertext } = JSON.parse(encryptedJson)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

module.exports = { encrypt, decrypt }
