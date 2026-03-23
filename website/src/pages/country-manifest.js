import React from "react";
import Layout from "@theme/Layout";
import BrowserOnly from "@docusaurus/BrowserOnly";

export default function CountryManifestPage() {
  return (
    <Layout
      title="Country H3 Manifest Viewer"
      description="Browse the generated Natural Earth country-to-H3 manifest."
    >
      <BrowserOnly>
        {() => {
          const CountryManifestViewer =
            require("../components/country-manifest-viewer").default;
          return <CountryManifestViewer />;
        }}
      </BrowserOnly>
    </Layout>
  );
}
