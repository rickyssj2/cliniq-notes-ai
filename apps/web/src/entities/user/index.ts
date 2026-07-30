export type { Role, UserRef } from "@soulside/domain";
export { DEV_ACTORS, DEFAULT_ACTOR } from "./model/actors";
export {
  can,
  requireCapability,
  type Capability,
  type AccessResult,
} from "./model/permissions";
export {
  useSessionStore,
  useActor,
  useRole,
  useSetActorById,
} from "./model/session";
export { RequireCapability } from "./ui/RequireCapability";
export { SessionBadge } from "./ui/SessionBadge";
export { ActorAvatar } from "./ui/ActorAvatar";
export { GuardedButton } from "./ui/GuardedButton";
