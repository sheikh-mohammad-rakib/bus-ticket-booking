import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DICT, bnDigits } from "./bn.js";
import { setUiLang } from "./api.js";

// English ⇄ বাংলা. The English copy is its own key: in "bn" mode t()
// substitutes the Bangla rendering from DICT; in "en" mode it returns the
// key untouched — so a missing entry can never blank out the UI.
// {var} placeholders interpolate; numbers become Bengali numerals in bn.
const LS_KEY = "riders_lang";
const LangCtx = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved === "bn" || saved === "en") return saved;
    } catch { /* storage blocked — default below */ }
    return "en";
  });

  // Sync non-React consumers (money/fmtDate/fmtDuration read uiLang) and the
  // document BEFORE children render — otherwise the first pass after toggling
  // shows one stale render of English formatting.
  setUiLang(lang);
  document.documentElement.lang = lang;

  // Persist the choice.
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, lang); } catch { /* ok */ }
  }, [lang]);

  const t = useMemo(() => {
    const bn = lang === "bn";
    return (s, vars) => {
      let out = bn ? (DICT[s] ?? s) : s;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.split(`{${k}}`).join(bn && typeof v === "number" ? bnDigits(v) : v);
        }
      }
      return out;
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
