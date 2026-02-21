import axios from "axios";
import { getBackendUrl } from "../config";

const parseStoredToken = rawToken => {
	try {
		const parsedToken = JSON.parse(rawToken);
		return typeof parsedToken === "string" ? parsedToken : "";
	} catch (error) {
		// Compatibilidade com tokens antigos salvos sem JSON.stringify.
		return rawToken || "";
	}
};

export const readStoredToken = () => {
	try {
		const rawToken = localStorage.getItem("token");
		if (!rawToken) return "";
		return parseStoredToken(rawToken);
	} catch (error) {
		return "";
	}
};

const api = axios.create({
	baseURL: getBackendUrl(),
	withCredentials: true,
});

export const applyAuthToken = token => {
	if (token) {
		api.defaults.headers.Authorization = `Bearer ${token}`;
		return;
	}

	delete api.defaults.headers.Authorization;
};

// Inicializa o header de auth antes do primeiro request para evitar 401 no F5.
applyAuthToken(readStoredToken());

export default api;
