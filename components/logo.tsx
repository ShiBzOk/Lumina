import localFont from "next/font/local";
import Link from "next/link";

// The wordmark's face, used nowhere else. Free for personal use; a commercial
// release needs a licence.
const pulchella = localFont({ src: "../app/fonts/pulchella.ttf" });

export function Logo() {
  return (
    <Link href="/" className={`${pulchella.className} text-[32px] leading-none`}>
      Lumina
    </Link>
  );
}
