import React, { useState, useEffect } from "react";
import openSocket from "../../services/socket-io";

import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Container from "@material-ui/core/Container";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import { toast } from "react-toastify";

import api from "../../services/api";
import { i18n } from "../../translate/i18n.js";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
	root: {
		display: "flex",
		alignItems: "center",
		padding: theme.spacing(8, 8, 3),
	},

	paper: {
		padding: theme.spacing(2),
		display: "flex",
		alignItems: "center",
		marginBottom: 12,

	},

	settingOption: {
		marginLeft: "auto",
	},
	margin: {
		margin: theme.spacing(1),
	},

}));

const Settings = () => {
	const classes = useStyles();

	const [settings, setSettings] = useState([]);
	const [queues, setQueues] = useState([]);

	useEffect(() => {
		const fetchSession = async () => {
			try {
				const [{ data: settingsData }, { data: queuesData }] = await Promise.all([
					api.get("/settings"),
					api.get("/queue"),
				]);
				setSettings(settingsData);
				setQueues(queuesData);
			} catch (err) {
				toastError(err);
			}
		};
		fetchSession();
	}, []);

	useEffect(() => {
		const socket = openSocket();

		socket.on("settings", data => {
			if (data.action === "update") {
				setSettings(prevState => {
					const aux = [...prevState];
					const settingIndex = aux.findIndex(s => s.key === data.setting.key);
					aux[settingIndex].value = data.setting.value;
					return aux;
				});
			}
		});

		return () => {
			socket.disconnect();
		};
	}, []);

	const handleChangeSetting = async e => {
		const selectedValue = e.target.value;
		const settingKey = e.target.name;

		try {
			await api.put(`/settings/${settingKey}`, {
				value: selectedValue,
			});
			toast.success(i18n.t("settings.success"));
		} catch (err) {
			toastError(err);
		}
	};

	const getSettingValue = key => {
		const setting = settings.find(s => s.key === key);
		return setting ? setting.value : "";
	};

	return (
		<div className={classes.root}>
			<Container className={classes.container} maxWidth="sm">
				<Typography variant="body2" gutterBottom>
					{i18n.t("settings.title")}
				</Typography>
				<Paper className={classes.paper}>
					<Typography variant="body1">
						{i18n.t("settings.settings.userCreation.name")}
					</Typography>
					<Select
						margin="dense"
						variant="outlined"
						native
						id="userCreation-setting"
						name="userCreation"
						value={
							settings && settings.length > 0 && getSettingValue("userCreation")
						}
						className={classes.settingOption}
						onChange={handleChangeSetting}
					>
						<option value="enabled">
							{i18n.t("settings.settings.userCreation.options.enabled")}
						</option>
						<option value="disabled">
							{i18n.t("settings.settings.userCreation.options.disabled")}
						</option>
					</Select>

				</Paper>

				<Paper className={classes.paper}>
					<TextField
						id="api-token-setting"
						readonly
						label="Token Api"
						margin="dense"
						variant="outlined"
						fullWidth
						value={settings && settings.length > 0 && getSettingValue("userApiToken")}
					/>
				</Paper>

				<Paper className={classes.paper}>
					<Typography variant="body1">
						SLA - Escalonamento ativo
					</Typography>
					<Select
						margin="dense"
						variant="outlined"
						native
						id="slaEscalationEnabled-setting"
						name="slaEscalationEnabled"
						value={
							settings && settings.length > 0
								? getSettingValue("slaEscalationEnabled")
								: "disabled"
						}
						className={classes.settingOption}
						onChange={handleChangeSetting}
					>
						<option value="enabled">Ativado</option>
						<option value="disabled">Desativado</option>
					</Select>
				</Paper>

				<Paper className={classes.paper}>
					<TextField
						key={`slaReplyMinutes-${getSettingValue("slaReplyMinutes") || "30"}`}
						id="slaReplyMinutes-setting"
						label="SLA - Minutos para primeira resposta"
						margin="dense"
						variant="outlined"
						type="number"
						name="slaReplyMinutes"
						defaultValue={
							settings && settings.length > 0
								? getSettingValue("slaReplyMinutes")
								: "30"
						}
						onBlur={handleChangeSetting}
						className={classes.settingOption}
					/>
				</Paper>

				<Paper className={classes.paper}>
					<Typography variant="body1">
						SLA - Fila de escalonamento
					</Typography>
					<Select
						margin="dense"
						variant="outlined"
						native
						id="slaEscalationQueueId-setting"
						name="slaEscalationQueueId"
						value={
							settings && settings.length > 0
								? getSettingValue("slaEscalationQueueId")
								: ""
						}
						className={classes.settingOption}
						onChange={handleChangeSetting}
					>
						<option value="">Manter fila atual</option>
						{queues.map(queue => (
							<option key={queue.id} value={queue.id}>
								{queue.name}
							</option>
						))}
					</Select>
				</Paper>

			</Container>
		</div>
	);
};

export default Settings;
