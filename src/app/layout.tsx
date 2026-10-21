import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["SOFT", "WONK", "opsz"], style: ["normal", "italic"] });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "ConstituLex — the Constitution, in plain words", template: "%s · ConstituLex" },
  description: "Describe a grievance in ordinary language and find the Supreme Court case and the Articles of the Constitution that answer it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${geist.variable} ${geistMono.variable}`}>
      <body>
        <div className="flag" />
        <div className="shell">
          <header className="mast">
            <Link href="/" className="brand">
              <b>
                Constitu<i>Lex</i>
              </b>
              <span>case law, in plain words</span>
            </Link>
            <nav>
              <Link href="/#how">How it works</Link>
              <Link href="/#corpus">The corpus</Link>
            </nav>
            <span className="pill-tech">
              <i /> Postgres · pgvector
            </span>
          </header>
          {children}
          <footer className="foot-site">
            <span>
              <b>ConstituLex</b> — a retrieval and citation aid over a fixed, verified corpus. Not legal advice.
            </span>
            <span style={{ marginLeft: "auto" }}>Supabase · Postgres 15+ · pgvector HNSW · Next.js · transformers.js</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
