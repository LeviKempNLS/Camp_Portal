export type RegistrationSessionOption = {
  id: string;
  status: string;
  registrationOpen: Date | null;
  registrationClose: Date | null;
  season: {
    status: string;
    registrationOpen: Date | null;
    registrationClose: Date | null;
  };
};

function sessionAndSeasonOpen(session: RegistrationSessionOption) {
  return session.status === "open" && session.season.status === "open";
}

export function sessionWindowOpen(session: RegistrationSessionOption, now = new Date()) {
  if (!sessionAndSeasonOpen(session)) return false;
  const opens = session.registrationOpen ?? session.season.registrationOpen;
  const closes = session.registrationClose ?? session.season.registrationClose;
  return (!opens || now >= opens) && (!closes || now <= closes);
}

export function sessionSelectable(
  session: RegistrationSessionOption,
  needsInformationSessionIds: ReadonlySet<string>,
  now = new Date(),
) {
  if (sessionWindowOpen(session, now)) return true;
  return sessionAndSeasonOpen(session) && needsInformationSessionIds.has(session.id);
}
