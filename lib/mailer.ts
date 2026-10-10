// Transactional email through Resend's HTTP API (no SDK). Off unless both
// RESEND_API_KEY and EMAIL_FROM are set; callers check emailConfigured().
// EMAIL_FROM must be on a domain verified in Resend (e.g. "MemoryPlace
// <no-reply@yourdomain.com>"); Resend's test sender only reaches your own inbox.

export function emailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.RESEND_API_KEY && !!env.EMAIL_FROM;
}

/** The password-reset email (plain text + simple HTML). */
export function resetEmail(url: string): { subject: string; text: string; html: string } {
  const safe = url.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return {
    subject: "Reset your MemoryPlace password",
    text: `Someone asked to reset the password for your MemoryPlace account.\n\nSet a new password here (the link works once, for one hour):\n${url}\n\nIf it wasn't you, ignore this email: your password stays the same.`,
    html: `<p>Someone asked to reset the password for your MemoryPlace account.</p><p><a href="${safe}">Set a new password</a> (the link works once, for one hour).</p><p>If it wasn't you, ignore this email: your password stays the same.</p>`,
  };
}

/** Send one email. Resolves false (and logs) on any failure; never throws. */
export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) console.error("sendEmail", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("sendEmail", e);
    return false;
  }
}
