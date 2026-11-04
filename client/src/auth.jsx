import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api.js";

const AuthCtx = createContext({ user: null, ready: false });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me()
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const value = {
    user,
    ready,
    signIn: (payload) =>
      api.login(payload).then((r) => {
        setUser(r.user);
        return r.user;
      }),
    signUp: (payload) =>
      api.register(payload).then((r) => {
        setUser(r.user);
        return r.user;
      }),
    signOut: () =>
      api.logout().catch(() => {}).then(() => setUser(null)),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
