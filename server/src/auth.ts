// Supabase JWT verification.
//
// Clients authenticate as anonymous Supabase users and pass their access token
// to the WebSocket handshake. We verify it here against the project's public
// JWKS (asymmetric signing keys) and trust the `sub` claim as the player's id.
//
// `createRemoteJWKSet` fetches and caches the key set and transparently handles
// key rotation, so there's no shared secret to store on the server. If a project
// ever needed the legacy HS256 secret instead, only the key argument to
// `jwtVerify` below would change.

import { createRemoteJWKSet, jwtVerify } from "jose";

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL && process.env.AUTH_DISABLED !== "1") {
  throw new Error(
    "SUPABASE_URL is required to verify auth tokens. Set it, or run with " +
      "AUTH_DISABLED=1 for local/smoke testing."
  );
}

const ISSUER = `${SUPABASE_URL}/auth/v1`;
const AUDIENCE = process.env.SUPABASE_JWT_AUD ?? "authenticated";

// Lazily created so AUTH_DISABLED runs (e.g. the smoke test) never need a URL.
const JWKS = SUPABASE_URL
  ? createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))
  : null;

export interface AuthedUser {
  userId: string;
}

/** Verify a Supabase access token; resolves to the user id (`sub`). */
export async function verifyToken(token: string): Promise<AuthedUser> {
  if (!JWKS) throw new Error("JWKS not configured");
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (!payload.sub) throw new Error("token missing sub");
  return { userId: payload.sub };
}
