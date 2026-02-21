import openSocket from "socket.io-client";
import { getBackendUrl } from "../config";
import { readStoredToken } from "./api";

function connectToSocket() {
    const parsedToken = readStoredToken();

    // Evita conexoes anonimas que so geram 401/403 e ruido de sessao expirada no logout.
    if (!parsedToken) {
      return openSocket(getBackendUrl(), {
        autoConnect: false,
        transports: ["websocket", "polling"]
      });
    }

    return openSocket(getBackendUrl(), {
      transports: ["websocket", "polling"],
      query: {
        token: parsedToken
      }
    });
}

export default connectToSocket;
