export type M3Actor = {
  email: string;
  displayName: string;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";

export function getM3Actor(request: Request): M3Actor | null {
  const platformEmail = request.headers.get(USER_EMAIL_HEADER)?.trim();
  if (platformEmail) {
    const encodedName = request.headers.get(USER_FULL_NAME_HEADER);
    const displayName =
      encodedName &&
      request.headers.get(USER_FULL_NAME_ENCODING_HEADER) ===
        "percent-encoded-utf-8"
        ? safeDecode(encodedName) ?? platformEmail
        : platformEmail;

    return { email: platformEmail.toLowerCase(), displayName };
  }

  const localEmail =
    process.env.M3_ALLOW_LOCAL_DEMO_IDENTITY === "true"
      ? process.env.M3_LOCAL_DEMO_USER_EMAIL?.trim()
      : null;
  if (!localEmail) return null;

  return {
    email: localEmail.toLowerCase(),
    displayName: process.env.M3_LOCAL_DEMO_USER_NAME?.trim() || localEmail,
  };
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
