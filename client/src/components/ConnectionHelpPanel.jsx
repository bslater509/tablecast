import { useState, useEffect } from "react";

export default function ConnectionHelpPanel({ user }) {
  const [ips, setIps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIpIndex, setSelectedIpIndex] = useState(0);

  useEffect(() => {
    async function fetchIps() {
      try {
        const res = await fetch("/api/network-ip");
        if (res.ok) {
          const data = await res.json();
          // Filter out loopback or empty results, default to current host if empty
          const filteredIps = data.ips && data.ips.length > 0 ? data.ips : [window.location.hostname];
          setIps(filteredIps);
        } else {
          setIps([window.location.hostname]);
        }
      } catch (err) {
        console.error("Failed to load LAN IPs:", err);
        setIps([window.location.hostname]);
      } finally {
        setLoading(false);
      }
    }
    fetchIps();
  }, []);

  const currentPort = window.location.port ? `:${window.location.port}` : "";
  const activeIp = ips[selectedIpIndex] || window.location.hostname;
  const joinUrl = `http://${activeIp}${currentPort}`;
  const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=260x260&chl=${encodeURIComponent(joinUrl)}&choe=UTF-8`;

  return (
    <div style={styles.container} className="fade-in">
      <div style={styles.card} className="glass-panel gold-border-glow">
        <h2 style={styles.title}>Connect Mobile Players</h2>
        <p style={styles.subtitle}>
          Players can join the campaign from their mobile devices by scanning this QR code.
        </p>

        {loading ? (
          <div style={styles.loadingContainer}>
            <span style={styles.spinner}>🎲</span>
            <p style={styles.loadingText}>Locating tavern address...</p>
          </div>
        ) : (
          <div style={styles.body}>
            {/* Wi-Fi Alert */}
            <div style={styles.wifiAlert}>
              <span style={styles.wifiIcon}>📶</span>
              <span style={styles.wifiText}>
                Make sure players are connected to the <strong>same Wi-Fi network</strong> as this server.
              </span>
            </div>

            {/* QR Code Container */}
            <div style={styles.qrContainer}>
              <img
                src={qrUrl}
                alt="Session QR Code"
                style={styles.qrImage}
                className="gold-border-glow"
              />
            </div>

            {/* Connection Address */}
            <div style={styles.addressBox}>
              <span style={styles.addressLabel}>Connection URL</span>
              <a href={joinUrl} target="_blank" rel="noopener noreferrer" style={styles.addressUrl}>
                {joinUrl}
              </a>
            </div>

            {/* IP Selector (if multiple exist) */}
            {ips.length > 1 && (
              <div style={styles.ipSelectorContainer}>
                <label style={styles.selectorLabel}>Select Network Adapter:</label>
                <select
                  value={selectedIpIndex}
                  onChange={(e) => setSelectedIpIndex(Number(e.target.value))}
                  style={styles.select}
                  className="form-input"
                >
                  {ips.map((ip, idx) => (
                    <option key={idx} value={idx}>
                      {ip} (Interface #{idx + 1})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    width: "100%",
    background: "linear-gradient(135deg, #09080e 0%, #151329 100%)",
    padding: "1.5rem",
    boxSizing: "border-box",
  },
  card: {
    maxWidth: "420px",
    width: "100%",
    padding: "2rem",
    borderRadius: "12px",
    textAlign: "center",
    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.6)",
  },
  title: {
    fontSize: "1.6rem",
    color: "var(--color-accent)",
    margin: "0 0 0.5rem 0",
    fontWeight: 700,
    textShadow: "0 0 10px rgba(200, 151, 58, 0.2)",
  },
  subtitle: {
    fontSize: "0.88rem",
    color: "var(--color-muted)",
    margin: "0 0 1.5rem 0",
    lineHeight: "1.4",
  },
  loadingContainer: {
    padding: "2rem 0",
  },
  spinner: {
    fontSize: "2.5rem",
    display: "inline-block",
    animation: "spin 2s linear infinite",
  },
  loadingText: {
    fontSize: "0.9rem",
    color: "var(--color-muted)",
    marginTop: "1rem",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  wifiAlert: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    background: "rgba(200, 151, 58, 0.06)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    borderRadius: "8px",
    padding: "0.75rem",
    textAlign: "left",
  },
  wifiIcon: {
    fontSize: "1.2rem",
  },
  wifiText: {
    fontSize: "0.8rem",
    color: "var(--color-text)",
    lineHeight: "1.35",
  },
  qrContainer: {
    display: "flex",
    justifyContent: "center",
    margin: "0.5rem 0",
  },
  qrImage: {
    width: "240px",
    height: "240px",
    padding: "0.5rem",
    background: "#ffffff",
    borderRadius: "8px",
    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.4)",
  },
  addressBox: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "8px",
    padding: "0.85rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  addressLabel: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: "bold",
  },
  addressUrl: {
    fontSize: "1.1rem",
    color: "var(--color-accent)",
    fontWeight: "bold",
    textDecoration: "none",
    wordBreak: "break-all",
  },
  ipSelectorContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
    textAlign: "left",
  },
  selectorLabel: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    fontWeight: "600",
  },
  select: {
    width: "100%",
    padding: "0.55rem",
    fontSize: "0.85rem",
    background: "rgba(0, 0, 0, 0.3)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "var(--color-text)",
    borderRadius: "6px",
    cursor: "pointer",
  },
};
