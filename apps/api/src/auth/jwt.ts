import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@soulside/domain";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "soulside-dev-jwt-secret-change-me",
);

const ISSUER = "soulside-api";
const AUDIENCE = "soulside-web";

/** Default TTL for demo tokens (1 hour). */
export const DEV_TOKEN_TTL_SEC = 60 * 60;

export type ActorClaims = {
  actorId: string;
  role: Role;
};

export async function signActorToken(
  claims: ActorClaims,
  ttlSec = DEV_TOKEN_TTL_SEC,
): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.actorId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(SECRET);
}

export async function verifyActorToken(
  token: string,
): Promise<ActorClaims | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return claimsFromPayload(payload);
  } catch {
    return null;
  }
}

function claimsFromPayload(payload: JWTPayload): ActorClaims | null {
  const actorId = typeof payload.sub === "string" ? payload.sub : null;
  const role = typeof payload.role === "string" ? payload.role : null;
  if (!actorId || !role) return null;
  return { actorId, role: role as Role };
}
