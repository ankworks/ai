import type { ReactNode } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

/**
 * Public Trust Center (static information — no backend required).
 * Report intake + appeals processing connect to the Admin review queue in Phase 6;
 * that is stated openly on the page rather than faked.
 */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="border-border scroll-mt-24 border-b py-10 last:border-b-0">
      <h2 className="text-xl md:text-2xl">{title}</h2>
      <div className="text-muted-foreground mt-4 space-y-3 text-sm leading-relaxed md:text-base">
        {children}
      </div>
    </section>
  );
}

export function Trust() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 py-12 md:px-6 md:py-16">
        <h1 className="text-3xl md:text-4xl">Trust Center</h1>
        <p className="text-muted-foreground mt-3">
          How ConAI protects your data, keeps AI safe, and enforces community standards.
        </p>

        <div className="mt-8">
          <Section id="privacy" title="Privacy">
            <p>
              ConAI collects only what the product needs: your account details (email, username,
              preferences), content you create (chats, documents, files), and coarse security
              signals (IP prefix, device family) to prevent abuse.
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Files are stored in private buckets and are never publicly listable.</li>
              <li>Personal memory is opt-in and is never automatically shared with Teams.</li>
              <li>Team activity logs are retained for 30 days; admin audit logs for 90 days.</li>
              <li>
                Passwords, API keys, and session tokens are never written to logs or audit records.
              </li>
              <li>You can export or delete your data from Account → Storage / Security.</li>
            </ul>
          </Section>

          <Section id="safety" title="AI Safety">
            <p>
              ConAI applies a fixed policy hierarchy to every AI request, enforced by backend code —
              not by prompt wording alone:
            </p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Core safety rules (hard-coded, cannot be overridden)</li>
              <li>Platform-wide admin policies</li>
              <li>Per-tool instructions</li>
              <li>Your personal preferences</li>
              <li>Your request</li>
            </ol>
            <p>
              AI usage is metered transparently through Sparks. Smart Memory suggestions require
              your explicit approval before anything is saved.
            </p>
          </Section>

          <Section id="guidelines" title="Community Guidelines">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Be respectful. No harassment, hate speech, or targeted abuse.</li>
              <li>No illegal content, impersonation, or platform manipulation.</li>
              <li>Do not attempt to bypass Sparks limits, rate limits, or access controls.</li>
              <li>Respect other people&apos;s data and intellectual property.</li>
            </ul>
          </Section>

          <Section id="report" title="Report Abuse">
            <p>
              You can report messages, users, teams, or shared content that violate these
              guidelines. Reports enter a moderation queue reviewed by platform moderators.
            </p>
            <p className="border-border bg-muted rounded-lg border px-4 py-3 text-sm">
              <strong className="text-foreground">Status:</strong> the in-product report form and
              admin review queue arrive with Phase 6 (Trust &amp; Safety). Until then, contact the
              platform operator for your ConAI instance. Reports are never auto-actioned.
            </p>
          </Section>

          <Section id="appeals" title="Appeals">
            <p>
              If your content is moderated or your account is restricted, you can appeal the
              decision. Appeals are reviewed by a human who was not involved in the original
              decision. Enforcement actions and appeal outcomes are recorded in audit logs.
            </p>
          </Section>

          <Section id="transparency" title="Transparency">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Sparks accounting, model routing, and policy versions are inspectable in your
                account.
              </li>
              <li>Service health is published on the public Status page from live probes.</li>
              <li>
                We never log passwords, API keys, session tokens, or MFA seeds — this is enforced by
                redaction helpers with tests.
              </li>
              <li>Referral rewards require verified anti-abuse checks before granting Sparks.</li>
            </ul>
          </Section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
