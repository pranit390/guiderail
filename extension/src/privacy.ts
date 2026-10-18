// These account surfaces are excluded even when broad Google host permissions
// would otherwise let the content script run there.
const SENSITIVE_HOSTS = ["accounts.google.com", "myaccount.google.com", "passwords.google.com"];

export function isSensitiveUrl(value: string): boolean {
  try {
    const host = new URL(value.includes("://") ? value : `https://${value}`).hostname;
    return SENSITIVE_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return true;
  }
}
