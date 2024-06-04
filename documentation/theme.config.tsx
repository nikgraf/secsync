import { DocsThemeConfig } from "nextra-theme-docs";
import { Code } from "./components/Code";
import { Footer } from "./components/Footer";
import { Logo } from "./components/Logo";
import { Pre } from "./components/Pre";
import { Table } from "./components/Table";
import { Td } from "./components/Td";
import { Th } from "./components/Th";
import { Tr } from "./components/Tr";

const config: DocsThemeConfig = {
  head: (
    <>
      <link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
      <link rel="icon" href="/favicon.png" type="image/png"></link>
    </>
  ),
  logo: (
    // wrapper needed so it looks vertically centered in header
    <div style={{ marginBottom: 12 }}>
      <Logo hoverEffect />
    </div>
  ),
  project: {
    link: "https://github.com/serenity-kit/secsync",
  },
  // chat: {
  //   link: "https://discord.com",
  // },
  docsRepositoryBase: "https://github.com/serenity-kit/secsync",
  footer: {
    component: Footer,
  },
  primaryHue: 232,
  components: {
    // https://mdxjs.com/table-of-components/
    pre: Pre,
    code: Code,
    p: (props) => <p className="nx-mt-5 first:nx-mt-0 leading-6" {...props} />,
    table: Table,
    th: Th,
    tr: Tr,
    td: Td,
  },
};

export default config;
