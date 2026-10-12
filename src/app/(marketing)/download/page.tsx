
import { TranslatedText } from '@/i18n/text';
import type { Metadata } from "next";
import { getDownloadInfo } from "@/lib/downloads/config";
import { DownloadClient } from "./download-client";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Install TracKasuwa on Android, iPhone, iPad, Mac, or Windows with the web app or available desktop download.",
};

export const dynamic = "force-dynamic";

export default async function DownloadPage() {
  const versionInfo = getDownloadInfo();

  return (
    <div>
      <section style={{ padding: "100px 0 40px", textAlign: "center" }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <div className="tt-eyebrow mb-3"><TranslatedText text={"Download"} /></div>
          </Reveal>
          <Reveal delay={100}>
            <h1
              className="tt-head"
              style={{
                fontSize: "clamp(32px, 6vw, 64px)",
                margin: "0 0 20px",
                lineHeight: 1.05,
              }}
            ><TranslatedText text={"Get TracKasuwa on every device you sell from."} /></h1>
          </Reveal>
          <Reveal delay={200}>
            <p
              style={{
                fontSize: 18,
                color: "var(--c-textMuted)",
                maxWidth: 620,
                margin: "0 auto",
              }}
            ><TranslatedText text={"Download for Android or Windows, or install the web app."} /></p>
          </Reveal>
        </div>
      </section>

      <section style={{ padding: "20px 0 100px" }}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <DownloadClient versionInfo={versionInfo} />
        </div>
      </section>
    </div>
  );
}
