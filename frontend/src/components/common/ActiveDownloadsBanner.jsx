import useDownloadStore from "../../stores/downloadStore";
import { useI18nStore } from "../../stores/i18nStore";
import { IconDownload, IconMusic } from "./Icons";

export default function ActiveDownloadsBanner({ showAlways = false }) {
  const activeDownloads = useDownloadStore((s) => s.activeDownloads);
  const t = useI18nStore((s) => s.t);

  const items = Object.values(activeDownloads);
  if (items.length === 0 && !showAlways) return null;
  if (items.length === 0) return null;

  const getStageLabel = (stage) => {
    switch (stage) {
      case "preparing":
        return t("download.preparing");
      case "downloading":
        return t("download.downloading");
      case "saving":
        return t("download.saving");
      case "completed":
        return t("download.completed");
      case "error":
        return t("download.failed");
      default:
        return t("download.downloading");
    }
  };

  const formatMb = (bytes) => {
    if (!bytes || bytes <= 0) return "";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="active-downloads-card">
      <div className="active-downloads-header">
        <div className="active-downloads-title-group">
          <div className="active-downloads-icon">
            <IconDownload size={18} />
          </div>
          <span className="active-downloads-title">{t("download.activeTitle")}</span>
          <span className="active-downloads-badge">
            {items.length} {t("download.activeCount")}
          </span>
        </div>
      </div>

      <div className="active-downloads-list">
        {items.map((item) => {
          const song = item.song || {};
          const cover = song.cover_art_url || song.thumbnail;
          const pct = Math.min(100, Math.max(0, item.progress || 0));
          const isDone = item.stage === "completed";
          const isErr = item.stage === "error";

          return (
            <div
              key={item.key}
              className={`active-download-item ${isDone ? "completed" : ""} ${isErr ? "error" : ""}`}
            >
              <div className="active-download-top">
                <div className="active-download-meta">
                  {cover ? (
                    <img src={cover} alt="" className="active-download-cover" />
                  ) : (
                    <div
                      className="active-download-cover"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(255,255,255,0.06)",
                      }}
                    >
                      <IconMusic size={18} style={{ opacity: 0.6 }} />
                    </div>
                  )}
                  <div className="active-download-info">
                    <div className="active-download-title" title={song.title}>
                      {song.title || "Unknown Title"}
                    </div>
                    <div className="active-download-subtitle">
                      <span>{song.artist || "Unknown Artist"}</span>
                      <span>·</span>
                      <span className="active-download-stage">
                        {isErr ? (item.error || t("download.failed")) : getStageLabel(item.stage)}
                      </span>
                      {item.bytesReceived > 0 && !isDone && (
                        <span>
                          · {formatMb(item.bytesReceived)}
                          {item.totalBytes > 0 ? ` / ${formatMb(item.totalBytes)}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="active-download-pct">
                  {isDone ? "✓ 100%" : isErr ? "!" : `${pct}%`}
                </div>
              </div>

              {/* Real-time Progress Bar */}
              <div className="active-download-bar-track">
                <div
                  className="active-download-bar-fill"
                  style={{
                    width: `${pct}%`,
                    background: isDone
                      ? "#10b981"
                      : isErr
                      ? "#ef4444"
                      : "linear-gradient(90deg, #10b981, #1ed760)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
