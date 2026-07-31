import { createMiddleware } from "hono/factory";
import type { Role } from "@soulside/domain";
import { verifyActorToken } from "../auth/jwt";

export type AuthVariables = {
  actorId: string;
  actorRole: Role;
};

/**
 * Require a valid Bearer JWT on `/api/notes/*`.
 * Identity comes only from verified claims — `X-Actor-Id` / body.actorId are ignored.
 */
export const requireActorJwt = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) {
    return c.json(
      {
        error: "unauthorized",
        reason: "Missing Authorization: Bearer <token>",
      },
      401,
    );
  }

  const claims = await verifyActorToken(match[1].trim());
  if (!claims) {
    return c.json(
      {
        error: "unauthorized",
        reason: "Invalid or expired token",
      },
      401,
    );
  }

  c.set("actorId", claims.actorId);
  c.set("actorRole", claims.role);
  await next();
});
