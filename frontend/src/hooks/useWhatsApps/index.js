import { useContext, useState, useEffect, useReducer } from "react";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";

import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";

const SESSION_EXPIRED_ERROR = "ERR_SESSION_EXPIRED";
const INVALID_TOKEN_ERROR = "ERR_INVALID_TOKEN";
const LEGACY_INVALID_TOKEN_ERROR =
	"Invalid token. We'll try to assign a new one on next request";

const isAuthError = err => {
	const status = err?.response?.status;
	const errorCode = err?.response?.data?.error || err?.response?.data?.message;

	return (
		status === 401 ||
		errorCode === SESSION_EXPIRED_ERROR ||
		errorCode === INVALID_TOKEN_ERROR ||
		errorCode === LEGACY_INVALID_TOKEN_ERROR
	);
};

const reducer = (state, action) => {
	if (action.type === "LOAD_WHATSAPPS") {
		const whatsApps = action.payload;

		return [...whatsApps];
	}

	if (action.type === "UPDATE_WHATSAPPS") {
		const whatsApp = action.payload;
		const whatsAppIndex = state.findIndex(s => s.id === whatsApp.id);

		if (whatsAppIndex !== -1) {
			state[whatsAppIndex] = whatsApp;
			return [...state];
		} else {
			return [whatsApp, ...state];
		}
	}

	if (action.type === "UPDATE_SESSION") {
		const whatsApp = action.payload;
		const whatsAppIndex = state.findIndex(s => s.id === whatsApp.id);

		if (whatsAppIndex !== -1) {
			state[whatsAppIndex].status = whatsApp.status;
			state[whatsAppIndex].updatedAt = whatsApp.updatedAt;
			state[whatsAppIndex].qrcode = whatsApp.qrcode;
			state[whatsAppIndex].retries = whatsApp.retries;
			return [...state];
		} else {
			return [...state];
		}
	}

	if (action.type === "DELETE_WHATSAPPS") {
		const whatsAppId = action.payload;

		const whatsAppIndex = state.findIndex(s => s.id === whatsAppId);
		if (whatsAppIndex !== -1) {
			state.splice(whatsAppIndex, 1);
		}
		return [...state];
	}

	if (action.type === "RESET") {
		return [];
	}

	return state;
};

const useWhatsApps = () => {
	const [whatsApps, dispatch] = useReducer(reducer, []);
	const [loading, setLoading] = useState(true);
	const { isAuth, loading: authLoading } = useContext(AuthContext);

	useEffect(() => {
		if (authLoading) {
			setLoading(true);
			return;
		}

		if (!isAuth) {
			dispatch({ type: "RESET" });
			setLoading(false);
			return;
		}

		let isMounted = true;
		setLoading(true);

		const fetchSession = async () => {
			try {
				const { data } = await api.get("/whatsapp/");
				if (!isMounted) return;
				dispatch({ type: "LOAD_WHATSAPPS", payload: data });
				setLoading(false);
			} catch (err) {
				if (!isMounted) return;
				setLoading(false);

				// O logout/refresh ja e tratado no interceptor global de auth.
				if (!isAuthError(err)) {
					toastError(err);
				}
			}
		};

		fetchSession();

		return () => {
			isMounted = false;
		};
	}, [authLoading, isAuth]);

	useEffect(() => {
		if (!isAuth) return;

		const socket = openSocket();
		const handleWhatsAppEvent = data => {
			if (data.action === "update") {
				dispatch({ type: "UPDATE_WHATSAPPS", payload: data.whatsapp });
			}

			if (data.action === "delete") {
				dispatch({ type: "DELETE_WHATSAPPS", payload: data.whatsappId });
			}
		};

		const handleWhatsAppSessionEvent = data => {
			if (data.action === "update") {
				dispatch({ type: "UPDATE_SESSION", payload: data.session });
			}
		};

		socket.on("whatsapp", handleWhatsAppEvent);
		socket.on("whatsappSession", handleWhatsAppSessionEvent);

		return () => {
			socket.disconnect();
		};
	}, [isAuth]);

	return { whatsApps, loading };
};

export default useWhatsApps;
