import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  Container,
  Grid,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  makeStyles
} from "@material-ui/core";
import PhoneInTalkIcon from "@material-ui/icons/PhoneInTalk";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import GroupAddIcon from "@material-ui/icons/GroupAdd";
import TimerIcon from "@material-ui/icons/Timer";
import TrendingUpIcon from "@material-ui/icons/TrendingUp";

import useTickets from "../../hooks/useTickets";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import Chart from "./Chart";

const useStyles = makeStyles(theme => ({
  container: {
    paddingTop: theme.spacing(3),
    paddingBottom: theme.spacing(4)
  },
  card: {
    padding: theme.spacing(2),
    borderRadius: 12,
    color: "#fff",
    minHeight: 120,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  },
  cardLabel: {
    opacity: 0.9,
    fontSize: 14,
    marginBottom: theme.spacing(0.5)
  },
  cardValue: {
    fontSize: 36,
    fontWeight: 700,
    lineHeight: 1
  },
  cardIcon: {
    fontSize: 46,
    opacity: 0.3
  },
  cardBlue: {
    background: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)"
  },
  cardSlate: {
    background: "linear-gradient(135deg, #64748b 0%, #475569 100%)"
  },
  cardViolet: {
    background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)"
  },
  cardAmber: {
    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
  },
  cardRose: {
    background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)"
  },
  cardTeal: {
    background: "linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)"
  },
  panel: {
    borderRadius: 12,
    padding: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`
  },
  aiTableTitle: {
    marginBottom: theme.spacing(1)
  }
}));

const Dashboard = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  // Superadmin deve visualizar os mesmos blocos administrativos do admin.
  const isAdminLike = ["admin", "superadmin"].includes(
    (user?.profile || "").toLowerCase()
  );
  const userQueueIds = useMemo(
    () => (user?.queues || []).map(queue => queue.id),
    [user?.queues]
  );

  const { count: openCount } = useTickets({
    status: "open",
    showAll: "true",
    withUnreadMessages: "false",
    queueIds: JSON.stringify(userQueueIds),
    groupMode: "exclude"
  });

  const { count: pendingCount } = useTickets({
    status: "pending",
    showAll: "true",
    withUnreadMessages: "false",
    queueIds: JSON.stringify(userQueueIds),
    groupMode: "exclude"
  });

  const { count: closedCount } = useTickets({
    status: "closed",
    showAll: "true",
    withUnreadMessages: "false",
    queueIds: JSON.stringify(userQueueIds)
  });

  const [contactsCount, setContactsCount] = useState(0);
  const [aiMetrics, setAiMetrics] = useState([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [{ data: contactsData }, { data: metricsData }] = await Promise.all([
          api.get("/contacts", { params: { pageNumber: 1 } }),
          api.get("/metrics/ai/queues")
        ]);

        setContactsCount(Number(contactsData?.count || 0));
        setAiMetrics(metricsData || []);
      } catch (err) {
        if (err?.response?.status !== 403) {
          toastError(err);
        }
      }
    };

    loadDashboardData();
  }, []);

  const aiResolved = useMemo(
    () => aiMetrics.reduce((sum, item) => sum + Number(item.resolvedCount || 0), 0),
    [aiMetrics]
  );

  const aiTransfers = useMemo(
    () => aiMetrics.reduce((sum, item) => sum + Number(item.transferCount || 0), 0),
    [aiMetrics]
  );

  const avgHumanMinutes = useMemo(() => {
    if (!aiMetrics.length) return 0;
    const total = aiMetrics.reduce(
      (sum, item) => sum + Number(item.avgTimeToHumanMinutes || 0),
      0
    );
    return Number((total / aiMetrics.length).toFixed(2));
  }, [aiMetrics]);

  return (
    <Container maxWidth="lg" className={classes.container}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Paper className={`${classes.card} ${classes.cardBlue}`}>
            <div>
              <Typography className={classes.cardLabel}>Atendimentos pendentes</Typography>
              <Typography className={classes.cardValue}>{pendingCount}</Typography>
            </div>
            <HourglassEmptyIcon className={classes.cardIcon} />
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper className={`${classes.card} ${classes.cardSlate}`}>
            <div>
              <Typography className={classes.cardLabel}>Atendimentos em curso</Typography>
              <Typography className={classes.cardValue}>{openCount}</Typography>
            </div>
            <PhoneInTalkIcon className={classes.cardIcon} />
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper className={`${classes.card} ${classes.cardViolet}`}>
            <div>
              <Typography className={classes.cardLabel}>Finalizados</Typography>
              <Typography className={classes.cardValue}>{closedCount}</Typography>
            </div>
            <CheckCircleIcon className={classes.cardIcon} />
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper className={`${classes.card} ${classes.cardAmber}`}>
            <div>
              <Typography className={classes.cardLabel}>Total de contatos</Typography>
              <Typography className={classes.cardValue}>{contactsCount}</Typography>
            </div>
            <GroupAddIcon className={classes.cardIcon} />
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper className={`${classes.card} ${classes.cardRose}`}>
            <div>
              <Typography className={classes.cardLabel}>Tempo medio ate humano</Typography>
              <Typography className={classes.cardValue}>{avgHumanMinutes}m</Typography>
            </div>
            <TimerIcon className={classes.cardIcon} />
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper className={`${classes.card} ${classes.cardTeal}`}>
            <div>
              <Typography className={classes.cardLabel}>Transferencias da IA</Typography>
              <Typography className={classes.cardValue}>{aiTransfers}</Typography>
              <Typography style={{ opacity: 0.9, marginTop: 6 }}>
                Resolvidos por IA/fila: {aiResolved}
              </Typography>
            </div>
            <TrendingUpIcon className={classes.cardIcon} />
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper className={classes.panel}>
            <Chart />
          </Paper>
        </Grid>

        {isAdminLike && (
          <Grid item xs={12}>
            <Paper className={classes.panel}>
              <Typography component="h3" variant="h6" color="primary" className={classes.aiTableTitle}>
                Metricas IA por fila
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fila</TableCell>
                    <TableCell align="center">Resolvidos</TableCell>
                    <TableCell align="center">Transferencias IA</TableCell>
                    <TableCell align="center">Respostas IA</TableCell>
                    <TableCell align="center">Tempo ate humano (min)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {aiMetrics.map(item => (
                    <TableRow key={item.queueId}>
                      <TableCell>{item.queueName}</TableCell>
                      <TableCell align="center">{item.resolvedCount}</TableCell>
                      <TableCell align="center">{item.transferCount}</TableCell>
                      <TableCell align="center">{item.aiReplyCount}</TableCell>
                      <TableCell align="center">{item.avgTimeToHumanMinutes}</TableCell>
                    </TableRow>
                  ))}
                  {aiMetrics.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        Sem dados de IA por enquanto.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default Dashboard;
