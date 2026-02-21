import { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import openSocket from "../../services/socket-io";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api, { applyAuthToken, readStoredToken } from "../../services/api";
import toastError from "../../errors/toastError";

const INVALID_TOKEN_ERROR = "ERR_INVALID_TOKEN";
const LEGACY_INVALID_TOKEN_ERROR =
  "Invalid token. We'll try to assign a new one on next request";
const SESSION_EXPIRED_ERROR = "ERR_SESSION_EXPIRED";

const isAuthFailure = error => {
  const status = error?.response?.status;
  const backendErrorCode =
    error?.response?.data?.error || error?.response?.data?.message;

  return (
    status === 401 ||
    status === 403 ||
    backendErrorCode === SESSION_EXPIRED_ERROR ||
    backendErrorCode === INVALID_TOKEN_ERROR ||
    backendErrorCode === LEGACY_INVALID_TOKEN_ERROR
  );
};

const useAuth = () => {
  const history = useHistory();
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({});

  const clearAuthState = () => {
    localStorage.removeItem("token");
    applyAuthToken("");
    setIsAuth(false);
    setUser({});
  };

  const getBackendErrorCode = error => {
    return error?.response?.data?.error || error?.response?.data?.message;
  };

  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use(
      config => {
        const token = readStoredToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      error => Promise.reject(error)
    );

    const responseInterceptor = api.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error?.config;
        const status = error?.response?.status;
        const backendErrorCode = getBackendErrorCode(error);
        const isRefreshRequest =
          originalRequest?.url &&
          String(originalRequest.url).includes("/auth/refresh_token");
        const isAuthLoginRequest =
          originalRequest?.url &&
          String(originalRequest.url).includes("/auth/login");
        const isInvalidTokenError =
          backendErrorCode === INVALID_TOKEN_ERROR ||
          backendErrorCode === LEGACY_INVALID_TOKEN_ERROR;
        const hasStoredToken = Boolean(readStoredToken());

        // Em falha de auth em rotas privadas, tenta renovar token e repetir a request uma vez.
        if (
          originalRequest &&
          !originalRequest._retry &&
          !isRefreshRequest &&
          !isAuthLoginRequest &&
          ((status === 403 && isInvalidTokenError) ||
            (status === 401 && hasStoredToken))
        ) {
          originalRequest._retry = true;

          try {
            const { data } = await api.post("/auth/refresh_token");
            if (data?.token) {
              localStorage.setItem("token", JSON.stringify(data.token));
              applyAuthToken(data.token);
              return api(originalRequest);
            }
          } catch (refreshError) {
            clearAuthState();
            return Promise.reject(refreshError);
          }
        }

        if (
          status === 401 ||
          (isRefreshRequest &&
            status === 403 &&
            (backendErrorCode === SESSION_EXPIRED_ERROR || isInvalidTokenError))
        ) {
          clearAuthState();
        }

        return Promise.reject(error);
      }
    );

    return () => {
      // Keep a single interceptor chain to avoid refresh storms and duplicate retries.
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  useEffect(() => {
    const token = readStoredToken();
    (async () => {
      if (token) {
        applyAuthToken(token);

        try {
          const { data } = await api.post("/auth/refresh_token");
          applyAuthToken(data.token);
          setIsAuth(true);
          setUser(data.user);
        } catch (err) {
          clearAuthState();

          const backendErrorCode = getBackendErrorCode(err);
          if (
            backendErrorCode !== SESSION_EXPIRED_ERROR &&
            backendErrorCode !== INVALID_TOKEN_ERROR &&
            backendErrorCode !== LEGACY_INVALID_TOKEN_ERROR
          ) {
            toastError(err);
          }
        }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!isAuth || !user?.id) return;

    const socket = openSocket();

    socket.on("user", data => {
      if (data.action === "update" && data.user.id === user.id) {
        setUser(data.user);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuth, user?.id]);

  const handleLogin = async userData => {
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", userData);
      localStorage.setItem("token", JSON.stringify(data.token));
      applyAuthToken(data.token);
      setUser(data.user);
      setIsAuth(true);
      toast.success(i18n.t("auth.toasts.success"));
      history.push("/tickets");
      setLoading(false);
    } catch (err) {
      toastError(err);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);

    try {
      await api.delete("/auth/logout");
    } catch (err) {
      // Se a sessao ja expirou no backend, encerra localmente sem exibir erro.
      if (!isAuthFailure(err)) {
        toastError(err);
      }
    } finally {
      clearAuthState();
      setLoading(false);
      history.push("/login");
    }
  };

  return { isAuth, user, loading, handleLogin, handleLogout };
};

export default useAuth;

