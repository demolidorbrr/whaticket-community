import React, { useEffect, useState } from "react";
import QRCode from "qrcode.react";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";

import { Dialog, DialogContent, Paper, Typography } from "@material-ui/core";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";

const SESSION_EXPIRED_ERROR = "ERR_SESSION_EXPIRED";
const INVALID_TOKEN_ERROR = "ERR_INVALID_TOKEN";
const LEGACY_INVALID_TOKEN_ERROR =
	"Invalid token. We'll try to assign a new one on next request";

const shouldCloseQrModal = session => {
	const status = String(session?.status || "").toUpperCase();
	return status === "CONNECTED" || session?.qrcode === "";
};

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

const QrcodeModal = ({ open, onClose, whatsAppId }) => {
	const [qrCode, setQrCode] = useState("");

	useEffect(() => {
		if (!open || !whatsAppId) return;

		let isMounted = true;

		const fetchSession = async () => {
			try {
				const { data } = await api.get(`/whatsapp/${whatsAppId}`);
				if (!isMounted) return;

				// Fecha o modal imediatamente quando a sessao ja conectou.
				if (shouldCloseQrModal(data)) {
					setQrCode("");
					onClose();
					return;
				}

				setQrCode(data.qrcode || "");
			} catch (err) {
				if (!isMounted) return;

				if (!isAuthError(err)) {
					toastError(err);
				}
			}
		};

		fetchSession();

		return () => {
			isMounted = false;
		};
	}, [open, whatsAppId, onClose]);

	useEffect(() => {
		if (!open || !whatsAppId) return;

		const socket = openSocket();

		socket.on("whatsappSession", data => {
			const session = data?.session;
			const currentSessionId = Number(session?.id);
			const selectedSessionId = Number(whatsAppId);

			if (data?.action !== "update" || currentSessionId !== selectedSessionId) {
				return;
			}

			if (shouldCloseQrModal(session)) {
				setQrCode("");
				onClose();
				return;
			}

			setQrCode(session?.qrcode || "");
		});

		return () => {
			socket.disconnect();
		};
	}, [open, whatsAppId, onClose]);

	return (
		<Dialog open={open} onClose={onClose} maxWidth="lg" scroll="paper">
			<DialogContent>
				<Paper elevation={0}>
					<Typography color="primary" gutterBottom>
						{i18n.t("qrCode.message")}
					</Typography>
					{qrCode ? (
						<QRCode value={qrCode} size={256} />
					) : (
						<span>Waiting for QR Code</span>
					)}
				</Paper>
			</DialogContent>
		</Dialog>
	);
};

export default React.memo(QrcodeModal);
