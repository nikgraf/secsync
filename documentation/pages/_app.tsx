// needed as explicit import before our own styles
// as they are otherwise added last and would therefore overrule our stylesheet
import "nextra-theme-docs/style.css";
import { Inter } from "next/font/google";
import "../styles/global.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function App({ Component, pageProps }) {
  return (
    <>
      {/* additionally defines the font in <head> as elements like the theme-switch render outside of <main>
          and therefore wouldn't have the right font
      */}
      <style jsx global>{`
        html {
          font-family: ${inter.style.fontFamily};
        }
      `}</style>
      <main className={`${inter.variable} font-inter`}>
        <Component {...pageProps} />
      </main>
    </>
  );
}
