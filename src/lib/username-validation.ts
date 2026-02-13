export const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'support',
  'system',
  'tophuman',
  'moderator',
  'mod',
  'staff',
  'help',
  'info',
  'contact',
  'root',
  'null',
  'undefined',
]

/** Matches auto-generated usernames from the DB trigger (e.g. player_a1b2c3d4) */
export const AUTO_USERNAME_PATTERN = /^player_[a-f0-9]{8}$/

export function validateUsername(username: string): { valid: boolean; message?: string } {
  if (!username) {
    return { valid: false, message: 'Username is required' }
  }

  if (username.length < 3) {
    return { valid: false, message: 'Username must be at least 3 characters' }
  }

  if (username.length > 20) {
    return { valid: false, message: 'Username must be 20 characters or less' }
  }

  if (!/^[a-zA-Z]/.test(username)) {
    return { valid: false, message: 'Username must start with a letter' }
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(username)) {
    return { valid: false, message: 'Username can only contain letters, numbers, and underscores' }
  }

  if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
    return { valid: false, message: 'This username is reserved' }
  }

  if (AUTO_USERNAME_PATTERN.test(username.toLowerCase())) {
    return { valid: false, message: 'This username format is reserved' }
  }

  return { valid: true }
}
