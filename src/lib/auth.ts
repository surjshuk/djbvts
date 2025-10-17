// src/lib/auth.ts
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET!;
if (!SECRET) throw new Error("Missing JWT_SECRET");

// Type of data stored in the token
export interface JwtClaims {
  sub: string; // user id
  role: "USER" | "ADMIN";
}

// Create a token (default expiry = 1 hour)
export function signToken(payload: JwtClaims): string {
  return jwt.sign(payload, SECRET, { expiresIn: "1h" });
}

// Verify a token string and return decoded data
export function verifyToken(token: string): JwtClaims {
  return jwt.verify(token, SECRET) as JwtClaims;
}

// Helper for API routes — extract from "Authorization: Bearer <token>"
export function verifyBearer(authorization?: string | null): JwtClaims {
  if (!authorization) throw new Error("NO_TOKEN");
  const [type, token] = authorization.split(" ");
  if (type !== "Bearer" || !token) throw new Error("NO_TOKEN");
  try {
    return verifyToken(token);
  } catch {
    throw new Error("BAD_TOKEN");
  }
}
