import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { DemoContainer } from "./styled";
import { isMobile } from "./common";
import { ExplorerMap } from "./explorer/map";

const MANIFEST_URL = "/generated/countries_h3_r6.json";

const PageShell = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;

  ${isMobile} {
    padding: 1rem;
  }
`;

const IntroCard = styled.section`
  background: white;
  border: 1px solid #d6dde6;
  border-radius: 24px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);

  h1 {
    margin: 0 0 0.5rem;
    font-size: 2rem;
    line-height: 1.1;
  }

  p {
    margin: 0;
    max-width: 60rem;
    color: #435266;
  }
`;

const IntroMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
`;

const MetaPill = styled.div`
  background: #edf3f8;
  border-radius: 999px;
  color: #26415c;
  font-size: 0.9rem;
  padding: 0.55rem 0.9rem;
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;

  ${isMobile} {
    grid-template-columns: 1fr;
  }
`;

const PanelCard = styled.section`
  background: white;
  border: 1px solid #d6dde6;
  border-radius: 24px;
  padding: 1.25rem;
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
`;

const Controls = styled.div`
  display: grid;
  gap: 0.85rem;
`;

const Label = styled.label`
  display: grid;
  gap: 0.4rem;
  color: #26415c;
  font-size: 0.9rem;
  font-weight: 600;
`;

const Input = styled.input`
  width: 100%;
  border: 1px solid #c8d3df;
  border-radius: 14px;
  padding: 0.75rem 0.9rem;
  font: inherit;
`;

const Select = styled.select`
  width: 100%;
  border: 1px solid #c8d3df;
  border-radius: 14px;
  padding: 0.75rem 0.9rem;
  font: inherit;
  background: white;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const Button = styled.button`
  flex: 1;
  border: 0;
  border-radius: 999px;
  background: #0f172a;
  color: white;
  cursor: pointer;
  font: inherit;
  padding: 0.7rem 1rem;

  &:disabled {
    background: #9aa7b5;
    cursor: default;
  }
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
`;

const StatCard = styled.div`
  background: #f7fafc;
  border-radius: 18px;
  padding: 0.9rem;
`;

const StatLabel = styled.div`
  color: #5b6c80;
  font-size: 0.8rem;
  margin-bottom: 0.2rem;
`;

const StatValue = styled.div`
  color: #0f172a;
  font-size: 1.05rem;
  font-weight: 700;
  word-break: break-word;
`;

const CellPreview = styled.pre`
  margin: 1rem 0 0;
  max-height: 14rem;
  overflow: auto;
  background: #0f172a;
  border-radius: 18px;
  color: #dbe7f3;
  font-size: 0.82rem;
  line-height: 1.45;
  padding: 1rem;
  white-space: pre-wrap;
  word-break: break-word;
`;

const MapCard = styled(PanelCard)`
  position: relative;
  min-width: 0;
  padding: 0;
  overflow: hidden;
`;

const MapHeader = styled.div`
  border-bottom: 1px solid #d6dde6;
  padding: 1rem 1.25rem;

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  p {
    margin: 0.3rem 0 0;
    color: #5b6c80;
    font-size: 0.92rem;
  }
`;

const MapFrame = styled(DemoContainer)`
  position: relative;
  width: 100%;
  min-width: 0;
  height: min(76vh, 900px);
  isolation: isolate;

  ${isMobile} {
    height: 60vh;
  }
`;

const MessageCard = styled(PanelCard)`
  p {
    margin: 0;
    color: #435266;
  }

  code {
    font-size: 0.9em;
  }
`;

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getInitialIso(countries) {
  if (!countries.length) {
    return "";
  }

  const preferred = countries.find(({ iso3 }) => iso3 === "AUS");
  return preferred ? preferred.iso3 : countries[0].iso3;
}

function noop() {}

export default function CountryManifestViewer() {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIso, setSelectedIso] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadManifest() {
      try {
        setIsLoading(true);
        setError("");
        const response = await fetch(MANIFEST_URL, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const nextManifest = await response.json();
        setManifest(nextManifest);
      } catch (err) {
        if (err.name === "AbortError") {
          return;
        }

        setError(
          `Unable to load ${MANIFEST_URL}. Copy the generated manifest into website/static/generated/ and restart the site if needed.`,
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadManifest();
    return () => controller.abort();
  }, []);

  const countries = useMemo(() => {
    if (!manifest) {
      return [];
    }

    return Object.values(manifest.countries).sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.iso3.localeCompare(right.iso3),
    );
  }, [manifest]);

  const filteredCountries = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return countries;
    }

    return countries.filter(
      ({ iso3, name }) =>
        iso3.toLowerCase().includes(query) || name.toLowerCase().includes(query),
    );
  }, [countries, search]);

  useEffect(() => {
    if (!countries.length) {
      return;
    }

    if (!selectedIso) {
      setSelectedIso(getInitialIso(countries));
      return;
    }

    if (!countries.some(({ iso3 }) => iso3 === selectedIso)) {
      setSelectedIso(getInitialIso(countries));
    }
  }, [countries, selectedIso]);

  useEffect(() => {
    if (
      filteredCountries.length &&
      !filteredCountries.some(({ iso3 }) => iso3 === selectedIso)
    ) {
      setSelectedIso(filteredCountries[0].iso3);
    }
  }, [filteredCountries, selectedIso]);

  const selectedCountry = manifest?.countries?.[selectedIso] || null;

  const selectedIndex = filteredCountries.findIndex(
    ({ iso3 }) => iso3 === selectedIso,
  );

  function stepCountry(direction) {
    if (!filteredCountries.length) {
      return;
    }

    const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex =
      (currentIndex + direction + filteredCountries.length) %
      filteredCountries.length;
    setSelectedIso(filteredCountries[nextIndex].iso3);
  }

  if (isLoading) {
    return (
      <PageShell>
        <MessageCard>
          <p>Loading the generated country manifest...</p>
        </MessageCard>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <MessageCard>
          <p>{error}</p>
          <p style={{ marginTop: "0.75rem" }}>
            Expected asset: <code>{MANIFEST_URL}</code>
          </p>
          <p style={{ marginTop: "0.75rem" }}>
            Suggested sync:{" "}
            <code>
              cp build/countries_h3_r6.json website/static/generated/
            </code>
          </p>
        </MessageCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <IntroCard>
        <h1>Country H3 Manifest Viewer</h1>
        <p>
          Browse the locally generated Natural Earth admin-0 country manifest as
          compacted H3 cells. The map below is driven by the generated file at{" "}
          <code>{MANIFEST_URL}</code>.
        </p>
        <IntroMeta>
          <MetaPill>{formatNumber(manifest.countryCount)} countries</MetaPill>
          <MetaPill>Resolution {manifest.resolution}</MetaPill>
          <MetaPill>Containment {manifest.containment}</MetaPill>
          <MetaPill>{manifest.source.layer}</MetaPill>
          <MetaPill>{manifest.generatedAt}</MetaPill>
          <MetaPill>
            <a href={MANIFEST_URL} target="_blank" rel="noreferrer">
              Open Raw JSON
            </a>
          </MetaPill>
        </IntroMeta>
      </IntroCard>

      <ContentGrid>
        <PanelCard>
          <Controls>
            <Label>
              Search
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by name or ISO"
              />
            </Label>

            <Label>
              Country
              <Select
                value={selectedIso}
                onChange={(event) => setSelectedIso(event.target.value)}
              >
                {filteredCountries.map(({ iso3, name, cellCount }) => (
                  <option key={iso3} value={iso3}>
                    {name} ({iso3}) · {formatNumber(cellCount)} cells
                  </option>
                ))}
              </Select>
            </Label>

            <ButtonRow>
              <Button
                type="button"
                onClick={() => stepCountry(-1)}
                disabled={!filteredCountries.length}
              >
                Previous
              </Button>
              <Button
                type="button"
                onClick={() => stepCountry(1)}
                disabled={!filteredCountries.length}
              >
                Next
              </Button>
            </ButtonRow>
          </Controls>

          {selectedCountry ? (
            <>
              <StatGrid>
                <StatCard>
                  <StatLabel>ISO Alpha-3</StatLabel>
                  <StatValue>{selectedCountry.iso3}</StatValue>
                </StatCard>
                <StatCard>
                  <StatLabel>Display Name</StatLabel>
                  <StatValue>{selectedCountry.name}</StatValue>
                </StatCard>
                <StatCard>
                  <StatLabel>Polygon Parts</StatLabel>
                  <StatValue>{formatNumber(selectedCountry.polygonCount)}</StatValue>
                </StatCard>
                <StatCard>
                  <StatLabel>Compacted Cells</StatLabel>
                  <StatValue>{formatNumber(selectedCountry.cellCount)}</StatValue>
                </StatCard>
              </StatGrid>

              <CellPreview>
                {(selectedCountry.cells.slice(0, 18).join("\n") || "No cells") +
                  (selectedCountry.cells.length > 18 ? "\n..." : "")}
              </CellPreview>
            </>
          ) : (
            <CellPreview>No country selected.</CellPreview>
          )}
        </PanelCard>

        <MapCard>
          <MapHeader>
            <h2>{selectedCountry ? selectedCountry.name : "Country map"}</h2>
            <p>
              {selectedCountry
                ? `${selectedCountry.iso3} rendered from compacted H3 cells`
                : "Pick a country to view its cells"}
            </p>
          </MapHeader>
          <MapFrame>
            <ExplorerMap
              userInput={selectedCountry ? selectedCountry.cells : []}
              userValidHex={Boolean(selectedCountry && selectedCountry.cells.length)}
              objectOnClick={noop}
              coordinateOnClick={noop}
            />
          </MapFrame>
        </MapCard>
      </ContentGrid>
    </PageShell>
  );
}
