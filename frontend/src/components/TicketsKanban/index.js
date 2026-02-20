import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import openSocket from "../../services/socket-io";
import {
  Paper,
  Typography,
  makeStyles,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip
} from "@material-ui/core";
import { DeleteOutline, Edit } from "@material-ui/icons";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    gap: theme.spacing(1),
    height: "100%",
    padding: theme.spacing(1),
    overflowX: "auto",
    overflowY: "hidden"
  },
  column: {
    minWidth: 300,
    width: 320,
    display: "flex",
    flexDirection: "column",
    background: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8
  },
  columnHeader: {
    padding: theme.spacing(1, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontWeight: 600
  },
  columnHeaderTitle: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.75),
    minWidth: 0
  },
  columnHeaderActions: {
    display: "flex",
    alignItems: "center"
  },
  countBadge: {
    fontSize: 12,
    borderRadius: 999,
    padding: theme.spacing(0.25, 1),
    background: theme.palette.action.hover
  },
  columnBody: {
    padding: theme.spacing(1),
    overflowY: "auto",
    flex: 1,
    minHeight: 120
  },
  columnBodyOver: {
    background: theme.palette.action.hover
  },
  ticketCard: {
    padding: theme.spacing(1),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    marginBottom: theme.spacing(1),
    cursor: "grab",
    background: theme.palette.background.default
  },
  ticketTitle: {
    fontWeight: 600
  },
  ticketMeta: {
    fontSize: 12,
    color: theme.palette.text.secondary
  },
  ticketMessage: {
    marginTop: theme.spacing(0.5),
    fontSize: 13,
    color: theme.palette.text.secondary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  queueRow: {
    marginTop: theme.spacing(0.75),
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  loader: {
    margin: theme.spacing(2),
    alignSelf: "center"
  },
  empty: {
    textAlign: "center",
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(2),
    fontSize: 13
  },
  cardFooter: {
    marginTop: theme.spacing(0.5),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    flexWrap: "wrap"
  }
}));

const STATUS_COLUMNS = [
  { key: "pending", label: "Aguardando", type: "status", status: "pending" },
  { key: "open", label: "Atendendo", type: "status", status: "open" },
  { key: "closed", label: "Fechado", type: "status", status: "closed" }
];

const isPersonTicket = ticket => !ticket?.isGroup;

const upsertTicket = (list, ticket) => {
  if (!isPersonTicket(ticket)) {
    return list.filter(item => item.id !== ticket?.id);
  }

  const index = list.findIndex(item => item.id === ticket.id);
  if (index >= 0) {
    const next = [...list];
    next[index] = ticket;
    return next;
  }

  return [ticket, ...list];
};

const TicketsKanban = ({
  showAll,
  selectedQueueIds,
  mode = "status",
  queues = [],
  canManageQueues = false,
  onEditQueue,
  onDeleteQueue
}) => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState("");
  const [dragContext, setDragContext] = useState(null);
  const [tickets, setTickets] = useState([]);
  const dragGuardRef = useRef(false);

  const queueIds = useMemo(
    () => JSON.stringify(selectedQueueIds || []),
    [selectedQueueIds]
  );

  const queueFilterSet = useMemo(
    () => new Set((selectedQueueIds || []).map(id => Number(id))),
    [selectedQueueIds]
  );

  const visibleQueues = useMemo(() => {
    if (!Array.isArray(queues)) {
      return [];
    }

    if (!selectedQueueIds || selectedQueueIds.length === 0) {
      return queues;
    }

    return queues.filter(queue => queueFilterSet.has(Number(queue.id)));
  }, [queues, selectedQueueIds, queueFilterSet]);

  const columns = useMemo(() => {
    if (mode !== "pipeline") {
      return STATUS_COLUMNS;
    }

    return [
      {
        key: "unassigned",
        label: "Contato aberto",
        type: "unassigned"
      },
      ...visibleQueues.map(queue => ({
        key: `queue-${queue.id}`,
        label: queue.name,
        type: "queue",
        queueId: queue.id,
        queue
      })),
      {
        key: "closed",
        label: "Fechado",
        type: "closed"
      }
    ];
  }, [mode, visibleQueues]);

  const queueColumnKeys = useMemo(
    () => new Set(columns.filter(c => c.type === "queue").map(c => c.key)),
    [columns]
  );

  const isTicketVisible = ticket => {
    if (!selectedQueueIds || selectedQueueIds.length === 0) {
      return true;
    }

    if (!ticket.queueId) {
      return true;
    }

    return queueFilterSet.has(Number(ticket.queueId));
  };

  const board = useMemo(() => {
    const base = {};
    columns.forEach(column => {
      base[column.key] = [];
    });

    tickets.forEach(ticket => {
      if (!isPersonTicket(ticket)) {
        return;
      }

      if (!isTicketVisible(ticket)) {
        return;
      }

      if (mode === "pipeline") {
        if (ticket.status === "closed") {
          base.closed = [...(base.closed || []), ticket];
          return;
        }

        if (ticket.queueId && queueColumnKeys.has(`queue-${ticket.queueId}`)) {
          base[`queue-${ticket.queueId}`] = [
            ...(base[`queue-${ticket.queueId}`] || []),
            ticket
          ];
          return;
        }

        base.unassigned = [...(base.unassigned || []), ticket];
        return;
      }

      if (base[ticket.status]) {
        base[ticket.status] = [...base[ticket.status], ticket];
      }
    });

    return base;
  }, [columns, tickets, mode, queueColumnKeys]);

  const fetchBoard = async () => {
    try {
      setLoading(true);

      const [pendingRes, openRes, closedRes] = await Promise.all([
        api.get("/tickets", {
          params: {
            status: "pending",
            showAll,
            queueIds,
            pageNumber: 1
          }
        }),
        api.get("/tickets", {
          params: {
            status: "open",
            showAll,
            queueIds,
            pageNumber: 1
          }
        }),
        api.get("/tickets", {
          params: {
            status: "closed",
            showAll: true,
            queueIds,
            pageNumber: 1
          }
        })
      ]);

      const merged = [
        ...(pendingRes.data.tickets || []),
        ...(openRes.data.tickets || []),
        ...(closedRes.data.tickets || [])
      ];

      const unique = merged.reduce((acc, item) => {
        if (!isPersonTicket(item)) {
          return acc;
        }

        if (!acc.some(ticket => ticket.id === item.id)) {
          acc.push(item);
        }
        return acc;
      }, []);

      setTickets(unique);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoard();
  }, [showAll, queueIds, mode, columns.length]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("connect", () => {
      socket.emit("joinTickets", "pending");
      socket.emit("joinTickets", "open");
      socket.emit("joinTickets", "closed");
      socket.emit("joinNotification");
    });

    socket.on("ticket", data => {
      if (data.action === "delete") {
        setTickets(prev => prev.filter(ticket => ticket.id !== data.ticketId));
        return;
      }

      if (data.action === "update" && data.ticket) {
        setTickets(prev => upsertTicket(prev, data.ticket));
      }
    });

    socket.on("appMessage", data => {
      if (data.action === "create" && data.ticket) {
        setTickets(prev => upsertTicket(prev, data.ticket));
      }
    });

    return () => socket.disconnect();
  }, []);

  const handleDragStart = (e, ticket, sourceColumnKey) => {
    dragGuardRef.current = true;

    const payload = {
      ticketId: Number(ticket.id),
      sourceColumnKey
    };

    setDragContext(payload);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("ticketId", String(ticket.id));
    e.dataTransfer.setData("sourceColumnKey", sourceColumnKey);
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
  };

  const handleDrop = async (e, targetColumn) => {
    e.preventDefault();
    setDragOver("");

    let ticketId = Number(e.dataTransfer.getData("ticketId"));
    let sourceColumnKey = e.dataTransfer.getData("sourceColumnKey");

    if (!ticketId || !sourceColumnKey) {
      const plainTextData = e.dataTransfer.getData("text/plain");
      if (plainTextData) {
        try {
          const parsed = JSON.parse(plainTextData);
          ticketId = Number(parsed.ticketId);
          sourceColumnKey = parsed.sourceColumnKey;
        } catch (error) {
          // ignore invalid payload and fallback to state below
        }
      }
    }

    if ((!ticketId || !sourceColumnKey) && dragContext) {
      ticketId = Number(dragContext.ticketId);
      sourceColumnKey = dragContext.sourceColumnKey;
    }

    setDragContext(null);

    if (!ticketId || !sourceColumnKey || sourceColumnKey === targetColumn.key) {
      return;
    }

    const sourceTicket = tickets.find(ticket => ticket.id === ticketId);
    if (!sourceTicket) {
      return;
    }

    let payload = null;

    if (mode === "pipeline") {
      if (targetColumn.type === "closed") {
        payload = {
          status: "closed",
          userId: null,
          queueId: sourceTicket.queueId || null
        };
      } else if (targetColumn.type === "unassigned") {
        payload = {
          status: "pending",
          userId: null,
          queueId: null
        };
      } else if (targetColumn.type === "queue") {
        payload = {
          status: "open",
          userId: sourceTicket.userId || user?.id || null,
          queueId: targetColumn.queueId
        };
      }
    } else {
      payload = {
        status: targetColumn.status,
        userId:
          targetColumn.status === "pending" || targetColumn.status === "closed"
            ? null
            : sourceTicket.userId || user?.id || null,
        queueId: sourceTicket.queueId
      };
    }

    if (!payload) {
      return;
    }

    try {
      const { data } = await api.put(`/tickets/${ticketId}`, {
        ...payload,
        source: "kanban_drag"
      });

      if (data?.id) {
        setTickets(prev => upsertTicket(prev, data));
        return;
      }

      setTickets(prev =>
        prev.map(ticket => {
          if (ticket.id !== ticketId) {
            return ticket;
          }

          return {
            ...ticket,
            ...payload
          };
        })
      );
    } catch (err) {
      toastError(err);
    }
  };

  const onOpenTicket = ticketId => {
    history.push(`/tickets/${ticketId}`);
  };

  return (
    <div className={classes.root}>
      {columns.map(column => (
        <Paper key={column.key} className={classes.column} elevation={0}>
          <div className={classes.columnHeader}>
            <div className={classes.columnHeaderTitle}>
              <Typography variant="body2">{column.label}</Typography>
              <span className={classes.countBadge}>
                {(board[column.key] || []).length}
              </span>
            </div>
            {canManageQueues && column.type === "queue" ? (
              <div className={classes.columnHeaderActions}>
                <Tooltip title="Editar lista">
                  <IconButton
                    size="small"
                    onClick={() => onEditQueue && onEditQueue(column.queue)}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Excluir lista">
                  <IconButton
                    size="small"
                    onClick={() => onDeleteQueue && onDeleteQueue(column.queue)}
                  >
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            ) : null}
          </div>

          <div
            className={`${classes.columnBody} ${
              dragOver === column.key ? classes.columnBodyOver : ""
            }`}
            onDragOver={e => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver(column.key);
            }}
            onDragLeave={() => setDragOver("")}
            onDrop={e => handleDrop(e, column)}
          >
            {loading ? (
              <CircularProgress size={24} className={classes.loader} />
            ) : (
              <>
                {(board[column.key] || []).map(ticket => (
                  <div
                    key={ticket.id}
                    className={classes.ticketCard}
                    draggable
                    onDragStart={e => handleDragStart(e, ticket, column.key)}
                    onDragEnd={() => {
                      setTimeout(() => {
                        dragGuardRef.current = false;
                      }, 0);
                      setDragContext(null);
                      setDragOver("");
                    }}
                    onClick={() => {
                      if (dragGuardRef.current) {
                        return;
                      }
                      onOpenTicket(ticket.id);
                    }}
                    title="Clique para abrir conversa"
                  >
                    <div className={classes.ticketTitle}>
                      {ticket.contact?.name || "Atendimento"}
                    </div>
                    <div className={classes.ticketMessage}>
                      {ticket.lastMessage || "Sem mensagem"}
                    </div>
                    <div className={classes.queueRow}>
                      <Chip
                        size="small"
                        label={ticket.queue?.name || "Sem fase"}
                        style={{
                          backgroundColor: ticket.queue?.color || undefined,
                          color: ticket.queue?.color ? "#fff" : undefined
                        }}
                      />
                      {ticket.unreadMessages > 0 ? (
                        <span className={classes.countBadge}>
                          +{ticket.unreadMessages}
                        </span>
                      ) : null}
                    </div>
                    <div className={classes.cardFooter}>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Canal: ${ticket.channel || "whatsapp"}`}
                      />
                      {(ticket.tags || []).slice(0, 2).map(tag => (
                        <Chip
                          key={tag.id || tag.name}
                          size="small"
                          label={tag.name}
                          style={{
                            backgroundColor: tag.color || undefined,
                            color: tag.color ? "#fff" : undefined
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {(board[column.key] || []).length === 0 && (
                  <div className={classes.empty}>Sem tickets nesta coluna</div>
                )}
              </>
            )}
          </div>
        </Paper>
      ))}
    </div>
  );
};

export default TicketsKanban;
