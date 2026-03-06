import type { Profile } from "./types";

type IdentityProfile = Pick<Profile, "full_name" | "email"> | null | undefined;
type IdentityUser = {
  email?: string | null;
  user_metadata?: { full_name?: string | null } | null;
} | null | undefined;

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getInitials(source: string) {
  if (source.includes("@")) {
    const localPart = source.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
    return (localPart.slice(0, 2) || "SI").toUpperCase();
  }

  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials || source.slice(0, 1).toUpperCase() || "SI";
}

export function getSignedInIdentity(profile: IdentityProfile, user?: IdentityUser) {
  const metadataName = clean(user?.user_metadata?.full_name);
  const name = clean(profile?.full_name) ?? metadataName;
  const email = clean(profile?.email) ?? clean(user?.email);
  const label = name ?? email ?? "Signed in";

  return {
    label,
    email,
    initials: getInitials(label),
  };
}