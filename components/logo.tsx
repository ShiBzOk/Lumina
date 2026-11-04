import localFont from "next/font/local";
import Link from "next/link";

// The wordmark's face, used nowhere else. Chillax Medium from Fontshare, free
// for commercial use. Trial swap: pulchella.ttf is kept in app/fonts so going
// back is pointing `src` at it again.
const wordmark = localFont({ src: "../app/fonts/chillax-medium.woff2", weight: "500" });

export function Logo() {
  return (
    <Link href="/" className={`${wordmark.className} font-medium text-[32px] leading-none`}>
      Lumina
    </Link>
  );
}
