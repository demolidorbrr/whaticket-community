import React, { useState, useEffect, useReducer, useContext, useMemo } from "react";
import openSocket from "../../services/socket-io";

import { makeStyles } from "@material-ui/core/styles";
import List from "@material-ui/core/List";
import Paper from "@material-ui/core/Paper";

import TicketListItem from "../TicketListItem";
import TicketsListSkeleton from "../TicketsListSkeleton";

import useTickets from "../../hooks/useTickets";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles(theme => ({
	ticketsListWrapper: {
		position: "relative",
		display: "flex",
		height: "100%",
		flexDirection: "column",
		overflow: "hidden",
		borderTopRightRadius: 0,
		borderBottomRightRadius: 0,
	},

	ticketsList: {
		flex: 1,
		overflowY: "scroll",
		...theme.scrollbarStyles,
		borderTop: "2px solid rgba(0, 0, 0, 0.12)",
	},

	ticketsListHeader: {
		color: "rgb(67, 83, 105)",
		zIndex: 2,
		backgroundColor: "white",
		borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
	},

	ticketsCount: {
		fontWeight: "normal",
		color: "rgb(104, 121, 146)",
		marginLeft: "8px",
		fontSize: "14px",
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

	noTicketsDiv: {
		display: "flex",
		height: "100px",
		margin: 40,
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
	},
  groupHeader: {
    backgroundColor: "#f0f2f5",
    borderTop: "1px solid rgba(0, 0, 0, 0.08)",
    borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
    color: "rgb(104, 121, 146)",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px"
  }
}));

const reducer = (state, action) => {
	if (action.type === "LOAD_TICKETS") {
		const newTickets = action.payload;

		newTickets.forEach(ticket => {
			const ticketIndex = state.findIndex(t => t.id === ticket.id);
			if (ticketIndex !== -1) {
				state[ticketIndex] = ticket;
				if (ticket.unreadMessages > 0) {
					state.unshift(state.splice(ticketIndex, 1)[0]);
				}
			} else {
				state.push(ticket);
			}
		});

		return [...state];
	}

	if (action.type === "RESET_UNREAD") {
		const ticketId = action.payload;

		const ticketIndex = state.findIndex(t => t.id === ticketId);
		if (ticketIndex !== -1) {
			state[ticketIndex].unreadMessages = 0;
		}

		return [...state];
	}

	if (action.type === "UPDATE_TICKET") {
		const ticket = action.payload;

		const ticketIndex = state.findIndex(t => t.id === ticket.id);
		if (ticketIndex !== -1) {
			state[ticketIndex] = ticket;
		} else {
			state.unshift(ticket);
		}

		return [...state];
	}

	if (action.type === "UPDATE_TICKET_UNREAD_MESSAGES") {
		const ticket = action.payload;

		const ticketIndex = state.findIndex(t => t.id === ticket.id);
		if (ticketIndex !== -1) {
			state[ticketIndex] = ticket;
			state.unshift(state.splice(ticketIndex, 1)[0]);
		} else {
			state.unshift(ticket);
		}

		return [...state];
	}

	if (action.type === "UPDATE_TICKET_CONTACT") {
		const contact = action.payload;
		const ticketIndex = state.findIndex(t => t.contactId === contact.id);
		if (ticketIndex !== -1) {
			state[ticketIndex].contact = contact;
		}
		return [...state];
	}

	if (action.type === "DELETE_TICKET") {
		const ticketId = action.payload;
		const ticketIndex = state.findIndex(t => t.id === ticketId);
		if (ticketIndex !== -1) {
			state.splice(ticketIndex, 1);
		}

		return [...state];
	}

	if (action.type === "RESET") {
		return [];
	}
};

	const TicketsList = (props) => {
		const {
			status,
			searchParam,
			showAll,
			selectedQueueIds,
			updateCount,
			style,
			groupMode = "all",
		} = props;
	const classes = useStyles();
	const [pageNumber, setPageNumber] = useState(1);
	const [ticketsList, dispatch] = useReducer(reducer, []);
	const { user } = useContext(AuthContext);

	const matchesGroupFilter = ticket => {
		if (groupMode === "only") {
			return Boolean(ticket.isGroup);
		}

		if (groupMode === "exclude") {
			return !ticket.isGroup;
		}

		return true;
	};

	useEffect(() => {
		dispatch({ type: "RESET" });
		setPageNumber(1);
	}, [status, searchParam, dispatch, showAll, selectedQueueIds]);

	const { tickets, hasMore, loading } = useTickets({
		pageNumber,
		searchParam,
		status,
		showAll,
		queueIds: JSON.stringify(selectedQueueIds),
	});

	useEffect(() => {
		if (!status && !searchParam) return;
		dispatch({
			type: "LOAD_TICKETS",
			payload: tickets.filter(matchesGroupFilter),
		});
	}, [tickets, groupMode]);

	useEffect(() => {
		const socket = openSocket();

		const matchesStatusFilter = ticket => {
			if (!status) {
				return true;
			}

			if (status === "group") {
				return ticket.isGroup && (ticket.status === "open" || ticket.status === "pending");
			}

			return ticket.status === status;
		};

		const shouldUpdateTicket = ticket => !searchParam &&
			matchesStatusFilter(ticket) &&
			matchesGroupFilter(ticket) &&
			(!ticket.userId || ticket.userId === user?.id || showAll) &&
			(
				selectedQueueIds.length === 0 ||
				!ticket.queueId ||
				selectedQueueIds.indexOf(ticket.queueId) > -1
			);

		const notBelongsToUserQueues = ticket =>
			selectedQueueIds.length > 0 &&
			ticket.queueId &&
			selectedQueueIds.indexOf(ticket.queueId) === -1;

		socket.on("connect", () => {
			if (status === "group") {
				socket.emit("joinTickets", "open");
				socket.emit("joinTickets", "pending");
			} else if (status) {
				socket.emit("joinTickets", status);
			} else {
				socket.emit("joinNotification");
			}
		});

		socket.on("ticket", data => {
			if (data.action === "updateUnread") {
				dispatch({
					type: "RESET_UNREAD",
					payload: data.ticketId,
				});
			}

			if (data.action === "update" && shouldUpdateTicket(data.ticket)) {
				dispatch({
					type: "UPDATE_TICKET",
					payload: data.ticket,
				});
			}

			if (data.action === "update" && !shouldUpdateTicket(data.ticket)) {
				dispatch({ type: "DELETE_TICKET", payload: data.ticket.id });
			}

			if (data.action === "update" && notBelongsToUserQueues(data.ticket)) {
				dispatch({ type: "DELETE_TICKET", payload: data.ticket.id });
			}

			if (data.action === "delete") {
				dispatch({ type: "DELETE_TICKET", payload: data.ticketId });
			}
		});

		socket.on("appMessage", data => {
			if (data.action === "create" && shouldUpdateTicket(data.ticket)) {
				dispatch({
					type: "UPDATE_TICKET_UNREAD_MESSAGES",
					payload: data.ticket,
				});
			}
		});

		socket.on("contact", data => {
			if (data.action === "update") {
				dispatch({
					type: "UPDATE_TICKET_CONTACT",
					payload: data.contact,
				});
			}
		});

		return () => {
			socket.disconnect();
		};
	}, [status, searchParam, showAll, user, selectedQueueIds, groupMode]);

	useEffect(() => {
    if (typeof updateCount === "function") {
      updateCount(ticketsList.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketsList]);

  const groupedTickets = useMemo(() => {
    const shouldGroupByUser = status === "open" || status === "pending";
    if (!shouldGroupByUser) {
      return null;
    }

    const groupsMap = new Map();
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

    const getLastInteractionTime = ticket => {
      const rawDate =
        ticket.lastMessageAtTs || ticket.lastMessageAt || ticket.createdAt || ticket.updatedAt;
      const parsedTime = parseDateWithUtcFallback(rawDate)?.getTime?.();
      return Number.isNaN(parsedTime) ? 0 : parsedTime;
    };

    groupsMap.set("unassigned", {
      key: "unassigned",
      title: "Atendimento a distribuir",
      sortLabel: "",
      isUnassigned: true,
      tickets: []
    });

    ticketsList.forEach(ticket => {
      const hasAssignedUser = Boolean(ticket.user?.id);
      const groupKey = hasAssignedUser ? `user-${ticket.user.id}` : "unassigned";
      const groupTitle = hasAssignedUser
        ? `Atendimento distribuido para ${ticket.user.name}`
        : "Atendimento a distribuir";
      const sortLabel = hasAssignedUser ? ticket.user.name : "A distribuir";

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          key: groupKey,
          title: groupTitle,
          sortLabel,
          isUnassigned: !hasAssignedUser,
          tickets: []
        });
      }

      groupsMap.get(groupKey).tickets.push(ticket);
    });

    const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.isUnassigned && !b.isUnassigned) return -1;
      if (!a.isUnassigned && b.isUnassigned) return 1;

      return a.sortLabel.localeCompare(b.sortLabel, "pt-BR", {
        sensitivity: "base"
      });
    });

    sortedGroups.forEach(group => {
      group.tickets.sort((a, b) => {
        const timeDiff = getLastInteractionTime(b) - getLastInteractionTime(a);
        if (timeDiff !== 0) return timeDiff;

        return (a.contact?.name || "").localeCompare(b.contact?.name || "", "pt-BR", {
          sensitivity: "base"
        });
      });
    });

    return sortedGroups;
  }, [ticketsList, status]);

	const loadMore = () => {
		setPageNumber(prevState => prevState + 1);
	};

	const handleScroll = e => {
		if (!hasMore || loading) return;

		const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

		if (scrollHeight - (scrollTop + 100) < clientHeight) {
			e.currentTarget.scrollTop = scrollTop - 100;
			loadMore();
		}
	};

	return (
    <Paper className={classes.ticketsListWrapper} style={style}>
			<Paper
				square
				name="closed"
				elevation={0}
				className={classes.ticketsList}
				onScroll={handleScroll}
			>
				<List style={{ paddingTop: 0 }}>
					{ticketsList.length === 0 && !loading ? (
						<div className={classes.noTicketsDiv}>
							<span className={classes.noTicketsTitle}>
								{i18n.t("ticketsList.noTicketsTitle")}
							</span>
							<p className={classes.noTicketsText}>
								{i18n.t("ticketsList.noTicketsMessage")}
							</p>
						</div>
					) : (
						<>
              {groupedTickets
                ? groupedTickets.map(group => (
                    <React.Fragment key={group.key}>
                      <div className={classes.groupHeader}>{group.title}</div>
                      {group.tickets.map(ticket => (
                        <TicketListItem ticket={ticket} key={ticket.id} />
                      ))}
                    </React.Fragment>
                  ))
                : ticketsList.map(ticket => (
                    <TicketListItem ticket={ticket} key={ticket.id} />
                  ))}
						</>
					)}
					{loading && <TicketsListSkeleton />}
				</List>
			</Paper>
    </Paper>
	);
};

export default TicketsList;
