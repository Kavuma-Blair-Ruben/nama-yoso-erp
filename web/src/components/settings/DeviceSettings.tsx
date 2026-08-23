"use client";

import { useState, useTransition } from "react";
import { createDevice, deleteDevice, testDeviceConnection, setDeviceActive, sendTestPrint, sendExpiryTicketTestPrint } from "@/server/actions/devices";

type Device = {
  id: string;
  name: string;
  type: string;
  connection: string;
  address: string | null;
  branchId: string | null;
  branchName: string | null;
  notes: string | null;
  lastTestedAt: Date | null;
  lastTestStatus: string | null;
  lastTestOk: boolean | null;
  isActive: boolean;
};

const TYPE_LABEL: Record<string, string> = { label_printer: "Label/Sticker Printer", receipt_printer: "Receipt Printer", barcode_scanner: "Barcode/QR Scanner", other: "Other" };
const CONNECTION_LABEL: Record<string, string> = { network: "Network (IP)", bluetooth: "Bluetooth", wifi_direct: "Wi-Fi Direct", other: "Other" };

function DeviceActiveToggle({ device }: { device: Device }) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await setDeviceActive(device.id, !device.isActive);
    });
  }

  return (
    <button
      type="button"
      className="switch-row"
      disabled={pending}
      onClick={toggle}
      title={device.isActive ? "Click to deactivate" : "Click to activate"}
    >
      <span className={`switch-track ${device.isActive ? "on" : ""}`}>
        <span className="switch-knob" />
      </span>
      <span className={`switch-label ${device.isActive ? "on" : ""}`}>{pending ? "…" : device.isActive ? "Active" : "Inactive"}</span>
    </button>
  );
}

function ConnectedIndicator({ device }: { device: Device }) {
  const connected = device.lastTestOk === true;
  if (device.connection !== "network") return null;
  return (
    <span className="switch-row" style={{ cursor: "default" }} title={device.lastTestStatus ?? "Not tested yet"}>
      <span className={`switch-track ${connected ? "on" : ""}`}>
        <span className="switch-knob" />
      </span>
      <span className={`switch-label ${connected ? "on" : ""}`}>{connected ? "Connected" : "Not Connected"}</span>
    </span>
  );
}

function DeviceRow({ device }: { device: Device }) {
  const [pending, startTransition] = useTransition();
  const [printPending, startPrintTransition] = useTransition();
  const [expiryPrintPending, startExpiryPrintTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleTest() {
    setMessage(null);
    startTransition(async () => {
      const result = await testDeviceConnection(device.id);
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setIsError(false);
        setMessage(result.message ?? "OK");
      }
    });
  }

  function handleTestPrint() {
    setMessage(null);
    startPrintTransition(async () => {
      const result = await sendTestPrint(device.id);
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setIsError(false);
        setMessage(result.message ?? "Sent");
      }
    });
  }

  function handleExpiryTestPrint() {
    setMessage(null);
    startExpiryPrintTransition(async () => {
      const result = await sendExpiryTicketTestPrint(device.id);
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setIsError(false);
        setMessage(result.message ?? "Sent");
      }
    });
  }

  return (
    <div className="usedin-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="name">
          {device.name}
          <span className="tag neutral" style={{ marginLeft: 8 }}>{TYPE_LABEL[device.type] ?? device.type}</span>
          <span className="tag neutral" style={{ marginLeft: 4 }}>{CONNECTION_LABEL[device.connection] ?? device.connection}</span>
        </span>
        <span className="code" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ConnectedIndicator device={device} />
          <DeviceActiveToggle device={device} />
          {device.connection === "network" && (
            <button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: 11 }} disabled={pending} onClick={handleTest}>
              {pending ? "Testing…" : "Test Connection"}
            </button>
          )}
          {device.connection === "network" && device.type === "receipt_printer" && (
            <button type="button" className="btn accent" style={{ padding: "3px 8px", fontSize: 11 }} disabled={printPending} onClick={handleTestPrint}>
              {printPending ? "Printing…" : "Send Test Print"}
            </button>
          )}
          {device.connection === "network" && device.type === "receipt_printer" && (
            <button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: 11, borderColor: "var(--bad)", color: "var(--bad)" }} disabled={expiryPrintPending} onClick={handleExpiryTestPrint}>
              {expiryPrintPending ? "Printing…" : "Send Test Expiry Ticket"}
            </button>
          )}
          <a
            href="#"
            style={{ color: "var(--bad)" }}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                await deleteDevice(device.id);
              });
            }}
          >
            remove
          </a>
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
        {device.address && <>Address: {device.address} · </>}
        {device.branchName && <>{device.branchName} · </>}
        {device.notes}
      </div>
      {(message || device.lastTestStatus) && (
        <div style={{ fontSize: 11, color: message ? (isError ? "var(--bad)" : "var(--good)") : "var(--ink-faint)" }}>
          {message ?? `Last tested: ${device.lastTestStatus}`}
        </div>
      )}
    </div>
  );
}

export function DeviceSettings({ devices, branches }: { devices: Device[]; branches: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState("label_printer");
  const [connection, setConnection] = useState("network");
  const [address, setAddress] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await createDevice({ name, type, connection, address: address || undefined, branchId: branchId || undefined });
      if (result.error) setError(result.error);
      else {
        setName("");
        setAddress("");
      }
    });
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Hardware Devices</h3></div>
      <div className="panel-body">
        <div className="callout">
          Register printers and scanners that connect wirelessly instead of being plugged into this computer — a network
          label/receipt printer reachable by IP address, or a Bluetooth/Wi-Fi Direct scanner. Network devices can be tested for
          reachability directly from here; Bluetooth/Wi-Fi Direct devices pair with whichever phone or tablet is using the app.
        </div>

        {devices.length ? devices.map((d) => <DeviceRow key={d.id} device={d} />) : <div style={{ fontSize: 12, color: "var(--ink-faint)", padding: "6px 0" }}>No devices registered yet.</div>}

        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", marginTop: 14 }}>
          <div>Name</div>
          <div>Type</div>
          <div>Connection</div>
          <div>Address / IP</div>
          <div>Branch</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", marginBottom: 10 }}>
          <input type="text" placeholder="e.g. Kitchen Label Printer" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={connection} onChange={(e) => setConnection(e.target.value)}>
            {Object.entries(CONNECTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input type="text" placeholder={connection === "network" ? "e.g. 192.168.1.50:9100" : "optional"} value={address} onChange={(e) => setAddress(e.target.value)} />
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Any branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <button className="btn accent" disabled={pending || !name.trim()} onClick={handleAdd}>
          {pending ? "Adding…" : "+ Add Device"}
        </button>
        {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
