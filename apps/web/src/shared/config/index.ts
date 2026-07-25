export const config = {
  apiBaseUrl: "/api",
  wsUrl:
    typeof window === "undefined"
      ? "ws://localhost:3001/ws"
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`,
} as const;
