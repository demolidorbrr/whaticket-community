import React, { useState, useEffect, useRef } from "react";

import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Switch from "@material-ui/core/Switch";
import MenuItem from "@material-ui/core/MenuItem";
import Divider from "@material-ui/core/Divider";

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import ColorPicker from "../ColorPicker";
import { IconButton, InputAdornment } from "@material-ui/core";
import { Colorize } from "@material-ui/icons";

const useStyles = makeStyles(theme => ({
	root: {
		display: "flex",
		flexWrap: "wrap",
	},
	textField: {
		marginRight: theme.spacing(1),
		flex: 1,
	},

	btnWrapper: {
		position: "relative",
	},

	buttonProgress: {
		color: green[500],
		position: "absolute",
		top: "50%",
		left: "50%",
		marginTop: -12,
		marginLeft: -12,
	},
	formControl: {
		margin: theme.spacing(1),
		minWidth: 120,
	},
	colorAdorment: {
		width: 20,
		height: 20,
	},
}));

const QueueSchema = Yup.object().shape({
	name: Yup.string()
		.min(2, "Too Short!")
		.max(50, "Too Long!")
		.required("Required"),
	color: Yup.string().min(3, "Too Short!").max(9, "Too Long!").required(),
	greetingMessage: Yup.string(),
	aiEnabled: Yup.boolean(),
	aiMode: Yup.string().oneOf(["triage", "initial_reply", "hybrid"]),
	aiAutoReply: Yup.boolean(),
	aiPrompt: Yup.string(),
	aiWebhookUrl: Yup.string().url("URL invalida").nullable().notRequired(),
});

const QueueModal = ({ open, onClose, queueId, onSaved }) => {
	const classes = useStyles();

	const initialState = {
		name: "",
		color: "#1976d2",
		greetingMessage: "",
		aiEnabled: false,
		aiMode: "triage",
		aiAutoReply: false,
		aiPrompt: "",
		aiWebhookUrl: "",
	};

	const [colorPickerModalOpen, setColorPickerModalOpen] = useState(false);
	const [queue, setQueue] = useState(initialState);
	const greetingRef = useRef();

	useEffect(() => {
		(async () => {
			if (!queueId) return;
			try {
				const { data } = await api.get(`/queue/${queueId}`);
				setQueue(prevState => {
					// Normaliza tipos vindos da API (0/1, null) para o estado do formulario.
					return {
						...prevState,
						...data,
						aiEnabled: Boolean(data.aiEnabled),
						aiAutoReply: Boolean(data.aiAutoReply),
						aiMode: data.aiMode || "triage",
						aiPrompt: data.aiPrompt || "",
						aiWebhookUrl: data.aiWebhookUrl || "",
					};
				});
			} catch (err) {
				toastError(err);
			}
		})();

		return () => {
			setQueue(initialState);
		};
	}, [queueId, open]);

	const handleClose = () => {
		onClose();
		setQueue(initialState);
	};

	const handleSaveQueue = async values => {
		// Garante payload consistente para backend e evita "desativacao fantasma".
		const payload = {
			...values,
			name: values.name?.trim(),
			color: values.color,
			greetingMessage: values.greetingMessage || "",
			aiEnabled: Boolean(values.aiEnabled),
			aiMode: values.aiMode || "triage",
			aiAutoReply: Boolean(values.aiEnabled) ? Boolean(values.aiAutoReply) : false,
			aiPrompt: values.aiPrompt ?? "",
			aiWebhookUrl: values.aiWebhookUrl ?? "",
		};

		try {
			let savedQueue;
			if (queueId) {
				const { data } = await api.put(`/queue/${queueId}`, payload);
				savedQueue = data;
			} else {
				const { data } = await api.post("/queue", payload);
				savedQueue = data;
			}

			if (typeof onSaved === "function" && savedQueue) {
				onSaved(savedQueue);
			}

			toast.success("Queue saved successfully");
			handleClose();
		} catch (err) {
			toastError(err);
		}
	};

	return (
		<div className={classes.root}>
			<Dialog open={open} onClose={handleClose} scroll="paper">
				<DialogTitle>
					{queueId
						? `${i18n.t("queueModal.title.edit")}`
						: `${i18n.t("queueModal.title.add")}`}
				</DialogTitle>
				<Formik
					initialValues={queue}
					enableReinitialize={true}
					validationSchema={QueueSchema}
					onSubmit={(values, actions) => {
						setTimeout(() => {
							handleSaveQueue(values);
							actions.setSubmitting(false);
						}, 400);
					}}
				>
					{({ touched, errors, isSubmitting, values, setFieldValue }) => (
						<Form>
							<DialogContent dividers>
								<Field
									as={TextField}
									label={i18n.t("queueModal.form.name")}
									autoFocus
									name="name"
									error={touched.name && Boolean(errors.name)}
									helperText={touched.name && errors.name}
									variant="outlined"
									margin="dense"
									className={classes.textField}
								/>
								<Field
									as={TextField}
									label={i18n.t("queueModal.form.color")}
									name="color"
									id="color"
									onFocus={() => {
										setColorPickerModalOpen(true);
										greetingRef.current.focus();
									}}
									error={touched.color && Boolean(errors.color)}
									helperText={touched.color && errors.color}
									InputProps={{
										startAdornment: (
											<InputAdornment position="start">
												<div
													style={{ backgroundColor: values.color }}
													className={classes.colorAdorment}
												></div>
											</InputAdornment>
										),
										endAdornment: (
											<IconButton
												size="small"
												color="default"
												onClick={() => setColorPickerModalOpen(true)}
											>
												<Colorize />
											</IconButton>
										),
									}}
									variant="outlined"
									margin="dense"
								/>
								<ColorPicker
									open={colorPickerModalOpen}
									handleClose={() => setColorPickerModalOpen(false)}
									onChange={color => {
										setFieldValue("color", color);
										setQueue(() => {
											return { ...values, color };
										});
									}}
								/>
								<div>
									<Field
										as={TextField}
										label={i18n.t("queueModal.form.greetingMessage")}
										type="greetingMessage"
										multiline
										inputRef={greetingRef}
										rows={5}
										fullWidth
										name="greetingMessage"
										error={
											touched.greetingMessage && Boolean(errors.greetingMessage)
										}
										helperText={
											touched.greetingMessage && errors.greetingMessage
										}
										variant="outlined"
										margin="dense"
									/>
								</div>
								<Divider style={{ margin: "16px 0" }} />
								<FormControlLabel
									control={
										<Switch
											checked={Boolean(values.aiEnabled)}
											onChange={e => {
												setFieldValue("aiEnabled", e.target.checked);
												if (!e.target.checked) {
													setFieldValue("aiAutoReply", false);
												}
											}}
											color="primary"
										/>
									}
									label="Assistente IA por fila"
								/>

								<Field
									as={TextField}
									select
									fullWidth
									label="Modo da IA"
									name="aiMode"
									value={values.aiMode || "triage"}
									onChange={e => setFieldValue("aiMode", e.target.value)}
									margin="dense"
									variant="outlined"
									disabled={!values.aiEnabled}
									error={touched.aiMode && Boolean(errors.aiMode)}
									helperText={touched.aiMode && errors.aiMode}
								>
									<MenuItem value="triage">Triagem</MenuItem>
									<MenuItem value="initial_reply">Resposta inicial</MenuItem>
										<MenuItem value="hybrid">Hibrido</MenuItem>
								</Field>

								<FormControlLabel
									control={
										<Switch
											checked={Boolean(values.aiAutoReply)}
											onChange={e =>
												setFieldValue("aiAutoReply", e.target.checked)
											}
											color="primary"
											disabled={!values.aiEnabled}
										/>
									}
									label="Responder automaticamente"
								/>

								<Field
									as={TextField}
									fullWidth
									label="Webhook n8n (opcional)"
									name="aiWebhookUrl"
									margin="dense"
									variant="outlined"
									disabled={!values.aiEnabled}
									error={touched.aiWebhookUrl && Boolean(errors.aiWebhookUrl)}
									helperText={touched.aiWebhookUrl && errors.aiWebhookUrl}
								/>

								<Field
									as={TextField}
									label="Prompt da IA"
									type="aiPrompt"
									multiline
									rows={4}
									fullWidth
									name="aiPrompt"
									error={touched.aiPrompt && Boolean(errors.aiPrompt)}
									helperText={touched.aiPrompt && errors.aiPrompt}
									variant="outlined"
									margin="dense"
									disabled={!values.aiEnabled}
								/>
							</DialogContent>
							<DialogActions>
								<Button
									onClick={handleClose}
									color="secondary"
									disabled={isSubmitting}
									variant="outlined"
								>
									{i18n.t("queueModal.buttons.cancel")}
								</Button>
								<Button
									type="submit"
									color="primary"
									disabled={isSubmitting}
									variant="contained"
									className={classes.btnWrapper}
								>
									{queueId
										? `${i18n.t("queueModal.buttons.okEdit")}`
										: `${i18n.t("queueModal.buttons.okAdd")}`}
									{isSubmitting && (
										<CircularProgress
											size={24}
											className={classes.buttonProgress}
										/>
									)}
								</Button>
							</DialogActions>
						</Form>
					)}
				</Formik>
			</Dialog>
		</div>
	);
};

export default QueueModal;
