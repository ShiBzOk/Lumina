import localFont from "next/font/local";
import Link from "next/link";

// The wordmark's face, used nowhere else. Chillax (variable, set to medium) from Fontshare, free
// for commercial use. Trial swap: pulchella.ttf is kept in app/fonts so going
// back is pointing `src` at it again.
const wordmark = localFont({ src: "../app/fonts/Chillax-Variable.ttf", weight: "200 700" });

export function Logo() {
  return (
    <Link href="/" className={`${wordmark.className} font-medium text-[32px] leading-none`}>
      Lumina
    </Link>
  );
}
