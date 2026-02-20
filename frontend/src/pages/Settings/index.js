import React, { useState, useEffect, useContext } from "react";
import openSocket from "../../services/socket-io";

import { makeStyles } from "@material-ui/core/styles";
import {
  Paper,
  Typography,
  Container,
  Select,
  TextField,
  Tabs,
  Tab,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton
} from "@material-ui/core";
import EditIcon from "@material-ui/icons/Edit";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import { toast } from "react-toastify";

import api from "../../services/api";
import { i18n } from "../../translate/i18n.js";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    alignItems: "flex-start",
    padding: theme.spacing(2, 3, 2),
    width: "100%"
  },

  container: {
    maxWidth: 1100
  },

  tabsPaper: {
    marginBottom: theme.spacing(2)
  },

  sectionPaper: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2)
  },

  paper: {
    padding: theme.spacing(2),
    display: "flex",
    alignItems: "center",
    marginBottom: 12
  },

  settingOption: {
    marginLeft: "auto",
    minWidth: 220
  },

  actionsRow: {
    display: "flex",
    gap: theme.spacing(1),
    justifyContent: "flex-end"
  },

  tableWrapper: {
    maxHeight: 320,
    overflowY: "auto",
    border: "1px solid #e0e0e0",
    borderRadius: 4
  }
}));

const booleanToSelectValue = value => (value ? "true" : "false");

const selectValueToBoolean = value => {
  if (typeof value === "boolean") {
    return value;
  }

  return String(value).toLowerCase() === "true";
};

const formatDateInputValue = value => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
};

const defaultPlanForm = {
  name: "",
  usersLimit: 10,
  connectionsLimit: 10,
  queuesLimit: 10,
  price: 0,
  campaignsEnabled: "true",
  schedulesEnabled: "true",
  internalChatEnabled: "true",
  apiEnabled: "true",
  kanbanEnabled: "true",
  openAiEnabled: "true",
  integrationsEnabled: "true",
  internalUse: "false",
  isActive: "true"
};

const defaultCompanyForm = {
  name: "",
  planId: "",
  status: "active",
  dueDate: "",
  adminName: "",
  adminEmail: "",
  adminPassword: ""
};

const Settings = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const isSuperAdmin = user.profile?.toLowerCase() === "superadmin";

  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState([]);
  const [queues, setQueues] = useState([]);

  const [plans, setPlans] = useState([]);
  const [companies, setCompanies] = useState([]);

  const [planForm, setPlanForm] = useState(defaultPlanForm);
  const [editingPlanId, setEditingPlanId] = useState(null);

  const [companyForm, setCompanyForm] = useState(defaultCompanyForm);
  const [editingCompanyId, setEditingCompanyId] = useState(null);

  const loadResellerData = async () => {
    if (!isSuperAdmin) {
      setPlans([]);
      setCompanies([]);
      return;
    }

    const [{ data: plansData }, { data: companiesData }] = await Promise.all([
      api.get("/plans"),
      api.get("/companies")
    ]);

    setPlans(plansData || []);
    setCompanies(companiesData || []);
  };

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const [{ data: settingsData }, { data: queuesData }] = await Promise.all([
          api.get("/settings"),
          api.get("/queue")
        ]);

        setSettings(settingsData || []);
        setQueues(queuesData || []);

        await loadResellerData();
      } catch (err) {
        toastError(err);
      }
    };

    fetchSession();
  }, [isSuperAdmin]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("settings", data => {
      if (data.action === "update") {
        setSettings(prevState => {
          const aux = [...prevState];
          const settingIndex = aux.findIndex(s => s.key === data.setting.key);

          if (settingIndex >= 0) {
            aux[settingIndex].value = data.setting.value;
          }

          return aux;
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const getSettingValue = key => {
    const setting = settings.find(s => s.key === key);
    return setting ? setting.value : "";
  };

  const handleChangeSetting = async e => {
    const selectedValue = e.target.value;
    const settingKey = e.target.name;

    try {
      await api.put(`/settings/${settingKey}`, {
        value: selectedValue
      });
      toast.success(i18n.t("settings.success"));
    } catch (err) {
      toastError(err);
    }
  };

  const resetPlanForm = () => {
    setPlanForm(defaultPlanForm);
    setEditingPlanId(null);
  };

  const resetCompanyForm = () => {
    setCompanyForm(defaultCompanyForm);
    setEditingCompanyId(null);
  };

  const handlePlanFormChange = e => {
    const { name, value } = e.target;
    setPlanForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCompanyFormChange = e => {
    const { name, value } = e.target;
    setCompanyForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmitPlan = async () => {
    const payload = {
      name: planForm.name,
      usersLimit: Number(planForm.usersLimit || 0),
      connectionsLimit: Number(planForm.connectionsLimit || 0),
      queuesLimit: Number(planForm.queuesLimit || 0),
      price: Number(planForm.price || 0),
      campaignsEnabled: selectValueToBoolean(planForm.campaignsEnabled),
      schedulesEnabled: selectValueToBoolean(planForm.schedulesEnabled),
      internalChatEnabled: selectValueToBoolean(planForm.internalChatEnabled),
      apiEnabled: selectValueToBoolean(planForm.apiEnabled),
      kanbanEnabled: selectValueToBoolean(planForm.kanbanEnabled),
      openAiEnabled: selectValueToBoolean(planForm.openAiEnabled),
      integrationsEnabled: selectValueToBoolean(planForm.integrationsEnabled),
      internalUse: selectValueToBoolean(planForm.internalUse),
      isActive: selectValueToBoolean(planForm.isActive)
    };

    try {
      if (editingPlanId) {
        await api.put(`/plans/${editingPlanId}`, payload);
      } else {
        await api.post("/plans", payload);
      }

      toast.success("Plano salvo com sucesso");
      resetPlanForm();
      await loadResellerData();
    } catch (err) {
      toastError(err);
    }
  };

  const handleEditPlan = plan => {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name || "",
      usersLimit: plan.usersLimit ?? 0,
      connectionsLimit: plan.connectionsLimit ?? 0,
      queuesLimit: plan.queuesLimit ?? 0,
      price: plan.price ?? 0,
      campaignsEnabled: booleanToSelectValue(plan.campaignsEnabled),
      schedulesEnabled: booleanToSelectValue(plan.schedulesEnabled),
      internalChatEnabled: booleanToSelectValue(plan.internalChatEnabled),
      apiEnabled: booleanToSelectValue(plan.apiEnabled),
      kanbanEnabled: booleanToSelectValue(plan.kanbanEnabled),
      openAiEnabled: booleanToSelectValue(plan.openAiEnabled),
      integrationsEnabled: booleanToSelectValue(plan.integrationsEnabled),
      internalUse: booleanToSelectValue(plan.internalUse),
      isActive: booleanToSelectValue(plan.isActive)
    });
  };

  const handleDeletePlan = async planId => {
    try {
      await api.delete(`/plans/${planId}`);
      toast.success("Plano removido com sucesso");
      if (editingPlanId === planId) {
        resetPlanForm();
      }
      await loadResellerData();
    } catch (err) {
      toastError(err);
    }
  };

  const handleSubmitCompany = async () => {
    const payload = {
      name: companyForm.name,
      planId: Number(companyForm.planId),
      status: companyForm.status,
      dueDate: companyForm.dueDate || null,
      adminName: companyForm.adminName,
      adminEmail: companyForm.adminEmail,
      adminPassword: companyForm.adminPassword
    };

    try {
      if (editingCompanyId) {
        await api.put(`/companies/${editingCompanyId}`, {
          name: payload.name,
          planId: payload.planId,
          status: payload.status,
          dueDate: payload.dueDate
        });
      } else {
        await api.post("/companies", payload);
      }

      toast.success("Empresa salva com sucesso");
      resetCompanyForm();
      await loadResellerData();
    } catch (err) {
      toastError(err);
    }
  };

  const handleEditCompany = company => {
    setEditingCompanyId(company.id);
    setCompanyForm({
      name: company.name || "",
      planId: String(company.planId || ""),
      status: company.status || "active",
      dueDate: formatDateInputValue(company.dueDate),
      adminName: "",
      adminEmail: "",
      adminPassword: ""
    });
  };

  const handleDeactivateCompany = async companyId => {
    try {
      await api.delete(`/companies/${companyId}`);
      toast.success("Empresa desativada com sucesso");
      if (editingCompanyId === companyId) {
        resetCompanyForm();
      }
      await loadResellerData();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className={classes.root}>
      <Container className={classes.container} maxWidth={false}>
        <Typography variant="h6" gutterBottom>
          Configuracoes
        </Typography>

        <Paper className={classes.tabsPaper}>
          <Tabs
            value={activeTab}
            indicatorColor="primary"
            textColor="primary"
            onChange={(event, newValue) => setActiveTab(newValue)}
          >
            <Tab label="Opcoes" />
            {isSuperAdmin && <Tab label="Planos" />}
            {isSuperAdmin && <Tab label="Empresas" />}
          </Tabs>
        </Paper>

        {activeTab === 0 && (
          <>
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
                value={getSettingValue("userCreation")}
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
                label="Token API"
                margin="dense"
                variant="outlined"
                fullWidth
                value={getSettingValue("userApiToken")}
              />
            </Paper>

            <Paper className={classes.paper}>
              <Typography variant="body1">SLA - Escalonamento ativo</Typography>
              <Select
                margin="dense"
                variant="outlined"
                native
                id="slaEscalationEnabled-setting"
                name="slaEscalationEnabled"
                value={getSettingValue("slaEscalationEnabled") || "disabled"}
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
                defaultValue={getSettingValue("slaReplyMinutes") || "30"}
                onBlur={handleChangeSetting}
                className={classes.settingOption}
              />
            </Paper>

            <Paper className={classes.paper}>
              <Typography variant="body1">SLA - Fila de escalonamento</Typography>
              <Select
                margin="dense"
                variant="outlined"
                native
                id="slaEscalationQueueId-setting"
                name="slaEscalationQueueId"
                value={getSettingValue("slaEscalationQueueId") || ""}
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
          </>
        )}

        {isSuperAdmin && activeTab === 1 && (
          <>
            <Paper className={classes.sectionPaper}>
              <Typography variant="subtitle1" gutterBottom>
                {editingPlanId ? "Editar plano" : "Cadastrar plano"}
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Nome"
                    name="name"
                    value={planForm.name}
                    onChange={handlePlanFormChange}
                    variant="outlined"
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    label="Usuarios"
                    name="usersLimit"
                    value={planForm.usersLimit}
                    onChange={handlePlanFormChange}
                    variant="outlined"
                    type="number"
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    label="Conexoes"
                    name="connectionsLimit"
                    value={planForm.connectionsLimit}
                    onChange={handlePlanFormChange}
                    variant="outlined"
                    type="number"
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    label="Filas"
                    name="queuesLimit"
                    value={planForm.queuesLimit}
                    onChange={handlePlanFormChange}
                    variant="outlined"
                    type="number"
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    label="Valor"
                    name="price"
                    value={planForm.price}
                    onChange={handlePlanFormChange}
                    variant="outlined"
                    type="number"
                    fullWidth
                    size="small"
                  />
                </Grid>

                {["campaignsEnabled", "schedulesEnabled", "internalChatEnabled", "apiEnabled", "kanbanEnabled", "openAiEnabled", "integrationsEnabled", "internalUse", "isActive"].map(field => (
                  <Grid item xs={12} md={4} key={field}>
                    <TextField
                      select
                      SelectProps={{ native: true }}
                      variant="outlined"
                      size="small"
                      fullWidth
                      label={field}
                      name={field}
                      value={planForm[field]}
                      onChange={handlePlanFormChange}
                    >
                      <option value="true">Habilitado</option>
                      <option value="false">Desabilitado</option>
                    </TextField>
                  </Grid>
                ))}
              </Grid>

              <div className={classes.actionsRow}>
                <Button onClick={resetPlanForm}>Cancelar</Button>
                <Button variant="contained" color="primary" onClick={handleSubmitPlan}>
                  Salvar
                </Button>
              </div>
            </Paper>

            <Paper className={classes.sectionPaper}>
              <Typography variant="subtitle1" gutterBottom>
                Planos cadastrados
              </Typography>
              <div className={classes.tableWrapper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Nome</TableCell>
                      <TableCell>Usuarios</TableCell>
                      <TableCell>Conexoes</TableCell>
                      <TableCell>Filas</TableCell>
                      <TableCell>Valor</TableCell>
                      <TableCell align="center">Acoes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {plans.map(plan => (
                      <TableRow key={plan.id}>
                        <TableCell>{plan.id}</TableCell>
                        <TableCell>{plan.name}</TableCell>
                        <TableCell>{plan.usersLimit}</TableCell>
                        <TableCell>{plan.connectionsLimit}</TableCell>
                        <TableCell>{plan.queuesLimit}</TableCell>
                        <TableCell>{plan.price}</TableCell>
                        <TableCell align="center">
                          <IconButton size="small" onClick={() => handleEditPlan(plan)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeletePlan(plan.id)}
                          >
                            <DeleteOutlineIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Paper>
          </>
        )}

        {isSuperAdmin && activeTab === 2 && (
          <>
            <Paper className={classes.sectionPaper}>
              <Typography variant="subtitle1" gutterBottom>
                {editingCompanyId ? "Editar empresa" : "Cadastrar empresa"}
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Nome"
                    name="name"
                    value={companyForm.name}
                    onChange={handleCompanyFormChange}
                    variant="outlined"
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    select
                    SelectProps={{ native: true }}
                    label="Plano"
                    name="planId"
                    value={companyForm.planId}
                    onChange={handleCompanyFormChange}
                    variant="outlined"
                    fullWidth
                    size="small"
                  >
                    <option value="">Selecione</option>
                    {plans.map(plan => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    select
                    SelectProps={{ native: true }}
                    label="Status"
                    name="status"
                    value={companyForm.status}
                    onChange={handleCompanyFormChange}
                    variant="outlined"
                    fullWidth
                    size="small"
                  >
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Validade"
                    name="dueDate"
                    value={companyForm.dueDate}
                    onChange={handleCompanyFormChange}
                    variant="outlined"
                    type="date"
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                {!editingCompanyId && (
                  <>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Admin nome"
                        name="adminName"
                        value={companyForm.adminName}
                        onChange={handleCompanyFormChange}
                        variant="outlined"
                        fullWidth
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Admin email"
                        name="adminEmail"
                        value={companyForm.adminEmail}
                        onChange={handleCompanyFormChange}
                        variant="outlined"
                        fullWidth
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Admin senha"
                        name="adminPassword"
                        value={companyForm.adminPassword}
                        onChange={handleCompanyFormChange}
                        variant="outlined"
                        type="password"
                        fullWidth
                        size="small"
                      />
                    </Grid>
                  </>
                )}
              </Grid>

              <div className={classes.actionsRow}>
                <Button onClick={resetCompanyForm}>Cancelar</Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSubmitCompany}
                >
                  Salvar
                </Button>
              </div>
            </Paper>

            <Paper className={classes.sectionPaper}>
              <Typography variant="subtitle1" gutterBottom>
                Empresas cadastradas
              </Typography>
              <div className={classes.tableWrapper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Nome</TableCell>
                      <TableCell>Plano</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Validade</TableCell>
                      <TableCell>Admin</TableCell>
                      <TableCell align="center">Acoes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {companies.map(company => {
                      const adminUser = (company.users || []).find(
                        userItem => userItem.profile === "admin"
                      );

                      return (
                        <TableRow key={company.id}>
                          <TableCell>{company.id}</TableCell>
                          <TableCell>{company.name}</TableCell>
                          <TableCell>{company.plan?.name || "-"}</TableCell>
                          <TableCell>{company.status}</TableCell>
                          <TableCell>
                            {company.dueDate
                              ? formatDateInputValue(company.dueDate)
                              : "-"}
                          </TableCell>
                          <TableCell>{adminUser?.email || "-"}</TableCell>
                          <TableCell align="center">
                            <IconButton
                              size="small"
                              onClick={() => handleEditCompany(company)}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeactivateCompany(company.id)}
                            >
                              <DeleteOutlineIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Paper>
          </>
        )}
      </Container>
    </div>
  );
};

export default Settings;

