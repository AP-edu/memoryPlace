import { describe, expect, it } from "vitest";
import { emailConfigured, resetEmail } from "./mailer";

describe("mailer", () => {
  it("is off unless both the key and the sender are set", () => {
    expect(emailConfigured({})).toBe(false);
    expect(emailConfigured({ RESEND_API_KEY: "re_x" })).toBe(false);
    expect(emailConfigured({ RESEND_API_KEY: "re_x", EMAIL_FROM: "MemoryPlace <a@b.co>" })).toBe(true);
  });

  it("puts the reset link in both parts, escaped in the HTML", () => {
    const m = resetEmail("https://x.app/reset-password/abc?a=1&b=2");
    expect(m.text).toContain("https://x.app/reset-password/abc?a=1&b=2");
    expect(m.html).toContain('href="https://x.app/reset-password/abc?a=1&amp;b=2"');
  });
});
