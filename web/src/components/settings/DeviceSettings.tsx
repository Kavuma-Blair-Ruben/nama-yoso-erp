"use client";

import { useState, useTransition } from "react";
import { createDevice, deleteDevice, testDeviceConnection, setDeviceActive, sendTestPrint, sendExpiryTicketTestPrint, sendBarcodeTestPrint } from "@/server/actions/devices";

type Device = {
  id: string;
  name: string;
  type: string;
  connection: string;
  address: string | null;
  printnodePrinterId: number | null;
  branchId: string | null;
  branchName: string | null;
  notes: string | null;
  lastTestedAt: Date | null;
  lastTestStatus: string | null;
  lastTestOk: boolean | null;
  isActive: boolean;
};

type PrintNodePrinter = { id: number; name: string; description: string | null; state: string; computerName: string | null };

const TYPE_LABEL: Record<string, string> = {
  label_printer: "Label/Sticker Printer",
  receipt_printer: "Receipt Printer",
  barcode_scanner: "Barcode/QR Scanner",
  document_scanner: "Document Scanner",
  fax: "Fax Machine",
  other: "Other",
};
const TYPE_ICON: Record<string, string> = {
  label_printer: "🏷",
  receipt_printer: "🖨",
  barcode_scanner: "📷",
  document_scanner: "🖹",
  fax: "📠",
  other: "🔌",
};
const CONNECTION_LABEL: Record<string, string> = { network: "Network (IP)", bluetooth: "Bluetooth", wifi_direct: "Wi-Fi Direct", printnode: "PrintNode (cloud bridge)", other: "Other" };
const REACHABLE_CONNECTIONS = new Set(["network", "printnode"]);

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
  if (!REACHABLE_CONNECTIONS.has(device.connection)) return null;
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
  const [barcodePrintPending, startBarcodePrintTransition] = useTransition();
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

  function handleBarcodeTestPrint() {
    setMessage(null);
    startBarcodePrintTransition(async () => {
      const result = await sendBarcodeTestPrint(device.id);
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
          {REACHABLE_CONNECTIONS.has(device.connection) && (
            <button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: 11 }} disabled={pending} onClick={handleTest}>
              {pending ? "Testing…" : "Test Connection"}
            </button>
          )}
          {REACHABLE_CONNECTIONS.has(device.connection) && device.type === "receipt_printer" && (
            <button type="button" className="btn accent" style={{ padding: "3px 8px", fontSize: 11 }} disabled={printPending} onClick={handleTestPrint}>
              {printPending ? "Printing…" : "Send Test Print"}
            </button>
          )}
          {REACHABLE_CONNECTIONS.has(device.connection) && device.type === "receipt_printer" && (
            <button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: 11, borderColor: "var(--bad)", color: "var(--bad)" }} disabled={expiryPrintPending} onClick={handleExpiryTestPrint}>
              {expiryPrintPending ? "Printing…" : "Send Test Expiry Ticket"}
            </button>
          )}
          {REACHABLE_CONNECTIONS.has(device.connection) && (device.type === "receipt_printer" || device.type === "label_printer") && (
            <button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: 11 }} disabled={barcodePrintPending} onClick={handleBarcodeTestPrint}>
              {barcodePrintPending ? "Printing…" : "Test Barcode Print"}
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
        {device.printnodePrinterId && <>PrintNode Printer #{device.printnodePrinterId} · </>}
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

function DeviceStatusSummary({ devices }: { devices: Device[] }) {
  const total = devices.length;
  const active = devices.filter((d) => d.isActive).length;
  const reachable = devices.filter((d) => REACHABLE_CONNECTIONS.has(d.connection));
  const online = reachable.filter((d) => d.lastTestOk === true).length;
  const offline = reachable.filter((d) => d.lastTestOk !== true).length;
  const untested = reachable.filter((d) => d.lastTestedAt === null).length;

  const cards = [
    { label: "Total Devices", value: total, color: "var(--ink)" },
    { label: "Online", value: online, color: "var(--good)" },
    { label: "Offline / Unreachable", value: offline, color: "var(--bad)" },
    { label: "Never Tested", value: untested, color: "var(--ink-faint)" },
    { label: "Inactive", value: total - active, color: "var(--ink-faint)" },
  ];

  const byType = Object.keys(TYPE_LABEL).map((type) => ({
    type,
    count: devices.filter((d) => d.type === type).length,
  }));

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 10 }}>
        {cards.map((c) => (
          <div key={c.label} className="usedin-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</span>
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{c.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {byType
          .filter((t) => t.count > 0)
          .map((t) => (
            <span key={t.type} className="tag neutral">
              {TYPE_ICON[t.type]} {TYPE_LABEL[t.type]}: {t.count}
            </span>
          ))}
      </div>
    </div>
  );
}

export function DeviceSettings({
  devices,
  branches,
  printNodePrinters,
  printNodeConfigured,
}: {
  devices: Device[];
  branches: { id: string; name: string }[];
  printNodePrinters: PrintNodePrinter[];
  printNodeConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState("label_printer");
  const [connection, setConnection] = useState("network");
  const [address, setAddress] = useState("");
  const [printnodePrinterId, setPrintnodePrinterId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await createDevice({
        name,
        type,
        connection,
        address: connection === "network" ? address || undefined : undefined,
        printnodePrinterId: connection === "printnode" && printnodePrinterId ? Number(printnodePrinterId) : undefined,
        branchId: branchId || undefined,
      });
      if (result.error) setError(result.error);
      else {
        setName("");
        setAddress("");
        setPrintnodePrinterId("");
      }
    });
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Hardware Devices</h3></div>
      <div className="panel-body">
        <div className="callout">
          Register and monitor every piece of hardware across your branches — label/receipt printers, barcode/QR scanners,
          document scanners, fax machines — that connects wirelessly instead of being plugged into this computer. A network
          device is reachable by IP address; a printer relayed through PrintNode works even when this app is hosted in the
          cloud (PrintNode&apos;s client app bridges to whatever local network the printer is on); Bluetooth/Wi-Fi Direct
          devices pair directly with whichever phone or tablet is using the app. Network and PrintNode devices can be tested
          for reachability directly from here.
        </div>
        {connection === "printnode" && !printNodeConfigured && (
          <div className="callout" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
            PrintNode isn&apos;t configured yet — add <code>PRINTNODE_API_KEY</code> to the environment first (sign up free at
            printnode.com, install their client app on a PC on the printer&apos;s network, then paste the API key here).
          </div>
        )}

        <DeviceStatusSummary devices={devices} />

        {devices.length ? (
          Object.keys(TYPE_LABEL)
            .map((t) => ({ type: t, rows: devices.filter((d) => d.type === t) }))
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <div key={g.type} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", margin: "10px 0 4px" }}>
                  {TYPE_ICON[g.type]} {TYPE_LABEL[g.type]} ({g.rows.length})
                </div>
                {g.rows.map((d) => (
                  <DeviceRow key={d.id} device={d} />
                ))}
              </div>
            ))
        ) : (
          <div style={{ fontSize: 12, color: "var(--ink-faint)", padding: "6px 0" }}>No devices registered yet.</div>
        )}

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
          {connection === "printnode" ? (
            <select value={printnodePrinterId} onChange={(e) => setPrintnodePrinterId(e.target.value)}>
              <option value="">{printNodePrinters.length ? "Pick a printer…" : "No printers found in PrintNode"}</option>
              {printNodePrinters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.state}
                  {p.computerName ? ` (${p.computerName})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" placeholder={connection === "network" ? "e.g. 192.168.1.50:9100" : "optional"} value={address} onChange={(e) => setAddress(e.target.value)} />
          )}
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
