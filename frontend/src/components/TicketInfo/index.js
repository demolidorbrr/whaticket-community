import React from "react";

import { Avatar, Box, CardHeader, Chip } from "@material-ui/core";

import { i18n } from "../../translate/i18n";

const TicketInfo = ({ contact, ticket, onClick }) => {
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
		<div onClick={onClick} style={{ cursor: "pointer" }}>
			<CardHeader
				titleTypographyProps={{ noWrap: true }}
				subheaderTypographyProps={{ noWrap: true }}
				avatar={<Avatar src={contact.profilePicUrl} alt="contact_image" />}
				title={`${contact.name} #${ticket.id}`}
				subheader={
					ticket.user &&
					`${i18n.t("messagesList.header.assignedTo")} ${ticket.user.name}`
				}
			/>
			<Box
				display="flex"
				flexWrap="wrap"
				gridGap={6}
				paddingLeft={2}
				paddingRight={2}
				paddingBottom={1}
				marginTop={-1}
			>
				<Chip size="small" label={`Canal: ${channelLabel}`} />
				<Chip size="small" color="primary" variant="outlined" label={`Score: ${leadScore}`} />
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
