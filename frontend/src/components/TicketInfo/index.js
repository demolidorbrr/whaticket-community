import React from "react";

import { Avatar, Box, CardHeader, Chip } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";

import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
	root: {
		cursor: "pointer",
		color: theme.palette.text.primary,
	},
	header: {
		paddingBottom: theme.spacing(0.5),
		"& .MuiCardHeader-title": {
			color: theme.palette.text.primary,
			fontWeight: 600,
		},
		"& .MuiCardHeader-subheader": {
			color: theme.palette.text.secondary,
		},
	},
	chipsRow: {
		display: "flex",
		flexWrap: "wrap",
		gap: 6,
		paddingLeft: theme.spacing(2),
		paddingRight: theme.spacing(2),
		paddingBottom: theme.spacing(1),
		marginTop: -2,
	},
	channelChip: {
		backgroundColor:
			theme.palette.type === "dark" ? "rgba(255,255,255,0.08)" : "#f3f6fb",
		color: theme.palette.text.primary,
		border: `1px solid ${theme.palette.divider}`,
	},
	scoreChip: {
		borderColor: theme.palette.primary.main,
		color: theme.palette.primary.main,
		backgroundColor:
			theme.palette.type === "dark" ? "rgba(37,118,210,0.14)" : "transparent",
	},
}));

const TicketInfo = ({ contact, ticket, onClick }) => {
	const classes = useStyles();

	const channelLabelMap = {
		whatsapp: "WhatsApp",
		instagram: "Instagram",
		messenger: "Messenger",
		webchat: "Webchat",
	};

	const channelLabel = channelLabelMap[ticket.channel] || "WhatsApp";
	const leadScore = Number(ticket.leadScore || 0);
	const tags = Array.isArray(ticket.tags) ? ticket.tags : [];

	return (
		<div onClick={onClick} className={classes.root}>
			<CardHeader
				className={classes.header}
				titleTypographyProps={{ noWrap: true }}
				subheaderTypographyProps={{ noWrap: true }}
				avatar={<Avatar src={contact.profilePicUrl} alt="contact_image" />}
				title={`${contact.name} #${ticket.id}`}
				subheader={
					ticket.user &&
					`${i18n.t("messagesList.header.assignedTo")} ${ticket.user.name}`
				}
			/>
			<Box className={classes.chipsRow}>
				<Chip size="small" className={classes.channelChip} label={`Canal: ${channelLabel}`} />
				<Chip
					size="small"
					variant="outlined"
					className={classes.scoreChip}
					label={`Score: ${leadScore}`}
				/>
				{tags.slice(0, 3).map(tag => (
					<Chip
						key={tag.id || tag.name}
						size="small"
						label={tag.name}
						style={{
							backgroundColor: tag.color || undefined,
							color: tag.color ? "#fff" : undefined,
						}}
					/>
				))}
				{tags.length > 3 && <Chip size="small" label={`+${tags.length - 3}`} />}
			</Box>
		</div>
	);
};

export default TicketInfo;
