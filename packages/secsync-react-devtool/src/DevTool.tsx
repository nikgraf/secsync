import React from "react";
import type { Context } from "secsync";
import { uniqueId } from "./uniqueId";

type State = {
  value: any;
  context: Context;
};

type Props = {
  state: State;
  send: (params: any) => void;
};

const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{ padding: "12px 20px", flex: "1 1 0px" }}>{children}</div>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <div
      style={{
        fontSize: 14,
        color: "black",
        marginTop: 12,
        fontWeight: "bold",
      }}
    >
      {children}
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div
      style={{
        fontSize: 12,
        color: "gray",
        marginTop: 12,
      }}
    >
      {children}
    </div>
  );
};

export const DevTool: React.FC<Props> = ({ state, send }) => {
  const isOnline = state.value.hasOwnProperty("connected");

  return (
    <div
      style={{
        border: "1px solid #ddd",
        background: "#fafafa",
        paddingBottom: 12,
      }}
    >
      <div style={{ display: "flex" }}>
        <Section>
          <SectionLabel>Connection</SectionLabel>
          <div>
            <Label>Status</Label>
            <div>
              <span style={{ color: isOnline ? "green" : "red" }}>•</span>
              {isOnline ? "Online" : "Offline"}
            </div>
          </div>
          <div>
            <Label>Connecting retries</Label>
            <div>{state.context._websocketRetries}</div>
          </div>
          <div>
            <Label>Actions</Label>
            <div>
              <button
                onClick={(event) => {
                  event.preventDefault();
                  send({ type: "CONNECT" });
                }}
                disabled={isOnline || state.value === "failed"}
                style={{
                  background: "#fff",
                  padding: "4px 8px",
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  marginRight: 8,
                  marginTop: 4,
                  opacity: isOnline || state.value === "failed" ? 0.5 : 1,
                }}
              >
                Connect
              </button>
              <button
                onClick={(event) => {
                  event.preventDefault();
                  send({ type: "DISCONNECT" });
                }}
                disabled={!isOnline}
                style={{
                  background: "#fff",
                  padding: "4px 8px",
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  marginRight: 8,
                  marginTop: 4,
                  opacity: !isOnline ? 0.5 : 1,
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </Section>

        <Section>
          <SectionLabel>Document status</SectionLabel>
          <div>
            <Label>Status</Label>
            <div>{state.value === "failed" ? "❌ failed" : "valid"}</div>
          </div>
          <div>
            <Label>Initial document loading (incl. decryption)</Label>
            <div>{state.context._documentDecryptionState}</div>
          </div>
        </Section>
      </div>

      <div style={{ display: "flex" }}>
        <Section>
          <SectionLabel>Errors</SectionLabel>
          {/* TODO add a timestamp when the error happened */}
          <div>
            <Label>Document errors</Label>
            <div>
              {state.context._snapshotAndUpdateErrors.length === 0 ? (
                "No Errors"
              ) : (
                <ul>
                  {state.context._snapshotAndUpdateErrors.map((error) => {
                    return <li key={uniqueId()}>{error.message}</li>;
                  })}
                </ul>
              )}
            </div>
          </div>

          <div>
            <Label>Incoming EphemeralMessage errors</Label>
            <div>
              {state.context._ephemeralMessageReceivingErrors.length === 0 ? (
                "No Errors"
              ) : (
                <ul>
                  {state.context._ephemeralMessageReceivingErrors.map(
                    (error) => {
                      return <li key={uniqueId()}>{error.message}</li>;
                    }
                  )}
                </ul>
              )}
            </div>
          </div>

          <div>
            <Label>Sending EphemeralMessage errors</Label>
            <div>
              {state.context._ephemeralMessageAuthoringErrors.length === 0 ? (
                "No Errors"
              ) : (
                <ul>
                  {state.context._ephemeralMessageAuthoringErrors.map(
                    (error) => {
                      return <li key={uniqueId()}>{error.message}</li>;
                    }
                  )}
                </ul>
              )}
            </div>
          </div>
        </Section>

        <Section>
          <SectionLabel>Data sending in progress</SectionLabel>
          <div>
            <Label>Sending Snapshot in progress</Label>
            <div>{state.context._snapshotInFlight ? "true" : "false"}</div>
          </div>

          <div>
            <Label>Sending updates in progress</Label>
            <div>{state.context._updatesInFlight.length}</div>
          </div>
        </Section>
      </div>
    </div>
  );
};
