import React, { useState, useEffect, useRef } from "react";

import { useHistory, useParams } from "react-router-dom";
import { format } from "date-fns";
import clsx from "clsx";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import Typography from "@material-ui/core/Typography";
import Avatar from "@material-ui/core/Avatar";
import Divider from "@material-ui/core/Divider";
import Badge from "@material-ui/core/Badge";

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import ButtonWithSpinner from "../ButtonWithSpinner";
import { Tooltip } from "@material-ui/core";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
	ticket: {
		position: "relative",
	},

	pendingTicket: {
		cursor: "unset",
	},

	noTicketsDiv: {
		display: "flex",
		height: "100px",
		margin: 40,
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
	},

	noTicketsText: {
		textAlign: "center",
		color: "rgb(104, 121, 146)",
		fontSize: "14px",
		lineHeight: "1.4",
	},

	noTicketsTitle: {
		textAlign: "center",
		fontSize: "16px",
		fontWeight: "600",
		margin: "0px",
	},

	contactNameWrapper: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 8,
	},

	lastMessageTime: {
		justifySelf: "flex-end",
	},
	lastMessageDateTime: {
		display: "flex",
		flexDirection: "column",
		alignItems: "flex-end",
		marginLeft: 8,
		minWidth: 76,
	},
	lastMessageDate: {
		fontSize: 14,
		lineHeight: 1.15,
		color: "rgba(0, 0, 0, 0.67)",
	},
	lastMessageHour: {
		fontSize: 11,
		lineHeight: 1.1,
		color: "rgba(0, 0, 0, 0.5)",
	},

	closedBadge: {
		alignSelf: "center",
		justifySelf: "flex-end",
		marginRight: 32,
		marginLeft: "auto",
	},

	contactLastMessage: {
		flex: "0 0 50%",
		maxWidth: "50%",
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		// Espacamento do preview para nao ficar "grudado" no restante do card.
		paddingTop: 4,
		paddingBottom: 4,
	},
	secondaryContent: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		width: "100%",
	},
	secondaryTopRow: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		width: "100%",
	},
	secondaryMetaRow: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		minWidth: 0,
		overflow: "hidden",
		paddingRight: 4,
	},

	newMessagesCount: {
		alignSelf: "center",
		marginRight: 8,
		marginLeft: "auto",
	},
  queueTag: {
    alignSelf: "center",
    padding: "1px 6px",
    borderRadius: 10,
    fontSize: 11,
    maxWidth: 120,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
	ticketTag: {
		alignSelf: "center",
		padding: "1px 6px",
		borderRadius: 10,
		fontSize: 11,
		maxWidth: 120,
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	ticketTagOverflow: {
		alignSelf: "center",
		padding: "1px 6px",
		borderRadius: 10,
		fontSize: 11,
		background: "#E9EDF5",
		color: "#3F4D67",
		border: "1px solid #D7DEEA",
	},

	badgeStyle: {
		color: "white",
		backgroundColor: green[500],
	},

	acceptButton: {
		position: "absolute",
		left: "50%",
	},

	ticketQueueColor: {
		flex: "none",
		width: "8px",
		height: "100%",
		position: "absolute",
		top: "0%",
		left: "0%",
	},

}));

const getContrastTextColor = (hexColor, fallback = "#ffffff") => {
	if (!hexColor || typeof hexColor !== "string" || !hexColor.startsWith("#")) {
		return fallback;
	}

	const hex = hexColor.replace("#", "");
	const normalized = hex.length === 3
		? hex
			.split("")
			.map(char => char + char)
			.join("")
		: hex;

	if (normalized.length !== 6) {
		return fallback;
	}

	const red = parseInt(normalized.slice(0, 2), 16);
	const greenValue = parseInt(normalized.slice(2, 4), 16);
	const blue = parseInt(normalized.slice(4, 6), 16);

	if ([red, greenValue, blue].some(Number.isNaN)) {
		return fallback;
	}

	const luminance = (0.299 * red + 0.587 * greenValue + 0.114 * blue) / 255;
	return luminance > 0.62 ? "#1f2937" : "#ffffff";
};

const normalizeTag = tag => {
	if (!tag) return null;
	if (typeof tag === "string") {
		return { id: tag, name: tag, color: "#607d8b" };
	}

	if (typeof tag === "object") {
		const name = tag.name || (tag.id ? String(tag.id) : "");
		if (!name) return null;
		return {
			id: tag.id || name,
			name,
			color: tag.color || "#607d8b",
		};
	}

	return null;
};

const TicketListItem = ({ ticket }) => {
	const classes = useStyles();
	const history = useHistory();
	const [loading, setLoading] = useState(false);
	const { ticketId } = useParams();
	const isMounted = useRef(true);
	const parseDateWithUtcFallback = value => {
		if (!value) return null;
		if (value instanceof Date) return value;
		if (typeof value === "number") return new Date(value);
		if (typeof value !== "string") return new Date(value);

		const numericValue = Number(value);
		if (!Number.isNaN(numericValue) && Number.isFinite(numericValue)) {
			return new Date(numericValue);
		}

		const normalized = value.includes("T") ? value : value.replace(" ", "T");
		const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);

		return new Date(hasTimezone ? normalized : `${normalized}Z`);
	};

	const lastInteractionRaw =
		ticket.lastMessageAtTs || ticket.lastMessageAt || ticket.createdAt || ticket.updatedAt;
	const lastInteractionDate = parseDateWithUtcFallback(lastInteractionRaw);
	const hasValidInteractionDate = !Number.isNaN(lastInteractionDate?.getTime?.());
	const queueColor = ticket.queue?.color || "#7C7C7C";
	const queueLabel = ticket.queue?.name || "Sem fila";
	const normalizedTags = Array.isArray(ticket.tags)
		? ticket.tags.map(normalizeTag).filter(Boolean)
		: [];
	const visibleTags = normalizedTags.slice(0, 2);
	const ticketPreview = (ticket.lastMessage || "Sem mensagem")
		.replace(/\s+/g, " ")
		.trim();

	useEffect(() => {
		return () => {
			isMounted.current = false;
		};
	}, []);

	const handleAcepptTicket = async id => {
		setLoading(true);
		try {
			await api.put(`/tickets/${id}`, {
				status: "open",
				userId: null,
			});
		} catch (err) {
			setLoading(false);
			toastError(err);
		}
		if (isMounted.current) {
			setLoading(false);
		}
		history.push(`/tickets/${id}`);
	};

	const handleSelectTicket = id => {
		history.push(`/tickets/${id}`);
	};

	return (
		<React.Fragment key={ticket.id}>
			<ListItem
				dense
				button
				onClick={e => {
					if (ticket.status === "pending") return;
					handleSelectTicket(ticket.id);
				}}
				selected={ticketId && +ticketId === ticket.id}
				className={clsx(classes.ticket, {
					[classes.pendingTicket]: ticket.status === "pending",
				})}
			>
				<Tooltip
					arrow
					placement="right"
					title={ticket.queue?.name || "Sem fila"}
				>
					<span
						style={{ backgroundColor: ticket.queue?.color || "#7C7C7C" }}
						className={classes.ticketQueueColor}
					></span>
				</Tooltip>
				<ListItemAvatar>
					<Avatar src={ticket?.contact?.profilePicUrl} />
				</ListItemAvatar>
				<ListItemText
					disableTypography
					primary={
						<span className={classes.contactNameWrapper}>
							<Typography
								noWrap
								component="span"
								variant="body2"
								color="textPrimary"
							>
								{ticket.contact?.name || "Sem contato"}
							</Typography>
							{ticket.status === "closed" && (
								<Badge
									className={classes.closedBadge}
									badgeContent={"closed"}
									color="primary"
								/>
							)}
							{ticket.lastMessage && (
								<Typography
									className={classes.lastMessageTime}
									component="span"
									variant="body2"
									color="textSecondary"
								>
									{hasValidInteractionDate && (
										<span className={classes.lastMessageDateTime}>
											<span className={classes.lastMessageDate}>
												{format(lastInteractionDate, "dd/MM/yyyy")}
											</span>
											<span className={classes.lastMessageHour}>
												{format(lastInteractionDate, "HH:mm")}
											</span>
										</span>
									)}
								</Typography>
							)}
						</span>
					}
					secondary={
						<span className={classes.secondaryContent}>
							<span className={classes.secondaryTopRow}>
								<Typography
									className={classes.contactLastMessage}
									component="span"
									variant="body2"
									color="textSecondary"
									title={ticketPreview}
								>
									{ticketPreview}
								</Typography>
								<Badge
									className={classes.newMessagesCount}
									badgeContent={ticket.unreadMessages}
									classes={{
										badge: classes.badgeStyle,
									}}
								/>
							</span>
							<span className={classes.secondaryMetaRow}>
								<span
									className={classes.queueTag}
									title={queueLabel}
									style={{
										backgroundColor: queueColor,
										color: getContrastTextColor(queueColor),
										border: `1px solid ${queueColor}`,
									}}
								>
									{queueLabel}
								</span>
								{visibleTags.map(tag => (
									<span
										key={tag.id || tag.name}
										className={classes.ticketTag}
										title={tag.name}
										style={{
											backgroundColor: tag.color || "#607d8b",
											color: getContrastTextColor(tag.color || "#607d8b"),
											border: `1px solid ${tag.color || "#607d8b"}`,
										}}
									>
										{tag.name}
									</span>
								))}
								{normalizedTags.length > visibleTags.length ? (
									<span className={classes.ticketTagOverflow}>
										+{normalizedTags.length - visibleTags.length}
									</span>
								) : null}
							</span>
						</span>
					}
				/>
				{ticket.status === "pending" && (
					<ButtonWithSpinner
						color="primary"
						variant="contained"
						className={classes.acceptButton}
						size="small"
						loading={loading}
						onClick={e => handleAcepptTicket(ticket.id)}
					>
						{i18n.t("ticketsList.buttons.accept")}
					</ButtonWithSpinner>
				)}
			</ListItem>
			<Divider variant="inset" component="li" />
		</React.Fragment>
	);
};

export default TicketListItem;
