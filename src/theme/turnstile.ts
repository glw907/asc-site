// Cloudflare Turnstile verification, shared by the contact and donate remote functions. Ported
// from ecxc.ski's own contact.remote.ts (the family precedent this pass follows).

/** Verify a Turnstile response token against the siteverify API. */
export async function verifyTurnstile(token: string, ip: string, secret: string): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const { success } = (await res.json()) as { success: boolean };
  return success;
}

/**
 * The club's own Turnstile site key, the same public key the pre-rebuild site already registered
 * with Cloudflare (safe to embed: the site key ships inside the served HTML by design, unlike the
 * paired secret key, which stays a Worker secret).
 */
export const TURNSTILE_SITE_KEY = '0x4AAAAAACaRcPmackdot0hZ';
