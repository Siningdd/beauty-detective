// Web-only root HTML. See: https://docs.expo.dev/router/reference/static-rendering/#root-html
import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        {/* expo-reset sets #root{display:flex} without direction; row breaks full-width / text alignment */}
        <style
          id="bd-root-layout"
          dangerouslySetInnerHTML={{
            __html:
              "#root{flex-direction:column;align-items:stretch;text-align:left}",
          }}
        />
      </head>
      <body style={{ margin: 0, textAlign: "left" }}>{children}</body>
    </html>
  );
}
