import { Reveal } from "@/components/marketing/reveal";
import { SiteImage } from "@/components/shared/site-image";
import { showSocialProof, socialProofEntries } from "@/content/social-proof";

export function SocialProofBand() {
  const entries = socialProofEntries.filter((entry) => entry.permissionGranted);
  if (!showSocialProof || entries.length === 0) return null;

  return (
    <section className="border-y border-border py-12">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {entries.map((entry) => (
          <Reveal key={entry.name}>
            <figure className="h-full rounded-xl border border-border bg-[var(--c-surface)] p-6">
              {entry.logo?.src ? (
                <div className="relative mb-4 h-10 w-36">
                  <SiteImage image={entry.logo} sizes="144px" className="object-contain" />
                </div>
              ) : null}
              {entry.quote ? <blockquote>“{entry.quote}”</blockquote> : null}
              <figcaption className="mt-3 text-sm font-medium">
                {entry.name}
                {entry.business ? ` · ${entry.business}` : ""}
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
