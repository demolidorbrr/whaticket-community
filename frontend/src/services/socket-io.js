import openSocket from "socket.io-client";
import { getBackendUrl } from "../config";

function connectToSocket() {
    const token = localStorage.getItem("token");
    let parsedToken = "";

    try {
      parsedToken = token ? JSON.parse(token) : "";
    } catch (error) {
      parsedToken = token || "";
    }

    return openSocket(getBackendUrl(), {
      transports: ["websocket", "polling"],
      query: {
        token: parsedToken,
      },
    });
}

export default connectToSocket;
