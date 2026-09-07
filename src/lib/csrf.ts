import crypto from 'crypto';

let cachedSecret: string | null = null;

function getCSRFSecret(): string {
  // Return cached value if available
  if (cachedSecret) return cachedSecret;

  // Try environment variable first
  const envSecret = process.env.CSRF_SECRET;
  if (envSecret) {
    cachedSecret = envSecret;
    return envSecret;
  }

  // Production requires explicit secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL: CSRF_SECRET environment variable is required in production. ' +
      'Generate with: openssl rand -hex 32'
    );
  }

  // Development only: generate a temporary secret
  cachedSecret = crypto.randomBytes(32).toString('hex');
  return cachedSecret;
}

export function generateCSRFToken(): string {
  // Generate a random token
  const token = crypto.randomBytes(32).toString('hex');
  // Sign it with secret to prevent tampering
  const signature = crypto
    .createHmac('sha256', getCSRFSecret())
    .update(token)
    .digest('hex');
  return `${token}.${signature}`;
}

export function verifyCSRFToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [tokenPart, signature] = parts;

  // Recreate signature
  const expectedSignature = crypto
    .createHmac('sha256', getCSRFSecret())
    .update(tokenPart)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
