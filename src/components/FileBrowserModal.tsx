// Controller-navigable filesystem browser for picking ROM folders, emulator binaries,
// BIOS directories, and per-game config files without touching a mouse or keyboard.

import React, { useEffect, useState } from "react";
import { api, DirListing, formatBytes, Place } from "../api";
import { usePad } from "../input";
import { useStore } from "../store";

export const FileBrowserModal: React.FC = () => {
  const { fileBrowserModal, closeFileBrowser, pushToast } = useStore();
  const [places, setPlaces] = useState<Place[]>([]);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [pane, setPane] = useState<"places" | "entries">("entries");
  const [placeIdx, setPlaceIdx] = useState(0);
  const [entryIdx, setEntryIdx] = useState(0);

  const loadDir = async (path: string | null, hidden = showHidden) => {
    if (!fileBrowserModal) return;
    try {
      const res = await api.listDir(path, fileBrowserModal.pickMode === "file", hidden);
      setListing(res);
      setEntryIdx(0);
    } catch (e) {
      pushToast(`Cannot open folder: ${String(e)}`, "error");
    }
  };

  useEffect(() => {
    if (!fileBrowserModal) return;
    api.getPlaces().then(setPlaces).catch(() => {});
    setPane("entries");
    loadDir(fileBrowserModal.initialPath ?? null, showHidden);
  }, [fileBrowserModal]);

  usePad(
    (btn) => {
      if (!fileBrowserModal) return false;
      const entries = listing?.entries || [];

      if (btn === "left" && pane === "entries") {
        setPane("places");
        return true;
      }
      if (btn === "right" && pane === "places") {
        setPane("entries");
        return true;
      }

      if (btn === "up") {
        if (pane === "places") {
          setPlaceIdx((i) => Math.max(0, i - 1));
        } else {
          setEntryIdx((i) => Math.max(0, i - 1));
        }
      } else if (btn === "down") {
        if (pane === "places") {
          setPlaceIdx((i) => Math.min(places.length - 1, i + 1));
        } else {
          setEntryIdx((i) => Math.min(Math.max(0, entries.length - 1), i + 1));
        }
      } else if (btn === "a") {
        if (pane === "places") {
          const p = places[placeIdx];
          if (p) {
            loadDir(p.path);
            setPane("entries");
          }
        } else {
          const item = entries[entryIdx];
          if (!item) {
            if (fileBrowserModal.pickMode === "dir" && listing) {
              fileBrowserModal.onPick(listing.path);
              closeFileBrowser();
            }
            return true;
          }
          if (item.isDir) {
            loadDir(item.path);
          } else if (fileBrowserModal.pickMode === "file") {
            fileBrowserModal.onPick(item.path);
            closeFileBrowser();
          }
        }
      } else if (btn === "x") {
        if (fileBrowserModal.pickMode === "dir" && listing) {
          fileBrowserModal.onPick(listing.path);
          closeFileBrowser();
        } else if (fileBrowserModal.pickMode === "file" && entries[entryIdx] && !entries[entryIdx].isDir) {
          fileBrowserModal.onPick(entries[entryIdx].path);
          closeFileBrowser();
        }
      } else if (btn === "y") {
        const next = !showHidden;
        setShowHidden(next);
        loadDir(listing?.path ?? null, next);
      } else if (btn === "lb") {
        if (listing?.parent) loadDir(listing.parent);
      } else if (btn === "b") {
        closeFileBrowser();
      }
      return true;
    },
    25,
    Boolean(fileBrowserModal)
  );

  if (!fileBrowserModal) return null;

  const entries = listing?.entries || [];

  return (
    <div className="modal-backdrop" onClick={closeFileBrowser}>
      <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fb-header">
          <div>
            <h3>{fileBrowserModal.title}</h3>
            <div className="fb-path">{listing?.path || "…"}</div>
          </div>
          <div className="fb-header-actions">
            {listing?.parent && (
              <button className="btn-ghost" onClick={() => loadDir(listing.parent)}>
                ↑ Parent (LB)
              </button>
            )}
            <button
              className="btn-ghost"
              onClick={() => {
                const next = !showHidden;
                setShowHidden(next);
                loadDir(listing?.path ?? null, next);
              }}
            >
              {showHidden ? "Hide" : "Show"} Hidden (Y)
            </button>
            {fileBrowserModal.pickMode === "dir" && listing && (
              <button
                className="btn-primary"
                onClick={() => {
                  fileBrowserModal.onPick(listing.path);
                  closeFileBrowser();
                }}
              >
                Select This Folder (X)
              </button>
            )}
          </div>
        </div>

        <div className="fb-body">
          <aside className={`fb-places ${pane === "places" ? "active-pane" : ""}`}>
            <div className="fb-section-title">Quick Places</div>
            {places.map((p, idx) => (
              <button
                key={p.path}
                className={`fb-place-item ${pane === "places" && idx === placeIdx ? "focused" : ""}`}
                onClick={() => {
                  setPlaceIdx(idx);
                  loadDir(p.path);
                }}
              >
                <span>📁</span>
                <span>{p.name}</span>
              </button>
            ))}
          </aside>

          <section className={`fb-entries ${pane === "entries" ? "active-pane" : ""}`}>
            {entries.length === 0 ? (
              <div className="fb-empty">
                No {fileBrowserModal.pickMode === "dir" ? "subfolders" : "items"} in this directory.
                {fileBrowserModal.pickMode === "dir" && " Press X to select this folder."}
              </div>
            ) : (
              entries.map((item, idx) => (
                <button
                  key={item.path}
                  className={`fb-entry-row ${pane === "entries" && idx === entryIdx ? "focused" : ""}`}
                  onMouseEnter={() => {
                    setPane("entries");
                    setEntryIdx(idx);
                  }}
                  onClick={() => {
                    if (item.isDir) {
                      loadDir(item.path);
                    } else if (fileBrowserModal.pickMode === "file") {
                      fileBrowserModal.onPick(item.path);
                      closeFileBrowser();
                    }
                  }}
                >
                  <span className="fb-entry-icon">{item.isDir ? "📂" : "📄"}</span>
                  <span className="fb-entry-name">{item.name}</span>
                  {!item.isDir && <span className="fb-entry-size">{formatBytes(item.size)}</span>}
                </button>
              ))
            )}
          </section>
        </div>

        <div className="fb-footer">
          <span>
            <b>A</b> Open / Select · <b>LB</b> Parent Dir · <b>X</b> Choose Current Folder · <b>Y</b> Toggle Dotfiles · <b>B</b> Cancel
          </span>
        </div>
      </div>
    </div>
  );
};
