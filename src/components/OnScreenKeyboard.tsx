// Controller-navigable On-Screen Keyboard modal (also accepts physical keyboard typing).

import React, { useEffect, useState } from "react";
import { usePad } from "../input";
import { useStore } from "../store";

const ROWS_LOWER = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "_"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "/", "."],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ":", "=", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", "(", ")", "[", "]"],
  ["SHIFT", "SPACE", "BACK", "CLEAR", "DONE"],
];

const ROWS_UPPER = [
  ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "+", "_"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "/", "."],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", ":", "=", "\""],
  ["Z", "X", "C", "V", "B", "N", "M", ";", "<", ">", "{", "}"],
  ["SHIFT", "SPACE", "BACK", "CLEAR", "DONE"],
];

export const OnScreenKeyboard: React.FC = () => {
  const { keyboardModal, closeKeyboard } = useStore();
  const [value, setValue] = useState("");
  const [upper, setUpper] = useState(false);
  const [row, setRow] = useState(1);
  const [col, setCol] = useState(0);

  useEffect(() => {
    if (keyboardModal) {
      setValue(keyboardModal.initial || "");
      setRow(1);
      setCol(0);
    }
  }, [keyboardModal]);

  const rows = upper ? ROWS_UPPER : ROWS_LOWER;

  const activateKey = (key: string) => {
    if (!keyboardModal) return;
    if (key === "SHIFT") {
      setUpper((u) => !u);
    } else if (key === "SPACE") {
      setValue((v) => v + " ");
    } else if (key === "BACK") {
      setValue((v) => v.slice(0, -1));
    } else if (key === "CLEAR") {
      setValue("");
    } else if (key === "DONE") {
      keyboardModal.onSubmit(value);
      closeKeyboard();
    } else {
      setValue((v) => v + key);
    }
  };

  usePad(
    (btn) => {
      if (!keyboardModal) return false;
      const curRow = rows[row] || rows[0];
      if (btn === "up") {
        const nextRow = (row - 1 + rows.length) % rows.length;
        setRow(nextRow);
        setCol((c) => Math.min(c, rows[nextRow].length - 1));
      } else if (btn === "down") {
        const nextRow = (row + 1) % rows.length;
        setRow(nextRow);
        setCol((c) => Math.min(c, rows[nextRow].length - 1));
      } else if (btn === "left") {
        setCol((c) => (c - 1 + curRow.length) % curRow.length);
      } else if (btn === "right") {
        setCol((c) => (c + 1) % curRow.length);
      } else if (btn === "a") {
        activateKey(curRow[Math.min(col, curRow.length - 1)]);
      } else if (btn === "x") {
        setValue((v) => v.slice(0, -1));
      } else if (btn === "y") {
        setValue((v) => v + " ");
      } else if (btn === "start") {
        keyboardModal.onSubmit(value);
        closeKeyboard();
      } else if (btn === "b") {
        closeKeyboard();
      }
      return true;
    },
    30,
    Boolean(keyboardModal)
  );

  if (!keyboardModal) return null;

  return (
    <div className="modal-backdrop" onClick={closeKeyboard}>
      <div className="osk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="osk-header">
          <h3>{keyboardModal.title}</h3>
          <span className="osk-sub">
            D-Pad to navigate · <b>A</b> type · <b>X</b> backspace · <b>Y</b> space · <b>Start</b> confirm
          </span>
        </div>

        <input
          className="osk-input"
          value={value}
          placeholder={keyboardModal.placeholder || "Enter text…"}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              keyboardModal.onSubmit(value);
              closeKeyboard();
            } else if (e.key === "Escape") {
              e.preventDefault();
              closeKeyboard();
            }
          }}
        />

        <div className="osk-grid">
          {rows.map((r, rIdx) => (
            <div key={rIdx} className="osk-row">
              {r.map((k, cIdx) => {
                const isFocused = rIdx === row && cIdx === col;
                const wide = k.length > 1;
                return (
                  <button
                    key={`${rIdx}-${k}`}
                    className={`osk-key ${wide ? "wide" : ""} ${k === "DONE" ? "primary" : ""} ${
                      isFocused ? "focused" : ""
                    }`}
                    onMouseEnter={() => {
                      setRow(rIdx);
                      setCol(cIdx);
                    }}
                    onClick={() => activateKey(k)}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
